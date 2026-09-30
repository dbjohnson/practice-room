import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadConfig } from './config';

const kitRoot = fileURLToPath(new URL('../../', import.meta.url));
export const managed = [
  'workspace-kit.json',
  'src/platform',
  'src/workspace',
  'docs/workspaces.md',
  '.agents/skills/link',
  '.agents/skills/rebase',
  '.agents/skills/rebuild',
  '.agents/skills/wrapup',
  '.agents/skills/workspace',
];
export const dependencies = ['express', 'openid-client', 'http-proxy-3', 'tsx'];
export const devDependencies = ['@types/express', '@types/node', 'typescript'];

export function adopt(
  options: {
    target: string;
    name: string;
    slug: string;
    origin: string;
    port: number;
    write?: boolean;
  },
  source = kitRoot,
) {
  const root = resolve(options.target);
  if (root === source || !existsSync(resolve(root, 'package.json')))
    throw new Error('Choose another existing Vite project with package.json.');
  const packagePath = resolve(root, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (pkg.type !== 'module' || !pkg.scripts?.dev || !pkg.scripts?.build)
    throw new Error('This starter requires an ESM Vite app with dev and build scripts.');
  const configPath = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'].find((name) =>
    existsSync(resolve(root, name)),
  );
  if (!configPath) throw new Error('A Vite configuration is required.');
  const viteText = readFileSync(resolve(root, configPath), 'utf8');
  const tree = ts.createSourceFile(configPath, viteText, ts.ScriptTarget.Latest, true);
  const exported = tree.statements.find(ts.isExportAssignment);
  if (
    !exported ||
    exported.isExportEquals ||
    !(ts.isObjectLiteralExpression(exported.expression) || ts.isCallExpression(exported.expression))
  )
    throw new Error('Use an object or defineConfig(...) default export in the Vite config.');
  if (viteText.includes('workspaceViteConfig') || viteText.includes('workspaceMergeConfig'))
    throw new Error('Workspace Vite integration already exists.');
  const servicePath = `deploy/${options.slug}.service.example`;
  for (const path of [...managed, 'workspace.config.json', '.env.example', servicePath])
    if (existsSync(resolve(root, path)))
      throw new Error(`Refusing to overwrite ${path}. Reconcile existing files first.`);
  for (const path of managed)
    if (!existsSync(resolve(source, path))) throw new Error(`Starter source is missing ${path}.`);
  const config = {
    ...loadConfig(source),
    name: options.name,
    slug: options.slug,
    origin: options.origin,
    port: options.port,
    devPortStart: options.port + 10,
  };
  if (
    !/^[a-z][a-z0-9-]{1,48}$/.test(config.slug) ||
    !config.name.trim() ||
    !Number.isInteger(config.port) ||
    config.port < 1024 ||
    config.port > 64800 ||
    new URL(config.origin).origin !== config.origin ||
    !config.origin.startsWith('https://')
  )
    throw new Error('Provide a name, slug, HTTPS origin and port between 1024 and 64800.');
  const sourcePackage = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'));
  pkg.engines ??= {};
  pkg.engines.node ??= '>=22.12.0';
  for (const key of ['start', 'workspace', 'workspace:adopt']) {
    if (pkg.scripts[key] && pkg.scripts[key] !== sourcePackage.scripts[key])
      throw new Error(`Existing npm script ${key} needs manual reconciliation.`);
    pkg.scripts[key] = sourcePackage.scripts[key];
  }
  pkg.scripts.check ??= ['lint', 'test', 'build']
    .filter((name) => pkg.scripts[name])
    .map((name) => `npm run ${name}`)
    .join(' && ');
  for (const [field, names] of [
    ['dependencies', dependencies],
    ['devDependencies', devDependencies],
  ] as const) {
    pkg[field] ??= {};
    for (const name of names) pkg[field][name] ??= sourcePackage[field][name];
  }
  const expression = exported.expression;
  const vite =
    `import { mergeConfig as workspaceMergeConfig } from 'vite';\nimport { workspaceViteConfig } from './src/platform/vite';\n` +
    viteText.slice(0, expression.getStart(tree)) +
    `workspaceMergeConfig(${expression.getText(tree)}, workspaceViteConfig())` +
    viteText.slice(expression.end);
  const planned = [
    ...managed,
    'workspace.config.json',
    '.env.example',
    servicePath,
    'package.json',
    configPath,
    '.gitignore',
    'AGENTS.md',
  ];
  if (!options.write) return planned;
  for (const path of managed) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    cpSync(resolve(source, path), resolve(root, path), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  writeFileSync(resolve(root, 'workspace.config.json'), JSON.stringify(config, null, 2) + '\n');
  mkdirSync(resolve(root, 'deploy'), { recursive: true });
  writeFileSync(
    resolve(root, servicePath),
    `[Unit]
Description=${config.name.replace(/[\r\n]/g, ' ').replaceAll('%', '%%')} authenticated web gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${JSON.stringify(root).replaceAll('%', '%%')}
ExecStart=/usr/bin/node --import tsx src/platform/serve.ts
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
LimitCORE=0

[Install]
WantedBy=default.target
`,
  );
  writeFileSync(
    resolve(root, '.env.example'),
    `GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGOOGLE_ALLOWED_EMAILS=\nDEV_ALLOWED_EMAILS=\n# Register ${options.origin}/auth/google/callback in Google Cloud.\n`,
  );
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(resolve(root, configPath), vite);
  const append = (path: string, text: string) =>
    writeFileSync(
      resolve(root, path),
      (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '') + text,
    );
  append(
    '.gitignore',
    '\n# Workspace kit local state\n.env\n.env.*\n!.env.example\n.dev-workspace/\n.worktrees/\n',
  );
  append(
    'AGENTS.md',
    '\n## Development workspaces\n\nUse the workflow in [docs/workspaces.md](docs/workspaces.md). Start new work on a descriptive feature branch and worktree with `npm run workspace -- new <name>`. Reuse an existing session branch with `npm run workspace -- start`. Share the verified build link promptly. Keep production service changes separate from development; deploy only when authorized. Use the repo-local workspace, link, rebase, rebuild and wrapup skills.\n',
  );
  return planned;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name: string) => args[args.indexOf(name) + 1];
  if (args.includes('--help') || !args.includes('--target'))
    console.log(
      'Usage: npm run workspace:adopt -- --target ../app --name "App name" --slug app-name --origin https://app.example --port 8300 [--write]\nWithout --write, validates and lists changes. After writing, run npm install in the target. See docs/workspaces.md for the optional account/storage UI adapter.',
    );
  else {
    try {
      for (const name of ['--name', '--slug', '--origin', '--port'])
        if (!args.includes(name)) throw new Error(`Missing ${name}.`);
      const files = adopt({
        target: value('--target'),
        name: value('--name'),
        slug: value('--slug'),
        origin: value('--origin'),
        port: Number(value('--port')),
        write: args.includes('--write'),
      });
      console.log(`${args.includes('--write') ? 'Wrote' : 'Would write'}:\n${files.join('\n')}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Adoption failed.');
      process.exitCode = 1;
    }
  }
}
