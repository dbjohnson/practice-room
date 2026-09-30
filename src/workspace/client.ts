export interface WorkspaceSession {
  user: { name: string; email: string };
  storageId: string;
  developer: boolean;
  csrf: string;
}

let session: WorkspaceSession | null = null;
export const workspaceId = import.meta.env.VITE_WORKSPACE_ID as string | undefined;
export const getWorkspaceSession = () => session;

export async function initializeWorkspace() {
  const response = await fetch('/__workspace/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) {
    location.assign(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
    throw new Error('Please sign in again.');
  }
  // Plain Vite / static preview has no hosted session endpoint.
  if (!response.headers.get('content-type')?.includes('application/json')) return;
  if (!response.ok) throw new Error('Could not load your session. Please reload.');
  session = (await response.json()) as WorkspaceSession;
  if (!/^[a-f0-9]{32}$/.test(session.storageId) || !session.user?.email || !session.csrf)
    throw new Error('The server returned an invalid session. Please reload.');
}

export function storageNamespace(original: string) {
  return `${original}${session ? `:account:${session.storageId}` : ''}${workspaceId ? `:build:${workspaceId}` : ''}`;
}

export async function signOut() {
  if (!session) return;
  const response = await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': session.csrf },
  });
  if (!response.ok) throw new Error('Could not sign out. Please try again.');
  location.assign('/login');
}
