import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', { error, errorInfo });
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-dvh bg-white dark:bg-neutral-950 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-500 rounded-lg p-8">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500 rounded-lg">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
                    Something went wrong
                  </h1>
                  <p className="text-neutral-700 dark:text-neutral-300 mb-4">
                    We encountered an unexpected error. The issue has been logged and we'll work to fix it.
                  </p>

                  {this.state.error && (
                    <details className="mb-4">
                      <summary className="cursor-pointer text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                        Technical details
                      </summary>
                      <div className="mt-2 p-4 bg-neutral-100 dark:bg-neutral-900 rounded text-xs font-mono overflow-auto">
                        <p className="text-red-600 dark:text-red-400 font-bold mb-2">
                          {this.state.error.toString()}
                        </p>
                        {this.state.errorInfo && (
                          <pre className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        )}
                      </div>
                    </details>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={this.handleReset}
                      className="btn-primary"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => window.location.href = '/'}
                      className="btn-ghost"
                    >
                      Go Home
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
