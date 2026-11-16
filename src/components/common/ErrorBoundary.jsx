import { Component } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';

function isDynamicImportError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('unable to preload')
  );
}

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    // If a chunk load failed because of a new deployment, auto-reload once smoothly
    if (isDynamicImportError(error) && typeof window !== 'undefined') {
      const lastReload = sessionStorage.getItem('chunk_load_error_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('chunk_load_error_reload', String(now));
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    if (isDynamicImportError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = isDynamicImportError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="glass p-8 max-w-md w-full rounded-2xl border border-white/[0.08]">
            {isChunkError ? (
              <Sparkles size={40} className="text-cyan-400 mx-auto mb-4" />
            ) : (
              <AlertTriangle size={40} className="text-warning mx-auto mb-4" />
            )}
            <h2 className="text-xl font-bold text-white mb-2">
              {isChunkError ? 'New Update Available' : 'Something went wrong'}
            </h2>
            <p className="text-sm text-white/50 mb-6">
              {isChunkError
                ? 'A new version of the Unity Nodes Dashboard has been deployed. Reload to get the latest features.'
                : (this.state.error?.message || 'An unexpected error occurred.')}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-xl text-sm font-semibold cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>{isChunkError ? 'Update & Reload' : 'Try Again'}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
