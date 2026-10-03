import type { Express, Request, Response } from 'express';
import { cookie, digest, localReturn, Sessions, SESSION_LIFETIME_MS } from './sessions';
import type { Authorization, GoogleProvider } from './google';
import { escapeHtml, page } from './pages';
import type { WorkspaceConfig } from './config';

export interface AuthOptions {
  config: WorkspaceConfig;
  sessions: Sessions;
  provider: GoogleProvider;
  allowedEmails: Set<string>;
  developerEmails: Set<string>;
}

export function installAuth(app: Express, options: AuthOptions) {
  const { config, sessions, provider, allowedEmails, developerEmails } = options;
  const secure = config.origin.startsWith('https:');
  const prefix = `${secure ? '__Host-' : ''}${config.slug}`;
  const sessionCookie = `${prefix}-session`;
  const loginCookie = `${prefix}-login`;
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  const pending = new Map<string, Authorization & { returnTo: string; expires: number }>();
  const session = (request: Pick<Request, 'headers'>) => {
    const found = sessions.get(cookie(request.headers.cookie, sessionCookie));
    return found && allowedEmails.has(found.user.email) ? found : null;
  };
  const developer = (request: Pick<Request, 'headers'>) => {
    const found = session(request);
    return !!found && developerEmails.has(found.user.email);
  };
  const requireUser = (request: Request, response: Response) => {
    if (session(request)) return true;
    if (request.path.startsWith('/__workspace/') || request.path.startsWith('/api/'))
      response.status(401).json({ error: 'Sign in required.' });
    else
      response.redirect(`/login?returnTo=${encodeURIComponent(localReturn(request.originalUrl))}`);
    return false;
  };

  app.get('/login', (request, response) => {
    const returnTo = localReturn(request.query.returnTo);
    response
      .type('html')
      .send(
        page(
          `Sign in · ${config.name}`,
          `<p>${escapeHtml(config.name)}</p><h1>Welcome to your room.</h1><p>Sign in with your approved Google account to continue.</p><a class="button" href="/auth/google?returnTo=${encodeURIComponent(returnTo)}">Sign in with Google</a>`,
        ),
      );
  });
  app.get('/auth/google', async (request, response) => {
    for (const [key, value] of pending) if (value.expires <= Date.now()) pending.delete(key);
    if (pending.size >= 500) {
      response.status(429).send('Please try signing in again shortly.');
      return;
    }
    const authorization = await provider.begin();
    pending.set(authorization.state, {
      ...authorization,
      returnTo: localReturn(request.query.returnTo),
      expires: Date.now() + 600_000,
    });
    response.cookie(loginCookie, authorization.state, { ...cookieOptions, maxAge: 600_000 });
    response.redirect(authorization.url);
  });
  app.get('/auth/google/callback', async (request, response) => {
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const saved = pending.get(state);
    const bound = cookie(request.headers.cookie, loginCookie);
    if (!saved || saved.expires <= Date.now() || !state || bound !== state) {
      response
        .status(400)
        .send('Sign-in expired or did not start in this browser. Please sign in again.');
      return;
    }
    pending.delete(state);
    response.clearCookie(loginCookie, cookieOptions);
    try {
      const user = await provider.complete(new URL(request.originalUrl, config.origin), saved);
      if (!allowedEmails.has(user.email)) {
        response.status(403).send('This Google account does not have access.');
        return;
      }
      sessions.remove(cookie(request.headers.cookie, sessionCookie));
      response.cookie(sessionCookie, sessions.create(user), {
        ...cookieOptions,
        maxAge: SESSION_LIFETIME_MS,
      });
      response.redirect(saved.returnTo);
    } catch {
      response.status(400).send('Google sign-in could not be verified. Please sign in again.');
    }
  });
  app.post('/auth/logout', (request, response) => {
    const current = session(request);
    if (
      !current ||
      request.get('origin') !== config.origin ||
      request.get('x-csrf-token') !== current.csrf
    ) {
      response.status(403).json({ error: 'Sign out from the application.' });
      return;
    }
    sessions.remove(cookie(request.headers.cookie, sessionCookie));
    response.clearCookie(sessionCookie, cookieOptions);
    response.status(204).end();
  });
  app.get('/__workspace/session', (request, response) => {
    if (!requireUser(request, response)) return;
    const current = session(request)!;
    response.json({
      user: { name: current.user.name, email: current.user.email },
      storageId: digest(`${config.slug}:${current.user.subject}`).slice(0, 32),
      developer: developer(request),
      csrf: current.csrf,
    });
  });
  return { session, developer, requireUser };
}
