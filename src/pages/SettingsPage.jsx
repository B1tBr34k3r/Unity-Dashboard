import { useRef } from 'react';
import { Download, LogOut, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';

export default function SettingsPage({ api }) {
  const { user, refetch, logout, isLoading, historyInfo, resetRewardHistoryCache } = api;
  const { labels, replaceLabels, resetLabels } = useLicenseLabels(user?.id);
  const { presetTags, replacePresetTags, resetPresetTags } = useLicensePresetTags(user?.id);
  const { operators, replaceOperators, resetOperators } = useOperatorTags(user?.id);
  const importInputRef = useRef(null);
  const labelCount = Object.keys(labels).length;
  const presetTagCount = Object.keys(presetTags).length;
  const operatorCount = Object.keys(operators).length;
  const hasCustomData = labelCount > 0 || presetTagCount > 0 || operatorCount > 0;
  const archivedRewardCount = historyInfo?.allocationCount || 0;
  const hasArchivedRewardHistory = archivedRewardCount > 0;

  const historyStatusLabel = {
    complete: 'Complete archive',
    backfilling: 'Backfilling older rewards',
    partial: 'Partial archive',
    unsupported: 'API paging not confirmed',
    pending: 'Backfill pending',
  }[historyInfo?.backfillStatus || 'pending'];

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

  const handleExportCustomData = () => {
    if (!user?.id) {
      toast.error('User account is still loading');
      return;
    }

    if (!hasCustomData) {
      toast('No custom dashboard data to export');
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email || '',
      },
      customData: {
        labels,
        presetTags,
        operators,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `unity-custom-data-${user.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Custom dashboard data exported');
  };

  const handleImportButtonClick = () => {
    importInputRef.current?.click();
  };

  const handleImportCustomData = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const importedCustomData = parsed?.customData && typeof parsed.customData === 'object' ? parsed.customData : parsed;
      const importedUserId = parsed?.user?.id || parsed?.userId || null;

      if (!user?.id) {
        throw new Error('User account is still loading');
      }

      if (importedUserId && importedUserId !== user.id) {
        throw new Error('This custom data file belongs to a different Unity account');
      }

      const nextLabels = importedCustomData?.labels || {};
      const nextPresetTags = importedCustomData?.presetTags || {};
      const nextOperators = importedCustomData?.operators || {};
      const hasValidContent = [nextLabels, nextPresetTags, nextOperators].some(
        (value) => value && typeof value === 'object' && !Array.isArray(value)
      );

      if (!hasValidContent) {
        throw new Error('Invalid custom data file');
      }

      const shouldReplace = !hasCustomData || window.confirm(
        'This will replace the saved custom names, preset tags, and operator assignments for the current account in this browser. Continue?'
      );

      if (!shouldReplace) {
        return;
      }

      replaceLabels(nextLabels);
      replacePresetTags(nextPresetTags);
      replaceOperators(nextOperators);
      toast.success('Custom dashboard data imported');
    } catch (error) {
      toast.error(error.message || 'Failed to import custom data');
    } finally {
      event.target.value = '';
    }
  };

  const handleResetRewardHistory = () => {
    if (!hasArchivedRewardHistory) {
      toast('No archived reward history to reset');
      return;
    }

    const confirmed = window.confirm(
      'This will remove the long-term reward history cached in this browser for the current account. The latest live API data will remain visible, and the archive can rebuild on future refreshes. Continue?'
    );

    if (!confirmed) {
      return;
    }

    const didReset = resetRewardHistoryCache();

    if (!didReset) {
      toast.error('Unable to reset archived reward history');
      return;
    }

    toast.success('Archived reward history reset');
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
                Clear saved license names, preset tags, and operator assignments for the current Unity account in this browser.
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

        <div className="glass p-6" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white">Transfer Custom Dashboard Data</h3>
              <p className="text-xs text-white/30 mt-1">
                Export your custom names, preset tags, and operator assignments into a file, then import that file on another browser or on the Vercel site.
              </p>
              <p className="text-xs text-white/40 mt-2">
                Imported data is saved under user ID {user?.id || '—'} so another Unity account on this site will not see it.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <button
                onClick={handleExportCustomData}
                disabled={!hasCustomData}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 rounded-xl text-sm hover:bg-emerald-400/20 disabled:opacity-50 disabled:hover:bg-emerald-400/10"
              >
                <Download size={14} /> Export
              </button>
              <button
                onClick={handleImportButtonClick}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 rounded-xl text-sm hover:bg-emerald-400/20"
              >
                <Upload size={14} /> Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportCustomData}
              />
            </div>
          </div>
        </div>

        <div className="glass p-6" style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white">Reward History Archive</h3>
              <p className="text-xs text-white/30 mt-1">
                Older reward allocations are now cached in this browser so historical charts do not disappear when the API only returns recent data.
              </p>
              <p className="text-xs text-white/40 mt-2">
                {archivedRewardCount} archived allocation{archivedRewardCount !== 1 ? 's' : ''}
                {historyInfo?.oldestCompletedAt && ` · Oldest ${new Date(historyInfo.oldestCompletedAt).toLocaleDateString()}`}
                {historyInfo?.newestCompletedAt && ` · Newest ${new Date(historyInfo.newestCompletedAt).toLocaleDateString()}`}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {historyStatusLabel}
                {historyInfo?.lastBackfillAt && ` · Last checked ${new Date(historyInfo.lastBackfillAt).toLocaleString()}`}
              </p>
            </div>
            <button
              onClick={handleResetRewardHistory}
              disabled={!hasArchivedRewardHistory}
              className="flex items-center gap-2 px-4 py-2 border border-sky-400/30 bg-sky-400/10 text-sky-200 rounded-xl text-sm hover:bg-sky-400/20 disabled:opacity-50 disabled:hover:bg-sky-400/10"
            >
              <RotateCcw size={14} /> Reset Archive
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
