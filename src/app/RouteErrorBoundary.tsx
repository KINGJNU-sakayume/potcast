import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Changing the key (e.g. the pathname) resets the boundary. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
}

/** Keeps a rendering failure on one page from taking down the shell and the player. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="view active">
        <div className="state-page" data-tone="alert">
          <div className="label">Something went wrong</div>
          <h1>This page could not be displayed</h1>
          <p>Playback is unaffected. Reloading usually fixes it.</p>
          <div className="state-actions">
            <button type="button" className="plain-action" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
