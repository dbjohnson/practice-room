import type { RequestHandler } from 'express';
import type { Plugin } from 'vite';

/**
 * Serves the app's API from the Vite dev server, at the same path the gateway uses in
 * production. The module is loaded through Vite so server edits apply without a restart.
 */
export function devApi(): Plugin {
  return {
    name: 'practice-room-api',
    apply: 'serve',
    configureServer(server) {
      const base = server.config.base.startsWith('/') ? server.config.base : '/';
      let loaded: { module: unknown; handler: RequestHandler } | null = null;
      server.middlewares.use(`${base}api`, async (request, response, next) => {
        try {
          const module = await server.ssrLoadModule('/src/server/api.ts');
          if (loaded?.module !== module) loaded = { module, handler: module.createApi() };
          loaded.handler(request as never, response as never, next);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
