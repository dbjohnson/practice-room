import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { ProxyServer } from 'http-proxy-3';
import { installAuth, type AuthOptions } from './auth';
import { listWorkspaces, validId, type Workspace } from './registry';
import { workspaceSnapshot, devAssetCache } from './devAssets';
import { escapeHtml, page } from './pages';

export function createGateway(
  options: AuthOptions & {
    root: string;
    registry: string;
    list?: () => Promise<Workspace[]>;
    /** The app's own routes, served to signed-in users under /api. */
    api?: express.RequestHandler;
  },
) {
  const { config } = options;
  const app = express();
  app.disable('x-powered-by');
  const list = options.list ?? (() => listWorkspaces(options.registry));
  app.use((request, response, next) => {
    const host = request.headers.host;
    if (
      ![
        new URL(config.origin).host,
        `127.0.0.1:${config.port}`,
        `localhost:${config.port}`,
      ].includes(host ?? '')
    ) {
      response.status(400).send('Unknown host.');
      return;
    }
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.get('/health', (_request, response) => response.json({ app: config.slug, status: 'ok' }));
  const auth = installAuth(app, options);
  app.use((request, response, next) => {
    if (auth.requireUser(request, response)) next();
  });
  app.use(['/dev', '/__workspace/builds'], (request, response, next) => {
    if (!auth.developer(request)) {
      response.status(403).send('Developer access is required.');
      return;
    }
    next();
  });
  app.get('/__workspace/builds', async (_request, response) => {
    response.json(
      (await list()).map(({ id, branch, startedAt }) => ({
        id,
        branch,
        startedAt,
        url: `/dev/use/${id}`,
      })),
    );
  });
  app.get('/dev', async (_request, response) => {
    const rows = (await list())
      .map(
        (workspace) =>
          `<li><a href="/dev/use/${workspace.id}">${escapeHtml(workspace.branch)}</a><small>Started ${escapeHtml(workspace.startedAt)}</small></li>`,
      )
      .join('');
    response
      .type('html')
      .send(
        page(
          `${config.name} · Dev builds`,
          `<h1>Dev builds</h1><p>${escapeHtml(config.name)}</p><a href="/dev/use/production">Open production</a><ul>${rows || '<li>No dev builds are running.</li>'}</ul>`,
        ),
      );
  });
  app.get('/dev/use/:id', async (request, response) => {
    if (request.params.id === 'production') {
      response.redirect('/');
      return;
    }
    if ((await list()).some((workspace) => workspace.id === request.params.id)) {
      response.redirect(`/dev/build/${request.params.id}/`);
      return;
    }
    response
      .status(404)
      .type('html')
      .send(
        page(
          'Build unavailable',
          '<h1>This build is not running.</h1><p><a href="/dev">View running builds</a></p>',
        ),
      );
  });
  const assetWorkspaces = workspaceSnapshot(list);
  const find = async (url: string) => {
    const id = /^\/dev\/build\/([^/?]+)(?:\/|$)/.exec(url)?.[1];
    return id && validId(id)
      ? (await assetWorkspaces()).find((workspace) => workspace.id === id)
      : undefined;
  };
  const proxy = new ProxyServer({ changeOrigin: true, ws: true });
  proxy.on('proxyRes', (response, request) => {
    response.headers['cache-control'] = devAssetCache(
      request.url ?? '/',
      String(response.headers['content-type'] ?? ''),
      String(response.headers['cache-control'] ?? ''),
      response.statusCode ?? 500,
    );
    delete response.headers['set-cookie'];
  });
  const stripCredentials = (headers: Record<string, unknown>) => {
    for (const key of Object.keys(headers))
      if (
        ['cookie', 'authorization', 'forwarded', 'x-real-ip'].includes(key) ||
        key.startsWith('x-forwarded-') ||
        key.startsWith('x-workspace-')
      )
        delete headers[key];
  };
  app.use('/dev/build', async (request, response) => {
    const workspace = await find(request.originalUrl);
    if (!workspace) {
      response.status(503).send('This dev build stopped. Open /dev to choose another build.');
      return;
    }
    request.url = request.originalUrl;
    stripCredentials(request.headers);
    proxy.web(request, response, { target: `http://127.0.0.1:${workspace.port}` }, () => {
      if (!response.headersSent) response.status(502).send('The dev build is not responding.');
      else response.destroy();
    });
  });
  app.use('/dev', (_request, response) => {
    response.status(404).send('Unknown dev route.');
  });
  if (options.api) app.use('/api', options.api);
  const staticRoot = resolve(options.root, config.staticDir);
  app.use(
    express.static(staticRoot, {
      dotfiles: 'deny',
      index: 'index.html',
      etag: false,
      lastModified: false,
    }),
  );
  app.get('/', (_request, response) =>
    response.status(503).send('Build the app with npm run build before starting this server.'),
  );
  app.use((_request, response) => {
    response.status(404).send('Not found.');
  });
  app.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next; // Express recognizes error handlers by their four-argument signature.
      response.status(503).send('The service is temporarily unavailable. Please try again.');
    },
  );
  const server = createServer(app);
  server.on('upgrade', async (request, socket, head) => {
    if (request.headers.origin !== config.origin || !auth.developer(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const workspace = await find(request.url ?? '');
    if (!workspace) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    stripCredentials(request.headers);
    proxy.ws(request, socket, head, { target: `http://127.0.0.1:${workspace.port}` }, () =>
      socket.destroy(),
    );
  });
  server.on('close', () => proxy.close());
  return server;
}
