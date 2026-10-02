import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/fraunces';
import './styles.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './app/App';
import { RoomProvider } from './app/RoomProvider';
import { initializeSession } from './app/initializeSession';

async function start() {
  await initializeSession();
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RoomProvider>
          <App />
        </RoomProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
void start().catch((error: unknown) => {
  const root = document.getElementById('root')!;
  root.textContent =
    error instanceof Error ? error.message : 'Could not start Practice Room. Please reload.';
});
