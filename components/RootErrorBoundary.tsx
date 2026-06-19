import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of a blank white screen.
 */
export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
          dir="rtl"
        >
          <div className="max-w-lg w-full bg-white rounded-lg shadow-lg border border-red-200 p-6 text-center">
            <h1 className="text-xl font-bold text-red-800 mb-2">אירעה שגיאה</h1>
            <p className="text-slate-600 mb-4">
              האפליקציה נתקלה בשגיאה. נא לרענן את הדף או לפתוח את קונסולת המפתח (F12) לפרטים.
            </p>
            <pre className="text-start text-sm bg-slate-100 p-3 rounded overflow-auto max-h-32 mb-4">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              רענן דף
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
