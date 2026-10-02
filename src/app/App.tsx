import { useEffect } from 'react';
import { useRoom } from './RoomContext';
import { Shell } from '../components/Shell';
import { InstrumentPage } from '../pages/InstrumentPage';
import { ReviewDialog } from '../components/ReviewDialog';
import { HelpDialog } from '../components/HelpDialog';
import { PracticePage } from '../pages/PracticePage';
import { LibraryPage } from '../pages/LibraryPage';
import { JamPage } from '../pages/JamPage';
import { GymPage } from '../pages/GymPage';
import { ProgressPage } from '../pages/ProgressPage';

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
      </Shell>
      <ReviewDialog />
      <HelpDialog />
    </>
  );
}
