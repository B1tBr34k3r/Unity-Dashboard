import { useMemo, useRef, useState } from 'react';
import { Download, LogOut, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { clearLegacyCustomDashboardMetadata } from '../data/apiAdapter';
import { useDeviceCombinations } from '../hooks/useDeviceCombinations';
import { useLicenseDeviceHistory } from '../hooks/useLicenseDeviceHistory';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { DEFAULT_DEVICE_COMBINATIONS, getLicenseOriginalBackendName, normalizeDeviceAliasKey } from '../utils/licenseDisplay';

export default function SettingsPage({ api }) {
  const { user, licenses, manualRefresh, logout, isLoading, historyInfo, resetRewardHistoryCache } = api;
  const { labels, replaceLabels, resetLabels } = useLicenseLabels(user?.id);
  const { presetTags, cloneTagOrder, workTagOrder, replacePresetTags, resetPresetTags } = useLicensePresetTags(user?.id);
  const { operators, replaceOperators, resetOperators } = useOperatorTags(user?.id);
  const {
    deviceCombinations,
    replaceDeviceCombinations,
    upsertDeviceCombination,
    removeDeviceCombination,
    resetDeviceCombinations,
  } = useDeviceCombinations(user?.id);
  const { deviceHistory, replaceDeviceHistory, resetDeviceHistory } = useLicenseDeviceHistory(user?.id);
  const importInputRef = useRef(null);
  const [transferNotice, setTransferNotice] = useState(null);
  const [legacyMetadataAction, setLegacyMetadataAction] = useState(false);
  const [deviceCombinationDraftLabel, setDeviceCombinationDraftLabel] = useState('');
  const [selectedDeviceAliases, setSelectedDeviceAliases] = useState([]);
  const [editingDeviceCombinationLabel, setEditingDeviceCombinationLabel] = useState('');
  const labelCount = Object.keys(labels).length;
  const presetTagCount = Object.keys(presetTags).length;
  const operatorCount = Object.keys(operators).length;
  const deviceCombinationCount = deviceCombinations.length;
  const deviceHistoryCount = Object.keys(deviceHistory).length;
  const hasCustomData = labelCount > 0 || presetTagCount > 0 || operatorCount > 0 || deviceCombinationCount > 0 || deviceHistoryCount > 0;
  const archivedRewardCount = historyInfo?.allocationCount || 0;
  const hasArchivedRewardHistory = archivedRewardCount > 0;
  const editingDeviceCombinationKey = normalizeDeviceAliasKey(editingDeviceCombinationLabel);

  const availableDeviceNames = useMemo(() => {
    const namesByKey = new Map();

    const addName = (value) => {
      const deviceName = typeof value === 'string' ? value.trim() : '';
      const deviceKey = normalizeDeviceAliasKey(deviceName);

      if (!deviceName || !deviceKey || namesByKey.has(deviceKey)) {
        return;
      }

      namesByKey.set(deviceKey, deviceName);
    };

    (licenses || []).forEach((license) => {
      addName(getLicenseOriginalBackendName(license));
    });

    deviceCombinations.forEach((combination) => {
      combination.aliases.forEach(addName);
    });

    return Array.from(namesByKey.values()).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
    );
  }, [licenses, deviceCombinations]);

  const lockedDeviceAliasKeys = useMemo(() => {
    const locked = new Set();

    deviceCombinations.forEach((combination) => {
      if (normalizeDeviceAliasKey(combination.label) === editingDeviceCombinationKey) {
        return;
      }

      combination.aliases.forEach((alias) => {
        const aliasKey = normalizeDeviceAliasKey(alias);

        if (aliasKey) {
          locked.add(aliasKey);
        }
      });
    });

    return locked;
  }, [deviceCombinations, editingDeviceCombinationKey]);

  const builtInCombinationSummary = useMemo(
    () => DEFAULT_DEVICE_COMBINATIONS.map((combination) => `${combination.label} (${combination.aliases.join(' + ')})`).join(' · '),
    []
  );

  const historyStatusLabel = {
    complete: 'Complete archive',
    backfilling: 'Backfilling older rewards',
    partial: 'Partial archive',
    unsupported: 'API paging not confirmed',
    pending: 'Backfill pending',
  }[historyInfo?.backfillStatus || 'pending'];

  const transferNoticeText = (() => {
    if (!transferNotice?.counts) {
      return null;
    }

    const {
      labelCount: importedLabels,
      presetTagCount: importedPresetTags,
      operatorCount: importedOperators,
      deviceCombinationCount: importedDeviceCombinations = 0,
      deviceHistoryCount: importedDeviceHistory = 0,
    } = transferNotice.counts;

    if (transferNotice.source === 'file') {
      return `${importedLabels} custom name${importedLabels !== 1 ? 's' : ''}, ${importedPresetTags} preset tag${importedPresetTags !== 1 ? 's' : ''}, ${importedOperators} operator assignment${importedOperators !== 1 ? 's' : ''}, ${importedDeviceCombinations} combined device group${importedDeviceCombinations !== 1 ? 's' : ''}, and ${importedDeviceHistory} remembered device histor${importedDeviceHistory === 1 ? 'y' : 'ies'} imported from a backup file for user ID ${transferNotice.userId || user?.id || '—'}.`;
    }

    return null;
  })();

  const resetDeviceCombinationDraft = () => {
    setEditingDeviceCombinationLabel('');
    setDeviceCombinationDraftLabel('');
    setSelectedDeviceAliases([]);
  };

  const toggleDeviceAliasSelection = (deviceName) => {
    const deviceKey = normalizeDeviceAliasKey(deviceName);

    if (!deviceKey || lockedDeviceAliasKeys.has(deviceKey)) {
      return;
    }

    setSelectedDeviceAliases((previousAliases) => {
      const alreadySelected = previousAliases.some((alias) => normalizeDeviceAliasKey(alias) === deviceKey);

      if (alreadySelected) {
        return previousAliases.filter((alias) => normalizeDeviceAliasKey(alias) !== deviceKey);
      }

      return [...previousAliases, deviceName];
    });
  };

  const handleEditDeviceCombination = (deviceCombination) => {
    setEditingDeviceCombinationLabel(deviceCombination.label);
    setDeviceCombinationDraftLabel(deviceCombination.label);
    setSelectedDeviceAliases(deviceCombination.aliases);
  };

  const handleSaveDeviceCombination = () => {
    const label = deviceCombinationDraftLabel.trim();
    const selectedAliasKeys = new Set(selectedDeviceAliases.map((alias) => normalizeDeviceAliasKey(alias)).filter(Boolean));

    if (!label) {
      toast.error('Enter a combined device label');
      return;
    }

    if (selectedAliasKeys.size < 2) {
      toast.error('Select at least two device names to combine');
      return;
    }

    const saved = upsertDeviceCombination(
      {
        label,
        aliases: selectedDeviceAliases,
      },
      editingDeviceCombinationLabel
    );

    if (!saved) {
      toast.error('This device group overlaps with another saved combination');
      return;
    }

    toast.success(editingDeviceCombinationLabel ? 'Device combination updated' : 'Device combination saved');
    resetDeviceCombinationDraft();
  };

  const handleDeleteDeviceCombination = (label) => {
    removeDeviceCombination(label);

    if (normalizeDeviceAliasKey(label) === editingDeviceCombinationKey) {
      resetDeviceCombinationDraft();
    }

    toast.success('Device combination removed');
  };

  const handleResetCustomData = () => {
    if (!hasCustomData) {
      toast('No custom dashboard data to reset');
      return;
    }

    const confirmed = window.confirm(
      'This will remove all saved license names, preset tags, operator assignments, combined device groups, and remembered device links from this browser. Continue?'
    );

    if (!confirmed) {
      return;
    }

    resetLabels();
    resetPresetTags();
    resetOperators();
    resetDeviceCombinations();
    resetDeviceHistory();
    resetDeviceCombinationDraft();
    setTransferNotice(null);
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
      version: 2,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email || '',
      },
      customData: {
        labels,
        presetTags,
        cloneTagOrder,
        workTagOrder,
        operators,
        deviceCombinations,
        deviceHistory,
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
      const nextCloneTagOrder = importedCustomData?.cloneTagOrder;
      const nextWorkTagOrder = importedCustomData?.workTagOrder;
      const nextOperators = importedCustomData?.operators || {};
      const nextDeviceCombinations = importedCustomData?.deviceCombinations || [];
      const nextDeviceHistory = importedCustomData?.deviceHistory || {};
      const hasValidContent = [nextLabels, nextPresetTags, nextOperators, nextDeviceHistory].some(
        (value) => value && typeof value === 'object' && !Array.isArray(value)
      ) || Array.isArray(importedCustomData?.deviceCombinations);

      if (!hasValidContent) {
        throw new Error('Invalid custom data file');
      }

      const shouldReplace = !hasCustomData || window.confirm(
        'This will replace the saved custom names, preset tags, operator assignments, combined device groups, and remembered device links for the current account in this browser. Continue?'
      );

      if (!shouldReplace) {
        return;
      }

      replaceLabels(nextLabels);
      replacePresetTags(nextPresetTags, {
        cloneTagOrder: nextCloneTagOrder,
        workTagOrder: nextWorkTagOrder,
      });
      replaceOperators(nextOperators);
      replaceDeviceCombinations(nextDeviceCombinations);
      replaceDeviceHistory(nextDeviceHistory);
      resetDeviceCombinationDraft();
      setTransferNotice({
        source: 'file',
        userId: user.id,
        syncedAt: new Date().toISOString(),
        counts: {
          labelCount: Object.keys(nextLabels).length,
          presetTagCount: Object.keys(nextPresetTags).length,
          operatorCount: Object.keys(nextOperators).length,
          deviceCombinationCount: Array.isArray(nextDeviceCombinations) ? nextDeviceCombinations.length : 0,
          deviceHistoryCount: Object.keys(nextDeviceHistory).length,
        },
      });
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

  const handleClearLegacyMetadata = async () => {
    if (!user?.id) {
      toast.error('User account is still loading');
      return;
    }

    const confirmed = window.confirm(
      'This will clear the old unity_dashboard_custom_data field from your Unity account profile. Your browser-only labels, tags, operators, combined device groups, and device history on this PC will stay untouched. Continue?'
    );

    if (!confirmed) {
      return;
    }

    setLegacyMetadataAction(true);

    try {
      const result = await clearLegacyCustomDashboardMetadata();

      if (result.changed) {
        await manualRefresh();
        toast.success('Legacy Unity account metadata cleared');
        return;
      }

      toast('No legacy Unity account metadata found');
    } catch (error) {
      toast.error(error.message || 'Unable to clear remote account metadata');
    } finally {
      setLegacyMetadataAction(false);
    }
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
              <p className="text-xs text-white/30 mt-1">Re-fetch all data from Unity Edge API. Your custom names, tags, and operators stay browser-only and do not sync to your Unity account.</p>
            </div>
            <button
              onClick={() => { manualRefresh(); toast.success('Refresh started'); }}
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
                Clear saved license names, preset tags, operator assignments, combined device groups, and remembered device links for the current Unity account in this browser.
              </p>
              <p className="text-xs text-white/40 mt-2">
                {labelCount} custom name{labelCount !== 1 ? 's' : ''}, {presetTagCount} preset tag{presetTagCount !== 1 ? 's' : ''}, {operatorCount} operator assignment{operatorCount !== 1 ? 's' : ''}, {deviceCombinationCount} combined device group{deviceCombinationCount !== 1 ? 's' : ''}, and {deviceHistoryCount} remembered device histor{deviceHistoryCount === 1 ? 'y' : 'ies'} saved.
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

        <div className="glass p-6" style={{ borderColor: 'rgba(34, 197, 94, 0.2)' }}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-white">Combine Device Names</h3>
                <p className="text-xs text-white/30 mt-1">
                  Merge multiple backend device names into one shared family for analytics, dashboard summaries, filters, daily changes, and clone or work numbering.
                </p>
                <p className="text-xs text-white/40 mt-2">
                  Built-in merges stay active for {builtInCombinationSummary}. Your saved groups add to those defaults for this Unity account in this browser.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold text-white">{deviceCombinationCount}</p>
                <p className="text-[11px] text-white/35">saved group{deviceCombinationCount !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <div>
                  <h4 className="text-sm font-medium text-white">{editingDeviceCombinationLabel ? 'Edit device group' : 'New device group'}</h4>
                  <p className="text-xs text-white/35 mt-1">Pick at least two device names, then choose the single label that the dashboard should use for them.</p>
                </div>

                <label className="block mt-4">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Combined Label</span>
                  <input
                    type="text"
                    value={deviceCombinationDraftLabel}
                    onChange={(event) => setDeviceCombinationDraftLabel(event.target.value)}
                    placeholder="e.g. moto g30"
                    className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#151525]/90 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:border-emerald-400/40 focus:bg-[#18182a]"
                  />
                </label>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Detected Device Names</span>
                    <span className="text-[11px] text-white/35">{selectedDeviceAliases.length} selected</span>
                  </div>

                  {availableDeviceNames.length ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {availableDeviceNames.map((deviceName) => {
                        const deviceKey = normalizeDeviceAliasKey(deviceName);
                        const isSelected = selectedDeviceAliases.some((alias) => normalizeDeviceAliasKey(alias) === deviceKey);
                        const isLocked = lockedDeviceAliasKeys.has(deviceKey) && !isSelected;

                        return (
                          <button
                            key={deviceName}
                            type="button"
                            onClick={() => toggleDeviceAliasSelection(deviceName)}
                            disabled={isLocked}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${isSelected
                              ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                              : isLocked
                                ? 'border-white/[0.06] bg-white/[0.03] text-white/20 cursor-not-allowed'
                                : 'border-white/[0.08] bg-white/[0.03] text-white/65 hover:bg-white/[0.06]'}`}
                          >
                            {deviceName}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-white/35 mt-3">Refresh your licenses first so the dashboard can detect device names to combine.</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    type="button"
                    onClick={handleSaveDeviceCombination}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 rounded-xl text-sm hover:bg-emerald-400/20"
                  >
                    {editingDeviceCombinationLabel ? 'Update Group' : 'Save Group'}
                  </button>
                  {(editingDeviceCombinationLabel || deviceCombinationDraftLabel || selectedDeviceAliases.length) && (
                    <button
                      type="button"
                      onClick={resetDeviceCombinationDraft}
                      className="flex items-center justify-center gap-2 px-4 py-2 border border-white/[0.08] bg-white/[0.03] text-white/70 rounded-xl text-sm hover:bg-white/[0.06]"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-white">Saved groups</h4>
                    <p className="text-xs text-white/35 mt-1">Each group overrides raw backend names with one shared device identity.</p>
                  </div>
                </div>

                {deviceCombinations.length ? (
                  <div className="space-y-3 mt-4">
                    {deviceCombinations.map((deviceCombination) => (
                      <div key={deviceCombination.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{deviceCombination.label}</p>
                            <p className="text-[11px] text-white/35 mt-1">{deviceCombination.aliases.length} device name{deviceCombination.aliases.length !== 1 ? 's' : ''} linked</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditDeviceCombination(deviceCombination)}
                              className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs text-white/70 hover:bg-white/[0.06]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDeviceCombination(deviceCombination.label)}
                              className="px-3 py-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 text-xs text-rose-200 hover:bg-rose-400/20"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {deviceCombination.aliases.map((alias) => (
                            <span key={alias} className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/65">
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/35 mt-4">No custom device groups saved yet. The built-in A30 and realme X merges still apply automatically.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass p-6" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white">Backup Custom Dashboard Data</h3>
              <p className="text-xs text-white/30 mt-1">
                Custom names, preset tags, operator assignments, combined device groups, and remembered device links are saved only in this browser on this PC. Use export and import if you want to move them somewhere else manually.
              </p>
              {transferNoticeText && (
                <p className="text-xs text-white/40 mt-2">
                  {transferNoticeText}
                </p>
              )}
              <p className="text-xs text-white/40 mt-2">
                Exported backup files include combined device groups and remembered device links as well.
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

        <div className="glass p-6" style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white">Clear Legacy Account Metadata</h3>
              <p className="text-xs text-white/30 mt-1">
                Remove the old remote <span className="font-mono">unity_dashboard_custom_data</span> field from your Unity account profile. This does not touch the browser-only labels, tags, operators, combined device groups, or remembered device links saved on this PC.
              </p>
              <p className="text-xs text-white/40 mt-2">
                Use this once if you want to wipe any leftover metadata from older dashboard versions that used account sync.
              </p>
            </div>
            <button
              onClick={() => void handleClearLegacyMetadata()}
              disabled={legacyMetadataAction || isLoading}
              className="flex items-center gap-2 px-4 py-2 border border-rose-400/30 bg-rose-400/10 text-rose-200 rounded-xl text-sm hover:bg-rose-400/20 disabled:opacity-50 disabled:hover:bg-rose-400/10"
            >
              <RotateCcw size={14} /> {legacyMetadataAction ? 'Clearing...' : 'Clear Remote Metadata'}
            </button>
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
