import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Practice Room could not render', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-screen">
          <h1>Let’s reopen the room.</h1>
          <p>
            Something interrupted this view. Your saved library and takes are still on this device.
          </p>
          <button className="button button-primary" onClick={() => location.reload()}>
            Reload Practice Room
          </button>
        </main>
      );
    return this.props.children;
  }
}
