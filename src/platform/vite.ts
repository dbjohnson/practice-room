import type { UserConfig } from 'vite';

export function workspaceViteConfig(): UserConfig {
  const base = process.env.WORKSPACE_BASE || './';
  return {
    base,
    plugins: [
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
    server: {
      watch: { ignored: ['**/.worktrees/**', '**/.dev-workspace/**'] },
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          '**/.dev-workspace/**',
          '**/.worktrees/**',
          '**/src/platform/**',
        ],
      },
    },
  };
}
