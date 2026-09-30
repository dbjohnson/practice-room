import { useState } from 'react';
import { getWorkspaceSession, signOut, workspaceId } from '../workspace/client';
import { useRoom } from '../app/RoomContext';

export function AccountControls() {
  const session = getWorkspaceSession();
  const room = useRoom();
  const [busy, setBusy] = useState(false);
  if (!session && !workspaceId) return null;
  return (
    <div className="account-controls">
      {workspaceId && <span className="pill">Dev build</span>}
      {session?.developer && (
        <a href="/dev/" onClick={room.halt}>
          Dev builds
        </a>
      )}
      {session && (
        <>
          <span className="account-name" title={session.user.email}>
            {session.user.name}
          </span>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={async () => {
              room.halt();
              room.input.stop();
              setBusy(true);
              try {
                await signOut();
              } catch {
                room.notify('Could not sign out. Please try again.');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </div>
  );
}
