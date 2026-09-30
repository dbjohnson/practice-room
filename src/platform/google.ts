import * as oidc from 'openid-client';
import type { Identity } from './sessions';

export interface Authorization {
  state: string;
  verifier: string;
  nonce: string;
  url: string;
}
export interface GoogleProvider {
  begin(): Promise<Authorization>;
  complete(url: URL, pending: Authorization): Promise<Identity>;
}

export function googleProvider(
  clientId: string,
  clientSecret: string,
  origin: string,
): GoogleProvider {
  if (!clientId || !clientSecret)
    throw new Error('Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  let configuration: Promise<oidc.Configuration> | undefined;
  const config = () =>
    (configuration ??= oidc
      .discovery(new URL('https://accounts.google.com'), clientId, clientSecret)
      .then((value) => {
        oidc.enableNonRepudiationChecks(value);
        return value;
      })
      .catch((error) => {
        configuration = undefined;
        throw error;
      }));
  return {
    async begin() {
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(await config(), {
        redirect_uri: `${origin}/auth/google/callback`,
        scope: 'openid email profile',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
        prompt: 'select_account',
      });
      return { verifier, state, nonce, url: url.href };
    },
    async complete(url, pending) {
      const result = await oidc.authorizationCodeGrant(await config(), url, {
        pkceCodeVerifier: pending.verifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      const claims = result.claims();
      if (!claims?.sub || typeof claims.email !== 'string' || claims.email_verified !== true)
        throw new Error('A verified Google email is required.');
      return {
        subject: claims.sub,
        email: claims.email.toLowerCase(),
        name: typeof claims.name === 'string' ? claims.name : claims.email,
      };
    },
  };
}
