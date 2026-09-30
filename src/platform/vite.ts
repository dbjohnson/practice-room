import { resolve } from 'node:path';
import type { UserConfig } from 'vite';

export function workspaceViteConfig(): UserConfig {
  const base = process.env.WORKSPACE_BASE || './';
  return {
    base,
    plugins: [
      {
        name: 'workspace-isolation',
        // Anchor to this project's root: when it is itself `.worktrees/<name>`, an
        // unanchored `**/.worktrees/**` would match every file it owns.
        config(user) {
          const root = resolve(user.root ?? process.cwd());
          return {
            server: {
              watch: { ignored: [`${root}/.worktrees/**`, `${root}/.dev-workspace/**`] },
              fs: {
                deny: [
                  '.env',
                  '.env.*',
                  '*.{crt,pem}',
                  '**/.git/**',
                  `${root}/.dev-workspace/**`,
                  `${root}/.worktrees/**`,
                  `${root}/src/platform/**`,
                ],
              },
            },
          };
        },
      },
      {
        name: 'workspace-readiness',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!process.env.WORKSPACE_ID || request.url !== `${base}__workspace/ready`) {
              next();
              return;
            }
            if (request.headers.authorization !== `Bearer ${process.env.WORKSPACE_RUN_TOKEN}`) {
              response.writeHead(403).end();
              return;
            }
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ id: process.env.WORKSPACE_ID }));
          });
        },
      },
    ],
  };
}
