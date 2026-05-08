import { RefreshCw, RotateCcw, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';

export default function SettingsPage({ api }) {
  const { user, refetch, logout, isLoading } = api;
  const { labels, resetLabels } = useLicenseLabels();
  const { presetTags, resetPresetTags } = useLicensePresetTags();
  const { operators, resetOperators } = useOperatorTags();
  const labelCount = Object.keys(labels).length;
  const presetTagCount = Object.keys(presetTags).length;
  const operatorCount = Object.keys(operators).length;
  const hasCustomData = labelCount > 0 || presetTagCount > 0 || operatorCount > 0;

  const handleResetCustomData = () => {
    if (!hasCustomData) {
      toast('No custom dashboard data to reset');
      return;
    }

    const confirmed = window.confirm(
      'This will remove all saved license names and operator assignments from this browser. Continue?'
    );

    if (!confirmed) {
      return;
    }

    resetLabels();
    resetPresetTags();
    resetOperators();
    toast.success('Custom dashboard data reset');
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="space-y-4">
        {/* Account */}
        <div className="glass p-6">
          <h3 className="text-sm font-medium text-white mb-3">Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-white/40">Email</p>
              <p className="text-white/80 mt-0.5">{user?.email || '—'}</p>
            </div>
            <div>
              <p className="text-white/40">User ID</p>
              <p className="text-white/80 mt-0.5 truncate font-mono text-xs">{user?.id || '—'}</p>
            </div>
            <div>
              <p className="text-white/40">Last Sign In</p>
              <p className="text-white/80 mt-0.5">
                {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-white/40">Account Created</p>
              <p className="text-white/80 mt-0.5">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Refresh */}
        <div className="glass p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">Refresh Data</h3>
              <p className="text-xs text-white/30 mt-1">Re-fetch all data from Unity Edge API</p>
            </div>
            <button
              onClick={() => { refetch(); toast.success('Data refreshed'); }}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-xl text-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="glass p-6" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white">Reset Custom Dashboard Data</h3>
              <p className="text-xs text-white/30 mt-1">
                Clear saved license names, preset tags, and operator assignments from this browser.
              </p>
              <p className="text-xs text-white/40 mt-2">
                {labelCount} custom name{labelCount !== 1 ? 's' : ''}, {presetTagCount} preset tag{presetTagCount !== 1 ? 's' : ''}, and {operatorCount} operator assignment{operatorCount !== 1 ? 's' : ''} saved.
              </p>
            </div>
            <button
              onClick={handleResetCustomData}
              disabled={!hasCustomData}
              className="flex items-center gap-2 px-4 py-2 border border-warning/30 bg-warning/10 text-warning rounded-xl text-sm hover:bg-warning/20 disabled:opacity-50 disabled:hover:bg-warning/10"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Logout */}
        <div className="glass p-6" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">Logout</h3>
              <p className="text-xs text-white/30 mt-1">Clear your session token and return to login</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-danger/10 border border-danger/30 text-danger rounded-xl text-sm hover:bg-danger/20"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
