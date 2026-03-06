"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for graceful error handling.
 *
 * Wraps data-dependent sections to catch rendering errors and display
 * a user-friendly fallback UI with retry functionality.
 *
 * @example
 * ```tsx
 * <ErrorBoundary name="AgentTable">
 *   <AgentScorecardTable agents={agents} />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h3 className="font-mono text-sm font-medium text-destructive">
                Some data could not be loaded
              </h3>
              {this.state.error && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {this.state.error.message}
                </p>
              )}
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-3 rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
