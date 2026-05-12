import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Pencil, RefreshCw, Search, Users, X } from 'lucide-react';
import HoverRevealText from '../components/common/HoverRevealText';
import { LicenseListSkeleton } from '../components/common/Skeleton';
import LicenseStatusBadge from '../components/licenses/LicenseStatusBadge';
import LicenseTagPicker from '../components/licenses/LicenseTagPicker';
import OperatorPicker from '../components/licenses/OperatorPicker';
import Pagination from '../components/licenses/Pagination';
import { getLicenseSnapshotStatus } from '../data/licenseSnapshotHistory';
import { useLicenseDeviceHistory } from '../hooks/useLicenseDeviceHistory';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useLicenseSnapshotHistory } from '../hooks/useLicenseSnapshotHistory';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { usePersistentPageState } from '../hooks/usePersistentPageState';
import { truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, formatTaggedLicenseName, getLicenseBackendName, getLicenseDisplayName } from '../utils/licenseDisplay';

const PAGE_SIZE = 50;
const FILTER_SELECT_CLASS_NAME = 'w-full rounded-xl border border-white/[0.08] bg-[#151525]/90 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:border-accent/50 focus:bg-[#18182a]';
const FILTER_SELECT_ICON_CLASS_NAME = `${FILTER_SELECT_CLASS_NAME} pl-9`;
const FILTER_FIELD_CLASS_NAME = 'min-w-[170px] flex-1 sm:flex-none sm:w-[190px]';

function getDateValue(value) {
  return value ? new Date(value).getTime() : 0;
}

function formatDayKey(dayKey) {
  if (!dayKey) {
    return '—';
  }

  return new Date(`${dayKey}T00:00:00`).toLocaleDateString();
}

function formatHistoryTimestamp(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDeviceName(deviceName, deviceId) {
  if (deviceName) {
    return deviceName;
  }

  if (deviceId) {
    return `Device ${String(deviceId).slice(0, 8)}`;
  }

  return '';
}

function getLiveStatus(license) {
  if (!license?.deviceId && !license?.deviceName) {
    return 'unbound';
  }

  if (
    typeof license?.uptime === 'number'
    && typeof license?.leaseMinUptimePercentage === 'number'
    && license.uptime * 100 < license.leaseMinUptimePercentage
  ) {
    return 'below-min';
  }

  return license?.isOnline ? 'online' : 'offline';
}

function buildSnapshotSummaryByLicense(snapshotDays) {
  return Object.keys(snapshotDays || {})
    .sort((left, right) => left.localeCompare(right))
    .reduce((accumulator, dayKey) => {
      const licenses = snapshotDays?.[dayKey]?.licenses || {};

      Object.values(licenses).forEach((snapshot) => {
        const existing = accumulator[snapshot.licenseId] || {
          firstSeenDayKey: dayKey,
          lastSeenDayKey: dayKey,
          dayCount: 0,
          latestSnapshot: snapshot,
        };

        existing.dayCount += 1;

        if (dayKey < existing.firstSeenDayKey) {
          existing.firstSeenDayKey = dayKey;
        }

        if (dayKey >= existing.lastSeenDayKey) {
          existing.lastSeenDayKey = dayKey;
          existing.latestSnapshot = snapshot;
        }

        accumulator[snapshot.licenseId] = existing;
      });

      return accumulator;
    }, {});
}

export default function LicenseHistoryPage({ api }) {
  const { user, licenses, isLoading, manualRefresh } = api;
  const { deviceHistory } = useLicenseDeviceHistory(user?.id, licenses);
  const { days: snapshotDays, meta: snapshotMeta } = useLicenseSnapshotHistory(user?.id, licenses);
  const { getLabel, setLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, setPresetTag, tagPresets, presetTags, cloneTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator, setOperator, allOperators } = useOperatorTags(user?.id);
  const navigate = useNavigate();
  const [search, setSearch] = usePersistentPageState('page-state:license-history:search', '');
  const [sortBy, setSortBy] = usePersistentPageState('page-state:license-history:sort-by', 'lastChangedAt');
  const [sortDirection, setSortDirection] = usePersistentPageState('page-state:license-history:sort-direction', 'desc');
  const [operatorFilter, setOperatorFilter] = usePersistentPageState('page-state:license-history:operator-filter', 'all');
  const [tagFilter, setTagFilter] = usePersistentPageState('page-state:license-history:tag-filter', 'all');
  const [deviceFilter, setDeviceFilter] = usePersistentPageState('page-state:license-history:device-filter', 'all');
  const [statusFilter, setStatusFilter] = usePersistentPageState('page-state:license-history:status-filter', 'all');
  const [page, setPage] = usePersistentPageState('page-state:license-history:page', 1);
  const [viewMode, setViewMode] = usePersistentPageState('page-state:license-history:view-mode', 'cards');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenses || []).map((license) => [license.id, license])),
    [licenses]
  );

  const snapshotSummaryById = useMemo(() => buildSnapshotSummaryByLicense(snapshotDays), [snapshotDays]);

  const allHistoryIds = useMemo(() => {
    return Array.from(new Set([
      ...Object.keys(licenseInfoById || {}),
      ...Object.keys(deviceHistory || {}),
      ...Object.keys(snapshotSummaryById || {}),
    ]));
  }, [licenseInfoById, deviceHistory, snapshotSummaryById]);

  const baseDeviceNameById = useMemo(() => {
    return allHistoryIds.reduce((accumulator, licenseId) => {
      const liveLicense = licenseInfoById[licenseId];
      const historyRecord = deviceHistory[licenseId];
      const latestLink = historyRecord?.links?.[historyRecord.links.length - 1] || null;
      const snapshotSummary = snapshotSummaryById[licenseId];

      accumulator[licenseId] = (
        getLicenseBackendName(liveLicense)
        || latestLink?.deviceName
        || snapshotSummary?.latestSnapshot?.deviceName
        || ''
      );

      return accumulator;
    }, {});
  }, [allHistoryIds, licenseInfoById, deviceHistory, snapshotSummaryById]);

  const cloneIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => baseDeviceNameById[licenseId] || getLicenseBackendName(licenseInfoById[licenseId]), cloneTagOrder),
    [presetTags, baseDeviceNameById, licenseInfoById, cloneTagOrder]
  );

  const getDisplayName = (licenseId) => {
    return getLicenseDisplayName({
      customLabel: getLabel(licenseId),
      backendName: baseDeviceNameById[licenseId],
      presetTag: getPresetTag(licenseId),
      cloneIndex: cloneIndexById[licenseId] || null,
    }) || `License ${truncateHex(licenseId, 8, 6)}`;
  };

  const historyItems = useMemo(() => {
    return allHistoryIds.map((licenseId) => {
      const liveLicense = licenseInfoById[licenseId] || null;
      const historyRecord = deviceHistory[licenseId] || null;
      const latestLink = historyRecord?.links?.[historyRecord.links.length - 1] || null;
      const snapshotSummary = snapshotSummaryById[licenseId] || null;
      const latestSnapshot = snapshotSummary?.latestSnapshot || null;
      const latestDeviceName = formatDeviceName(
        getLicenseBackendName(liveLicense) || latestLink?.deviceName || latestSnapshot?.deviceName || '',
        liveLicense?.deviceId || latestLink?.deviceId || latestSnapshot?.deviceId || ''
      );
      const presetTag = getPresetTag(licenseId);
      const cloneIndex = cloneIndexById[licenseId] || null;
      const displayName = getDisplayName(licenseId);
      const backendName = baseDeviceNameById[licenseId];
      const taggedName = formatTaggedLicenseName(backendName, presetTag, cloneIndex);
      const lastChangedAt = historyRecord?.lastChangedAt || latestLink?.linkedAt || null;
      const lastSnapshotAt = snapshotSummary?.lastSeenDayKey ? `${snapshotSummary.lastSeenDayKey}T00:00:00.000Z` : null;

      return {
        licenseId,
        displayName,
        backendName,
        taggedName,
        latestDeviceName,
        operator: getOperator(licenseId),
        presetTag,
        status: latestSnapshot ? getLicenseSnapshotStatus(latestSnapshot) : getLiveStatus(liveLicense),
        hasSavedHistory: Boolean((historyRecord?.links?.length || 0) || (snapshotSummary?.dayCount || 0)),
        periodCount: historyRecord?.links?.length || 0,
        snapshotDayCount: snapshotSummary?.dayCount || 0,
        firstSeenDayKey: snapshotSummary?.firstSeenDayKey || null,
        lastSeenDayKey: snapshotSummary?.lastSeenDayKey || null,
        lastChangedAt,
        lastChangedSortValue: getDateValue(lastChangedAt) || getDateValue(lastSnapshotAt),
      };
    });
  }, [allHistoryIds, licenseInfoById, deviceHistory, snapshotSummaryById, getOperator, getPresetTag, cloneIndexById, getLabel, baseDeviceNameById]);

  const availableDeviceNames = useMemo(() => {
    return Array.from(new Set(historyItems.map((item) => item.latestDeviceName).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [historyItems]);

  const filtered = useMemo(() => {
    let list = historyItems;

    if (operatorFilter !== 'all') {
      if (operatorFilter === '__unassigned__') {
        list = list.filter((item) => !getOperator(item.licenseId));
      } else {
        list = list.filter((item) => getOperator(item.licenseId) === operatorFilter);
      }
    }

    if (tagFilter !== 'all') {
      list = list.filter((item) => {
        const presetTag = getPresetTag(item.licenseId);

        if (tagFilter === '__untagged__') {
          return !presetTag;
        }

        return presetTag === tagFilter;
      });
    }

    if (deviceFilter !== 'all') {
      list = list.filter((item) => {
        if (deviceFilter === '__unknown__') {
          return !item.latestDeviceName;
        }

        return item.latestDeviceName === deviceFilter;
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter((item) => item.status === statusFilter);
    }

    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      list = list.filter((item) => {
        const haystack = [
          item.displayName,
          item.licenseId,
          item.backendName,
          item.taggedName,
          item.latestDeviceName,
          getOperator(item.licenseId),
          getPresetTag(item.licenseId),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      });
    }

    return list;
  }, [historyItems, operatorFilter, tagFilter, deviceFilter, statusFilter, search, getOperator, getPresetTag]);

  const sorted = useMemo(() => {
    const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

    return [...filtered].sort((left, right) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' });
          break;
        case 'periodCount':
          comparison = left.periodCount - right.periodCount;
          break;
        case 'snapshotDayCount':
          comparison = left.snapshotDayCount - right.snapshotDayCount;
          break;
        case 'lastSeenDayKey':
          comparison = (left.lastSeenDayKey || '').localeCompare(right.lastSeenDayKey || '');
          break;
        case 'lastChangedAt':
        default:
          comparison = left.lastChangedSortValue - right.lastChangedSortValue;
          break;
      }

      if (comparison === 0) {
        comparison = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' });
      }

      return comparison * directionMultiplier;
    });
  }, [filtered, sortBy, sortDirection]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasActiveFilters = Boolean(search || operatorFilter !== 'all' || tagFilter !== 'all' || deviceFilter !== 'all' || statusFilter !== 'all');
  const activeFilterCount = [operatorFilter, tagFilter, deviceFilter, statusFilter].filter((value) => value !== 'all').length + (search ? 1 : 0);

  useEffect(() => {
    if (totalPages === 0 && page !== 1) {
      setPage(1);
      return;
    }

    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, setPage, totalPages]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setOperatorFilter('all');
    setTagFilter('all');
    setDeviceFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const openHistoryDetail = (event, licenseId, isEditing) => {
    if (isEditing) {
      return;
    }

    const detailPath = `/license-history/${encodeURIComponent(licenseId)}`;

    if (event.ctrlKey || event.metaKey) {
      const absoluteUrl = `${window.location.origin}${detailPath}`;
      window.open(absoluteUrl, '_blank', 'noopener');
      return;
    }

    navigate(detailPath);
  };

  const startEditing = (event, licenseId) => {
    event.stopPropagation();
    setEditingId(licenseId);
    setEditValue(getDisplayName(licenseId));
  };

  const saveLabel = (event) => {
    event.stopPropagation();
    const success = setLabel(editingId, editValue);

    if (success) {
      setEditingId(null);
    }
  };

  const cancelEdit = (event) => {
    event.stopPropagation();
    setEditingId(null);
  };

  if (isLoading) {
    return <LicenseListSkeleton />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] sm:h-[calc(100vh-4rem)]">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-white">License History</h1>
            <p className="text-[11px] sm:text-sm text-white/40 mt-0.5 sm:mt-1 truncate">
              {historyItems.length} visible licenses
              {snapshotMeta?.snapshotDayCount ? ` · ${snapshotMeta.snapshotDayCount} stored snapshot day${snapshotMeta.snapshotDayCount === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <button
            onClick={manualRefresh}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 glass text-xs sm:text-sm text-white/60 hover:text-white"
          >
            <RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <div className="glass-subtle p-3 sm:p-4 mb-3 sm:mb-4">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search by name, tag, device, operator or license ID..."
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  className="w-full rounded-[1rem] border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/30 backdrop-blur focus:outline-none focus:border-accent/50 focus:bg-white/[0.06]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 sm:gap-3 lg:min-w-fit">
                <div className="hidden xl:block min-w-[160px]">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/30">History Shelf</p>
                  <p className="mt-1 text-xs text-white/45">
                    {hasActiveFilters ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'All tracked history visible'}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/55 hover:text-white hover:border-white/[0.14]"
                    >
                      Reset Filters
                    </button>
                  )}

                  <div className="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#151525]/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm ${
                        viewMode === 'cards' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/70'
                      }`}
                    >
                      Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm ${
                        viewMode === 'table' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/70'
                      }`}
                    >
                      Table
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 sm:gap-3">
              {allOperators.length > 0 && (
                <div className={`relative ${FILTER_FIELD_CLASS_NAME}`}>
                  <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <select
                    value={operatorFilter}
                    onChange={(event) => {
                      setOperatorFilter(event.target.value);
                      setPage(1);
                    }}
                    className={FILTER_SELECT_ICON_CLASS_NAME}
                  >
                    <option value="all" className="bg-[#151525] text-white">All Operators</option>
                    {allOperators.map((operator) => (
                      <option key={operator} value={operator} className="bg-[#151525] text-white">{operator}</option>
                    ))}
                    <option value="__unassigned__" className="bg-[#151525] text-white/50">Unassigned</option>
                  </select>
                </div>
              )}

              <div className={FILTER_FIELD_CLASS_NAME}>
                <select
                  value={tagFilter}
                  onChange={(event) => {
                    setTagFilter(event.target.value);
                    setPage(1);
                  }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="all" className="bg-[#151525] text-white">All Tags</option>
                  {tagPresets.map((tag) => (
                    <option key={tag} value={tag} className="bg-[#151525] text-white">{tag}</option>
                  ))}
                  <option value="__untagged__" className="bg-[#151525] text-white/50">Untagged</option>
                </select>
              </div>

              <div className="min-w-[190px] flex-1 sm:flex-none sm:w-[230px]">
                <select
                  value={deviceFilter}
                  onChange={(event) => {
                    setDeviceFilter(event.target.value);
                    setPage(1);
                  }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="all" className="bg-[#151525] text-white">All Devices</option>
                  {availableDeviceNames.map((deviceName) => (
                    <option key={deviceName} value={deviceName} className="bg-[#151525] text-white">{deviceName}</option>
                  ))}
                  <option value="__unknown__" className="bg-[#151525] text-white/50">No Device Name</option>
                </select>
              </div>

              <div className={FILTER_FIELD_CLASS_NAME}>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="all" className="bg-[#151525] text-white">All Statuses</option>
                  <option value="online" className="bg-[#151525] text-white">Online</option>
                  <option value="offline" className="bg-[#151525] text-white">Offline</option>
                  <option value="below-min" className="bg-[#151525] text-white">Below Min Uptime</option>
                  <option value="unbound" className="bg-[#151525] text-white">Unbound</option>
                </select>
              </div>

              <div className="min-w-[190px] flex-1 sm:flex-none sm:w-[230px]">
                <select
                  value={sortBy}
                  onChange={(event) => {
                    const nextSortBy = event.target.value;
                    setSortBy(nextSortBy);
                    if (nextSortBy === 'lastChangedAt' || nextSortBy === 'lastSeenDayKey' || nextSortBy === 'snapshotDayCount' || nextSortBy === 'periodCount') {
                      setSortDirection('desc');
                    }
                    setPage(1);
                  }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="lastChangedAt" className="bg-[#151525] text-white">Sort by Last Change</option>
                  <option value="lastSeenDayKey" className="bg-[#151525] text-white">Sort by Last Snapshot</option>
                  <option value="snapshotDayCount" className="bg-[#151525] text-white">Sort by Snapshot Days</option>
                  <option value="periodCount" className="bg-[#151525] text-white">Sort by Link Periods</option>
                  <option value="name" className="bg-[#151525] text-white">Sort by Name</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {paginated.length === 0 ? (
        <div className="text-center py-12 text-white/40">No licenses available yet.</div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {viewMode === 'cards' ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1" style={{ scrollbarWidth: 'thin' }}>
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4 pb-1">
                {paginated.map((item) => {
                  const presetTag = getPresetTag(item.licenseId);
                  const operator = getOperator(item.licenseId);
                  const isEditing = editingId === item.licenseId;
                  const subtitle = getLabel(item.licenseId) && item.taggedName
                    ? `Auto tag: ${item.taggedName}`
                    : getLabel(item.licenseId) && item.backendName
                      ? `Latest device: ${item.backendName}`
                      : presetTag && item.backendName
                        ? `Base device: ${item.backendName}`
                        : item.latestDeviceName
                          ? `Last seen on ${item.latestDeviceName}`
                          : 'No remembered device name yet';

                  return (
                    <div
                      key={item.licenseId}
                      onClick={(event) => openHistoryDetail(event, item.licenseId, isEditing)}
                      className="glass p-4 sm:p-5 rounded-[1.25rem] border border-white/[0.06] hover:border-white/[0.14] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <LicenseStatusBadge status={item.status} size="sm" uppercase />
                            <span className="font-mono text-[10px] tracking-normal text-white/25">{truncateHex(item.licenseId, 8, 6)}</span>
                            {!item.hasSavedHistory ? (
                              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/55">
                                No Link History Yet
                              </span>
                            ) : null}
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(event) => setEditValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') saveLabel(event);
                                  if (event.key === 'Escape') cancelEdit(event);
                                }}
                                placeholder="e.g. Phone-01, Laptop..."
                                className="px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 w-full max-w-[220px]"
                                autoFocus
                              />
                              <button onClick={saveLabel} className="text-success hover:text-success/80 p-1">
                                <Check size={14} />
                              </button>
                              <button onClick={cancelEdit} className="text-white/30 hover:text-white/60 p-1">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <HoverRevealText
                                as="h2"
                                text={item.displayName}
                                className="text-base sm:text-lg font-semibold text-white truncate"
                                wrapperClassName="flex-1 min-w-0"
                              />
                              <button
                                onClick={(event) => startEditing(event, item.licenseId)}
                                className="text-white/15 hover:text-white/50 shrink-0"
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                          )}

                          <HoverRevealText
                            as="p"
                            text={subtitle}
                            className="text-xs text-white/35 mt-1 truncate"
                          />
                          <p className="text-[11px] text-white/22 mt-1 truncate">
                            Last snapshot: {item.lastSeenDayKey ? formatDayKey(item.lastSeenDayKey) : '—'}
                          </p>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <LicenseTagPicker
                            value={presetTag}
                            onChange={(tag) => setPresetTag(item.licenseId, tag)}
                            onRemove={() => setPresetTag(item.licenseId, '')}
                          />
                          <OperatorPicker
                            value={operator}
                            allOperators={allOperators}
                            onChange={(name) => setOperator(item.licenseId, name)}
                            onRemove={() => setOperator(item.licenseId, '')}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Link Periods</p>
                          <p className="text-sm font-semibold text-white mt-1">{item.periodCount}</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Snapshot Days</p>
                          <p className="text-sm font-semibold text-accent-light mt-1">{item.snapshotDayCount}</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">First Seen</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{formatDayKey(item.firstSeenDayKey)}</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Last Change</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{formatHistoryTimestamp(item.lastChangedAt)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 mt-3">
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Device</p>
                          <p className="text-sm font-medium text-white/75 mt-1 truncate">{item.latestDeviceName || 'No remembered device'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glass overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>
                <table className="w-full text-left table-fixed">
                  <colgroup>
                    <col className="w-12" />
                    <col />
                    <col className="w-24 hidden sm:table-column" />
                    <col className="w-24 hidden md:table-column" />
                    <col className="w-32" />
                    <col className="w-28 hidden lg:table-column" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#0d0d1f]">
                    <tr className="border-b border-white/[0.06]">
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider">#</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider">License</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider hidden sm:table-cell">Links</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider hidden md:table-cell">Snapshots</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider">Last Change</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider hidden lg:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((item, index) => {
                      const presetTag = getPresetTag(item.licenseId);
                      const operator = getOperator(item.licenseId);
                      const isEditing = editingId === item.licenseId;

                      return (
                        <tr
                          key={item.licenseId}
                          onClick={(event) => openHistoryDetail(event, item.licenseId, isEditing)}
                          className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-4 text-sm text-white/30 align-middle">{(page - 1) * PAGE_SIZE + index + 1}</td>
                          <td className="py-2.5 px-4 align-middle">
                            {isEditing ? (
                              <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(event) => setEditValue(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') saveLabel(event);
                                    if (event.key === 'Escape') cancelEdit(event);
                                  }}
                                  placeholder="e.g. Phone-01, Laptop..."
                                  className="px-2 py-1 bg-white/[0.06] border border-white/[0.1] rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 w-32 sm:w-40"
                                  autoFocus
                                />
                                <button onClick={saveLabel} className="text-success hover:text-success/80 p-1">
                                  <Check size={14} />
                                </button>
                                <button onClick={cancelEdit} className="text-white/30 hover:text-white/60 p-1">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <HoverRevealText
                                  text={item.displayName}
                                  className="text-sm text-white font-medium truncate"
                                  wrapperClassName="min-w-0 max-w-full"
                                />
                                <LicenseStatusBadge status={item.status} size="sm" />
                                <span className="text-[10px] text-white/20 font-mono hidden lg:inline">{truncateHex(item.licenseId, 8, 6)}</span>
                                {!item.hasSavedHistory ? (
                                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/55">
                                    No Link History Yet
                                  </span>
                                ) : null}
                                <button
                                  onClick={(event) => startEditing(event, item.licenseId)}
                                  className="text-white/15 hover:text-white/50 shrink-0"
                                >
                                  <Pencil size={11} />
                                </button>
                                <div onClick={(event) => event.stopPropagation()}>
                                  <LicenseTagPicker
                                    value={presetTag}
                                    onChange={(tag) => setPresetTag(item.licenseId, tag)}
                                    onRemove={() => setPresetTag(item.licenseId, '')}
                                  />
                                </div>
                                <div onClick={(event) => event.stopPropagation()}>
                                  <OperatorPicker
                                    value={operator}
                                    allOperators={allOperators}
                                    onChange={(name) => setOperator(item.licenseId, name)}
                                    onRemove={() => setOperator(item.licenseId, '')}
                                  />
                                </div>
                                <span className="text-[10px] text-white/25 truncate basis-full">
                                  {item.latestDeviceName || 'No remembered device'}
                                  {item.lastSeenDayKey ? ` · Last snapshot ${formatDayKey(item.lastSeenDayKey)}` : ''}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-white/70 align-middle hidden sm:table-cell">{item.periodCount}</td>
                          <td className="py-2.5 px-4 text-sm text-accent-light align-middle hidden md:table-cell">{item.snapshotDayCount}</td>
                          <td className="py-2.5 px-4 text-sm text-white/40 align-middle">{formatHistoryTimestamp(item.lastChangedAt)}</td>
                          <td className="py-2.5 px-4 align-middle hidden lg:table-cell">
                            <LicenseStatusBadge status={item.status} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-white/[0.04] px-4 py-2 mt-3 flex items-center justify-between text-xs text-white/30">
            <span>Showing {paginated.length} of {filtered.length}</span>
            {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
          </div>
        </div>
      )}
    </div>
  );
}