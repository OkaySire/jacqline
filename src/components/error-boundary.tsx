import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Jacqline UI crashed", error, info);
  }

  reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    const error: Error = this.state.error;
    return (
      <div className="bg-background text-foreground flex h-full min-h-0 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong.</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Jacqline hit an unexpected error and stopped responding. The error has been logged. You
          can reload the window to recover.
        </p>
        <pre className="bg-card border-border max-h-64 max-w-2xl overflow-auto rounded-lg border p-4 text-left font-mono text-xs">
          {error.message}
          {error.stack !== undefined ? `\n\n${error.stack}` : ""}
        </pre>
        <button
          type="button"
          onClick={this.reload}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
        >
          Reload window
        </button>
      </div>
    );
  }
}
