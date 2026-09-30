import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { loadConfig, repository, git } from './config';
import { register, unregister, workspaceId, type Workspace } from './registry';

// Detached supervisor owns its child and handles stop requests itself. The CLI
// never signals a stored PID, which may have been reused since a previous run.
const repo = repository(process.argv[2]);
const config = loadConfig(repo.root);
const branch = git(repo.root, 'branch', '--show-current');
const port = Number(process.argv[3]);
if (
  !branch ||
  branch === config.baseBranch ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error('A feature branch and a valid dev port are required.');
const id = workspaceId(repo.root, branch);
const token = randomBytes(32).toString('base64url');
let workspace: Workspace | undefined;
let stopping = false;
const command = config.devCommand.map((part) => part.replaceAll('{port}', String(port)));
const child = spawn(command[0], command.slice(1), {
  cwd: repo.root,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    WORKSPACE_ID: id,
    WORKSPACE_BASE: `/dev/build/${id}/`,
    VITE_WORKSPACE_ID: id,
    WORKSPACE_RUN_TOKEN: token,
  },
});
const stop = () => {
  if (stopping) return;
  stopping = true;
  if (workspace) unregister(repo.registry, workspace);
  control.close();
  // This supervisor is the leader of its own detached process group.
  process.kill(-process.pid, 'SIGTERM');
  setTimeout(() => process.kill(-process.pid, 'SIGKILL'), 3000).unref();
};
const control = createServer((request, response) => {
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(request.headers.authorization ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.writeHead(403).end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id, pid: process.pid }));
  } else if (request.method === 'POST' && request.url === '/stop') {
    response.end('Stopping');
    setImmediate(stop);
  } else response.writeHead(404).end();
});
child.on('error', stop);
child.on('exit', () => {
  if (!stopping) stop();
  process.exitCode = 0;
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    if (!stopping) stop();
  });
control.listen(0, '127.0.0.1', async () => {
  const address = control.address();
  if (!address || typeof address === 'string') throw new Error('No control port.');
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/dev/build/${id}/__workspace/ready`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(500),
        redirect: 'error',
      });
      if (
        response.ok &&
        (await response.json()).id === id &&
        child.exitCode === null &&
        !stopping
      ) {
        workspace = {
          id,
          branch,
          root: repo.root,
          port,
          controlPort: address.port,
          pid: process.pid,
          token,
          startedAt: new Date().toISOString(),
        };
        register(repo.registry, workspace);
        return;
      }
    } catch {
      /* Wait for the child server to bind its port. */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  console.error('The dev server did not become ready.');
  stop();
});
