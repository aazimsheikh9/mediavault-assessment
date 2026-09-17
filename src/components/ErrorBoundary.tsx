import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback; defaults to the built-in recovery panel. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary: a render/runtime error in a subtree shows a recovery panel
 * instead of blanking the whole page, and offers a way back (retry the subtree,
 * or reload). Data-fetch errors are handled inline by the query states; this is
 * the backstop for unexpected component-level failures.
 *
 * Must be a class — React only supports error boundaries as classes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In a real app this would go to an error reporter with the request id.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div className="state state--error" role="alert">
        <p>Something in the app stopped working.</p>
        <p className="muted">
          The rest of the page is fine. Try again, or reload if it keeps happening.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button onClick={this.reset}>Try again</button>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
