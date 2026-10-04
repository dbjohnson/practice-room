import { lazy, Suspense, useEffect } from 'react';
import { useRoom } from './RoomContext';
import { Shell } from '../components/Shell';
const InstrumentPage = lazy(() =>
  import('../pages/InstrumentPage').then((module) => ({ default: module.InstrumentPage })),
);
const ReviewDialog = lazy(() =>
  import('../components/ReviewDialog').then((module) => ({ default: module.ReviewDialog })),
);
const HelpDialog = lazy(() =>
  import('../components/HelpDialog').then((module) => ({ default: module.HelpDialog })),
);
import { PracticePage } from '../pages/PracticePage';
const LibraryPage = lazy(() =>
  import('../pages/LibraryPage').then((module) => ({ default: module.LibraryPage })),
);
const JamPage = lazy(() =>
  import('../pages/JamPage').then((module) => ({ default: module.JamPage })),
);
const GymPage = lazy(() =>
  import('../pages/GymPage').then((module) => ({ default: module.GymPage })),
);
const ProgressPage = lazy(() =>
  import('../pages/ProgressPage').then((module) => ({ default: module.ProgressPage })),
);

export function App() {
  const r = useRoom();
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.code !== 'Space' ||
        event.defaultPrevented ||
        target.closest('input, select, textarea') ||
        target.isContentEditable ||
        document.querySelector('dialog[open], [popover]:popover-open') ||
        r.page !== 'practice'
      )
        return;
      event.preventDefault();
      if (!event.repeat) r.play();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [r]);
  return (
    <>
      <Shell>
        <div hidden={r.page !== 'practice'}>
          <PracticePage />
        </div>
        <Suspense fallback={<p role="status">Opening…</p>}>
          {r.page === 'practice' ? null : r.page === 'library' ? (
            <LibraryPage />
          ) : r.page === 'gym' ? (
            <GymPage />
          ) : r.page === 'jam' ? (
            <JamPage />
          ) : r.page === 'instrument' ? (
            <InstrumentPage />
          ) : (
            <ProgressPage />
          )}
        </Suspense>
      </Shell>
      <Suspense fallback={null}>
        {r.takes.review && <ReviewDialog />}
        {r.helpOpen && <HelpDialog />}
      </Suspense>
    </>
  );
}
