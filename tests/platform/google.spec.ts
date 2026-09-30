import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as oidc from 'openid-client';
import { googleProvider } from '../../src/platform/google';

vi.mock('openid-client', async (original) => ({
  ...(await original<typeof import('openid-client')>()),
  discovery: vi.fn(async () => ({})),
  enableNonRepudiationChecks: vi.fn(),
  buildAuthorizationUrl: vi.fn(
    (_config, parameters) =>
      new URL('https://accounts.google.com/auth?' + new URLSearchParams(parameters)),
  ),
  authorizationCodeGrant: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

describe('Google identity validation', () => {
  it('uses state, nonce, PKCE, signature checks and the configured callback', async () => {
    const provider = googleProvider('client-id', 'client-secret', 'https://app.example');
    const authorization = await provider.begin();
    const params = new URL(authorization.url).searchParams;
    expect(params.get('redirect_uri')).toBe('https://app.example/auth/google/callback');
    expect(params.get('state')).toBe(authorization.state);
    expect(params.get('nonce')).toBe(authorization.nonce);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBe(
      await oidc.calculatePKCECodeChallenge(authorization.verifier),
    );
    expect(oidc.enableNonRepudiationChecks).toHaveBeenCalled();
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
      claims: () => ({
        sub: '123',
        email: 'Owner@Example.Test',
        email_verified: true,
        name: 'Owner',
      }),
    } as never);
    expect(
      await provider.complete(
        new URL('https://app.example/auth/google/callback?code=test'),
        authorization,
      ),
    ).toEqual({ subject: '123', email: 'owner@example.test', name: 'Owner' });
    expect(oidc.authorizationCodeGrant).toHaveBeenCalledWith(expect.anything(), expect.any(URL), {
      pkceCodeVerifier: authorization.verifier,
      expectedState: authorization.state,
      expectedNonce: authorization.nonce,
      idTokenExpected: true,
    });
  });
  it.each([false, 'true', undefined])('refuses an unverified email (%s)', async (verified) => {
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
      claims: () => ({ sub: '123', email: 'owner@example.test', email_verified: verified }),
    } as never);
    const provider = googleProvider('client-id', 'client-secret', 'https://app.example');
    await expect(
      provider.complete(
        new URL('https://app.example/auth/google/callback'),
        await provider.begin(),
      ),
    ).rejects.toThrow('verified');
  });
});
