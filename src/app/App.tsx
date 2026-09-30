import { useEffect } from 'react';
import { useRoom } from './RoomContext';
import { Shell } from '../components/Shell';
import { InstrumentPage } from '../pages/InstrumentPage';
import { ReviewDialog } from '../components/ReviewDialog';
import { HelpDialog } from '../components/HelpDialog';
import { PracticePage } from '../pages/PracticePage';
import { LibraryPage } from '../pages/LibraryPage';
import { JamPage } from '../pages/JamPage';
import { ProgressPage } from '../pages/ProgressPage';

export function App() {
  const r = useRoom();
  useEffect(() => {
    document.body.dataset.concept = r.concept;
  }, [r.concept]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.code !== 'Space' ||
        ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) ||
        document.querySelector('dialog[open]') ||
        r.page !== 'practice'
      )
        return;
      event.preventDefault();
      r.play();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [r]);
  return (
    <>
      <Shell>
        {r.page === 'practice' ? (
          <PracticePage />
        ) : r.page === 'library' ? (
          <LibraryPage />
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
