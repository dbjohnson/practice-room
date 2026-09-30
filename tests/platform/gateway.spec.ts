import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { gatewayFixture, listen, close } from './gatewayFixture';

let fixture: Awaited<ReturnType<typeof gatewayFixture>>;
beforeEach(async () => {
  fixture = await gatewayFixture();
});
afterEach(async () => {
  await fixture.dispose();
});

describe('Google-protected app gateway', () => {
  it('protects the app, assets, workspace directory and session endpoint', async () => {
    for (const path of ['/', '/asset.js', '/dev/', '/dev/build/test/']) {
      const response = await fixture.request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toMatch(/^\/login\?/);
    }
    expect((await fixture.request('/__workspace/session')).status).toBe(401);
    expect((await fixture.request('/health')).status).toBe(200);
    const status = await new Promise<number | undefined>((done, reject) => {
      const request = httpRequest(
        fixture.config.origin,
        { headers: { host: 'untrusted.example' } },
        (response) => {
          response.resume();
          done(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(status).toBe(400);
  });

  it('requires the browser-bound state and rejects callback replay', async () => {
    const start = await fixture.request('/auth/google');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    expect((await fixture.request(`/auth/google/callback?state=${state}&code=x`)).status).toBe(400);
    const signed = await fixture.signIn('/dev/use/my-build');
    expect(signed.answer.status).toBe(302);
    expect(signed.answer.headers.get('location')).toBe('/dev/use/my-build');
    expect(signed.answer.headers.get('set-cookie')).toContain('HttpOnly');
    expect(signed.answer.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(
      (await fixture.request(signed.callback, { headers: { cookie: signed.login } })).status,
    ).toBe(400);
  });

  it('rejects an unapproved Google account and does not issue a session', async () => {
    fixture.user.email = 'outsider@example.test';
    const start = await fixture.request('/auth/google');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const response = await fixture.request(`/auth/google/callback?state=${state}&code=x`, {
      headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).not.toContain('test-app-session');
  });

  it('keeps redirects local and separates member access from developer access', async () => {
    fixture.user.email = 'member@example.test';
    const signed = await fixture.signIn('//untrusted.example');
    expect(signed.answer.headers.get('location')).toBe('/');
    const headers = { cookie: signed.cookie };
    expect((await fixture.request('/', { headers })).status).toBe(200);
    for (const path of ['/dev/', '/dev/use/production', '/__workspace/builds', '/dev/build/test/'])
      expect((await fixture.request(path, { headers })).status).toBe(403);
    const session = await (await fixture.request('/__workspace/session', { headers })).json();
    expect(session.developer).toBe(false);
    expect(session.storageId).toMatch(/^[a-f0-9]{32}$/);
    expect(session).not.toHaveProperty('subject');
  });

  it('requires same-origin CSRF protection for logout and revokes the session', async () => {
    const { cookie } = await fixture.signIn();
    const session = await (
      await fixture.request('/__workspace/session', { headers: { cookie } })
    ).json();
    expect(
      (await fixture.request('/auth/logout', { method: 'POST', headers: { cookie } })).status,
    ).toBe(403);
    expect(
      (
        await fixture.request('/auth/logout', {
          method: 'POST',
          headers: { cookie, origin: 'https://evil.example', 'x-csrf-token': session.csrf },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.request('/auth/logout', {
          method: 'POST',
          headers: { cookie, origin: fixture.config.origin, 'x-csrf-token': session.csrf },
        })
      ).status,
    ).toBe(204);
    expect((await fixture.request('/__workspace/session', { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it('routes a running build, strips credentials and does not silently switch a stopped build to production', async () => {
    const upstream = createServer((request, response) => {
      response.setHeader('set-cookie', 'test-app-session=forged');
      response.setHeader('cache-control', 'public, max-age=999');
      response.end(
        JSON.stringify({
          url: request.url,
          cookie: request.headers.cookie,
          authorization: request.headers.authorization,
          forwarded: request.headers['x-forwarded-for'],
        }),
      );
    });
    const port = await listen(upstream);
    fixture.workspaces.push({
      id: 'my-build',
      branch: 'dev/my-build',
      root: '/private/worktree',
      port,
      controlPort: 9999,
      token: 'private-token',
      pid: 123,
      startedAt: '2026-09-30',
    });
    try {
      const { cookie } = await fixture.signIn();
      const headers = {
        cookie,
        authorization: 'Bearer browser-secret',
        'x-forwarded-for': 'untrusted',
      };
      const build = await fixture.request('/dev/use/my-build', { headers });
      expect(build.headers.get('location')).toBe('/dev/build/my-build/');
      const response = await fixture.request('/dev/build/my-build/file.js?q=1', { headers });
      expect(await response.json()).toEqual({ url: '/dev/build/my-build/file.js?q=1' });
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const listed = await (await fixture.request('/__workspace/builds', { headers })).text();
      expect(listed).not.toMatch(/private-token|private\/worktree|controlPort|pid/);
      fixture.workspaces.length = 0;
      expect((await fixture.request('/dev/build/my-build/', { headers })).status).toBe(503);
    } finally {
      await close(upstream);
    }
  });

  it('rejects unauthenticated or cross-origin websocket upgrades', async () => {
    const { cookie } = await fixture.signIn();
    for (const headers of [
      { origin: fixture.config.origin },
      { cookie, origin: 'https://evil.example' },
    ]) {
      const status = await new Promise<number | undefined>((done, reject) => {
        const request = httpRequest(fixture.config.origin + '/dev/build/test/hmr', {
          headers: {
            ...headers,
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'sec-websocket-version': '13',
          },
        });
        request.on('response', (response) => {
          response.resume();
          done(response.statusCode);
        });
        request.on('error', reject);
        request.end();
      });
      expect(status).toBe(403);
    }
  });
  it('forwards an authorized HMR websocket without the session cookie', async () => {
    let forwardedCookie: string | undefined;
    const upstream = createServer();
    upstream.on('upgrade', (request, socket) => {
      forwardedCookie = request.headers.cookie;
      const accept = createHash('sha1')
        .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.end(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
    });
    const port = await listen(upstream);
    fixture.workspaces.push({
      id: 'hmr-build',
      branch: 'dev/hmr',
      root: '/test',
      port,
      controlPort: 9999,
      token: 'private-token',
      pid: 123,
      startedAt: 'now',
    });
    try {
      const { cookie } = await fixture.signIn();
      const status = await new Promise<number | undefined>((done, reject) => {
        const request = httpRequest(fixture.config.origin + '/dev/build/hmr-build/hmr', {
          headers: {
            cookie,
            origin: fixture.config.origin,
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'sec-websocket-version': '13',
          },
        });
        request.on('upgrade', (response, socket) => {
          socket.destroy();
          done(response.statusCode);
        });
        request.on('response', (response) => {
          response.resume();
          done(response.statusCode);
        });
        request.on('error', reject);
        request.end();
      });
      expect(status).toBe(101);
      expect(forwardedCookie).toBeUndefined();
    } finally {
      await close(upstream);
    }
  });
});
