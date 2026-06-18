import { Component, type ReactNode } from "react";

type State = { error: Error | null };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-slate-600">{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
