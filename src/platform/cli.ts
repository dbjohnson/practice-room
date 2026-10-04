import { cleanupCandidates, cleanupWorkspaces } from './cleanup';
import { resolve } from 'node:path';
import { git, loadConfig, repository } from './config';
import { readWorkspace, running, listWorkspaces } from './registry';
import { newWorktree, startWorkspace, stopWorkspace } from './workspaces';

async function main() {
  const repo = repository();
  const config = loadConfig(repo.root);
  const [command = 'status', name] = process.argv.slice(2);
  const show = (workspace: { id: string; port: number; branch: string; root: string }) => {
    console.log(
      `Branch: ${workspace.branch}\nWorktree: ${workspace.root}\nBuild link: ${config.origin}/dev/use/${workspace.id}\nLocal: http://127.0.0.1:${workspace.port}/dev/build/${workspace.id}/`,
    );
  };
  if (['new', 'start', 'restart'].includes(command)) {
    try {
      const merged = cleanupCandidates(repo.root).filter((item) => item.removable);
      if (merged.length)
        console.warn(
          `Merged dev workspaces remain: ${merged.map((item) => item.branch).join(', ')}. Run npm run workspace -- cleanup to review.`,
        );
    } catch {
      // Startup also works before the first fetch of the remote base.
    }
  }
  if (command === 'start') show(await startWorkspace(repo.root));
  else if (command === 'restart') {
    await stopWorkspace(repo.root);
    show(await startWorkspace(repo.root));
  } else if (command === 'stop') {
    await stopWorkspace(repo.root);
    console.log('Dev workspace stopped. Branch, worktree and browser data retained.');
  } else if (command === 'new') {
    const path = newWorktree(repo.root, name ?? '');
    show(await startWorkspace(path));
  } else if (command === 'cleanup') {
    if (name && name !== '--apply') throw new Error('Usage: workspace cleanup [--apply]');
    const candidates = await cleanupWorkspaces(repo.root, name === '--apply');
    for (const candidate of candidates)
      console.log(
        `${candidate.branch}: ${candidate.reason}${candidate.removable ? (name === '--apply' ? (candidate.removed ? ' — cleaned up' : ' — retained after recheck') : ' — would remove') : ' — retained'}\nWorktree: ${candidate.root}`,
      );
    if (!candidates.length) console.log('No other linked workspaces.');
    if (name !== '--apply')
      console.log(
        'Preview only. Use cleanup --apply after authorization to close merged workspaces.',
      );
  } else if (command === 'list') {
    const entries = await listWorkspaces(repo.registry);
    if (!entries.length) console.log('No running workspaces.');
    entries.forEach(show);
  } else if (command === 'status') {
    const workspace = readWorkspace(resolve(repo.root, '.dev-workspace', 'state.json'));
    if (workspace && (await running(workspace))) show(workspace);
    else console.log(`No running workspace for ${git(repo.root, 'branch', '--show-current')}.`);
  } else
    throw new Error(
      'Usage: npm run workspace -- new <name> | start | status | list | restart | stop | cleanup [--apply]',
    );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Workspace operation failed.');
  process.exitCode = 1;
});
