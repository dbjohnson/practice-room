import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Server } from 'node:http';
import { createGateway } from '../../src/platform/gateway';
import { Sessions, token } from '../../src/platform/sessions';
import type { GoogleProvider } from '../../src/platform/google';
import type { Workspace } from '../../src/platform/registry';
import type { WorkspaceConfig } from '../../src/platform/config';

export async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  return address.port;
}
export async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}

export async function gatewayFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'workspace-gateway-'));
  mkdirSync(resolve(root, 'dist'));
  writeFileSync(resolve(root, 'dist', 'index.html'), '<h1>Protected app</h1>');
  writeFileSync(resolve(root, 'dist', 'asset.js'), 'console.log("protected")');
  const config: WorkspaceConfig = {
    version: 1,
    name: 'Test app',
    slug: 'test-app',
    origin: 'http://127.0.0.1:8200',
    port: 8200,
    devPortStart: 8210,
    baseBranch: 'main',
    staticDir: 'dist',
    devCommand: ['npm', 'run', 'dev'],
    installCommand: ['npm', 'ci'],
  };
  const user = { subject: 'google-123', email: 'owner@example.test', name: 'Test Owner' };
  const sessions = new Sessions();
  const workspaces: Workspace[] = [];
  const provider: GoogleProvider = {
    async begin() {
      const state = token();
      return {
        state,
        verifier: token(),
        nonce: token(),
        url: `https://accounts.google.com/auth?state=${state}`,
      };
    },
    async complete() {
      return user;
    },
  };
  const server = createGateway({
    root,
    config,
    registry: root,
    sessions,
    provider,
    allowedEmails: new Set([user.email, 'member@example.test']),
    developerEmails: new Set([user.email]),
    list: async () => workspaces,
    api: (request, response) => response.json({ path: request.url }),
  });
  config.port = await listen(server);
  config.origin = `http://127.0.0.1:${config.port}`;
  const request = (path: string, init?: RequestInit) =>
    fetch(config.origin + path, { redirect: 'manual', ...init });
  const signIn = async (returnTo = '/') => {
    const start = await request(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
    const login = start.headers.get('set-cookie')!.split(';')[0];
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const callback = `/auth/google/callback?state=${state}&code=test-code`;
    const answer = await request(callback, { headers: { cookie: login } });
    return {
      answer,
      cookie: answer.headers
        .get('set-cookie')!
        .split(', ')
        .find((part) => part.startsWith('test-app-session='))!
        .split(';')[0],
      callback,
      login,
    };
  };
  return {
    config,
    root,
    server,
    sessions,
    provider,
    user,
    workspaces,
    request,
    signIn,
    async dispose() {
      await close(server);
      rmSync(root, { recursive: true });
    },
  };
}
