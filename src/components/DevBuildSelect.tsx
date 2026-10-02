import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../app/RoomContext';
import { workspaceId } from '../workspace/client';

interface Build {
  id: string;
  branch: string;
}

export function DevBuildSelect() {
  const room = useRoom();
  const label = useRef<HTMLLabelElement>(null);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const current = workspaceId || 'production';

  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      setError(false);
      try {
        const response = await fetch('/__workspace/builds', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok) throw new Error('Build list unavailable');
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid build list');
        const valid = data.filter(
          (build): build is Build =>
            build &&
            typeof build.id === 'string' &&
            /^[a-z0-9][a-z0-9-]{0,60}$/.test(build.id) &&
            build.id !== 'production' &&
            typeof build.branch === 'string',
        );
        if (!request.signal.aborted) {
          setBuilds(valid.sort((a, b) => a.branch.localeCompare(b.branch)));
        }
      } catch {
        if (!request.signal.aborted) setError(true);
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    };
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'open') void refresh();
    };
    const menu = label.current?.closest('[popover]');
    menu?.addEventListener('toggle', onToggle);
    void refresh();
    return () => {
      controller?.abort();
      menu?.removeEventListener('toggle', onToggle);
    };
  }, [retry]);

  return (
    <label className="dev-build-select" ref={label}>
      <span>Build</span>
      <select
        aria-label="Build"
        aria-busy={loading}
        value={current}
        onChange={(event) => {
          const id = event.target.value;
          if (id === current) return;
          room.halt();
          room.input.stop();
          window.location.assign(`/dev/use/${id}${window.location.hash}`);
        }}
      >
        <option value="production">Production</option>
        {workspaceId && !builds.some((build) => build.id === workspaceId) && (
          <option value={workspaceId}>Current dev build</option>
        )}
        {builds.map((build) => (
          <option key={build.id} value={build.id}>
            {build.branch}
            {build.id === workspaceId ? ' (current)' : ''}
          </option>
        ))}
      </select>
      {error ? (
        <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Retry build list
        </button>
      ) : loading ? (
        <small role="status">Loading builds…</small>
      ) : !builds.length ? (
        <small>No dev builds running</small>
      ) : null}
    </label>
  );
}
