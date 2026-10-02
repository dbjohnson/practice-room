import { initializeWorkspace } from '../workspace/client';

export async function initializeSession() {
  // Direct local Vite runs have no Google session. Hosted builds still use the
  // gateway session, even though their assets are served by a dev server.
  if (
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ) {
    return;
  }
  await initializeWorkspace();
}
