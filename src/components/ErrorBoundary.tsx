import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('App ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center p-6 bg-[#f3f9fd] dark:bg-[#0d1722] text-[#1d2733] dark:text-[#eef3f8]"
        >
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-6 text-center shadow-sm">
            <h2 className="text-xl font-bold mb-2">تعذر تحميل جزء من التطبيق</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#c9a24b] hover:bg-[#b58f3a] text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
