import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/fraunces';
import './styles.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './app/App';
import { RoomProvider } from './app/RoomProvider';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RoomProvider>
        <App />
      </RoomProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
