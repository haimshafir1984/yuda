import { Component, ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-lg border border-red-200 bg-white p-6 text-center">
        <p className="font-semibold text-slate-900">אירעה שגיאה בלתי צפויה בתצוגה</p>
        <p className="mt-1 text-sm text-slate-600">הנתונים לא נפגעו. ניתן לרענן את הדף ולנסות שוב.</p>
        <button type="button" className="mt-4 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>
          רענון הדף
        </button>
      </div>
    );
  }
}
