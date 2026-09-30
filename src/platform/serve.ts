import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { emails, loadConfig, repository } from './config';
import { googleProvider } from './google';
import { Sessions } from './sessions';
import { createGateway } from './gateway';

const repo = repository();
if (existsSync(resolve(repo.root, '.env'))) loadEnvFile(resolve(repo.root, '.env'));
const config = loadConfig(repo.root);
const allowedEmails = emails(process.env.GOOGLE_ALLOWED_EMAILS);
const developerEmails = emails(process.env.DEV_ALLOWED_EMAILS);
if (!allowedEmails.size)
  throw new Error('GOOGLE_ALLOWED_EMAILS is empty; access is denied until configured.');
if ([...developerEmails].some((email) => !allowedEmails.has(email)))
  throw new Error('Every developer must also appear in GOOGLE_ALLOWED_EMAILS.');
const server = createGateway({
  ...repo,
  config,
  allowedEmails,
  developerEmails,
  provider: googleProvider(
    process.env.GOOGLE_CLIENT_ID ?? '',
    process.env.GOOGLE_CLIENT_SECRET ?? '',
    config.origin,
  ),
  sessions: new Sessions(resolve(repo.common, 'workspace-kit', 'sessions.json')),
});
server.listen(config.port, '127.0.0.1', () =>
  console.log(`${config.name}: http://127.0.0.1:${config.port} (public: ${config.origin})`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => server.close(() => process.exit(0)));
