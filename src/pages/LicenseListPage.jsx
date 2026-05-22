import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/licenses/Pagination';
import LicenseTagPicker from '../components/licenses/LicenseTagPicker';
import LicenseStatusBadge from '../components/licenses/LicenseStatusBadge';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { usePersistentPageState } from '../hooks/usePersistentPageState';
import OperatorPicker from '../components/licenses/OperatorPicker';
import { Search, RefreshCw, Pencil, Check, X, Users } from 'lucide-react';
import HoverRevealText from '../components/common/HoverRevealText';
import { LicenseListSkeleton } from '../components/common/Skeleton';
import { microsToUsd, microsDetailed, truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, formatLicenseDistribution, formatLeaseTimeLeft, formatTaggedLicenseName, getLicenseBackendName, getLicenseDisplayName, getLicenseDistribution, getLicenseOriginalBackendName } from '../utils/licenseDisplay';

const PAGE_SIZE = 50;
const FILTER_SELECT_CLASS_NAME = 'w-full rounded-xl border border-white/[0.08] bg-[#151525]/90 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:border-accent/50 focus:bg-[#18182a]';
const FILTER_SELECT_ICON_CLASS_NAME = `${FILTER_SELECT_CLASS_NAME} pl-9`;
const FILTER_FIELD_CLASS_NAME = 'min-w-[170px] flex-1 sm:flex-none sm:w-[190px]';

function getDateValue(value) {
  return value ? new Date(value).getTime() : 0;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
}

function formatCutValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';

  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function getUptimeTone(uptime, minUptime, inactive = false) {
  if (inactive || uptime === null) {
    return {
      fillClass: 'bg-white/15',
      valueClass: 'text-white/30',
    };
  }

  if (minUptime === null || uptime >= minUptime + 10) {
    return {
      fillClass: 'bg-gradient-to-r from-success to-success/70',
      valueClass: 'text-success',
    };
  }

  if (uptime >= minUptime) {
    return {
      fillClass: 'bg-gradient-to-r from-warning to-warning/70',
      valueClass: 'text-warning',
    };
  }

  return {
    fillClass: 'bg-gradient-to-r from-danger to-danger/70',
    valueClass: 'text-danger',
  };
}

function hasBoundDevice(license) {
  return Boolean(license.deviceId || license.deviceName);
}

function isBelowMinUptime(license) {
  return hasBoundDevice(license)
    && license.uptime !== null
    && license.minUptime !== null
    && license.uptime < license.minUptime;
}

export default function LicenseListPage({ api }) {
  const { user, allocations, licenses: licenseMetadata, summary, isLoading, manualRefresh } = api;
  const summaryData = summary?.[0] || null;
  const { getLabel, setLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, setPresetTag, tagPresets, presetTags, cloneTagOrder, workTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator, setOperator, allOperators } = useOperatorTags(user?.id);
  const navigate = useNavigate();
  const [search, setSearch] = usePersistentPageState('page-state:licenses:search', '');
  const [sortBy, setSortBy] = usePersistentPageState('page-state:licenses:sort-by', 'totalMicros');
  const [sortDirection, setSortDirection] = usePersistentPageState('page-state:licenses:sort-direction', 'desc');
  const [operatorFilter, setOperatorFilter] = usePersistentPageState('page-state:licenses:operator-filter', 'all');
  const [tagFilter, setTagFilter] = usePersistentPageState('page-state:licenses:tag-filter', 'all');
  const [deviceFilter, setDeviceFilter] = usePersistentPageState('page-state:licenses:device-filter', 'all');
  const [taggedDeviceFilter, setTaggedDeviceFilter] = usePersistentPageState('page-state:licenses:tagged-device-filter', 'all');
  const [uloCutFilter, setUloCutFilter] = usePersistentPageState('page-state:licenses:ulo-cut-filter', 'all');
  const [statusFilter, setStatusFilter] = usePersistentPageState('page-state:licenses:status-filter', 'all');
  const [page, setPage] = usePersistentPageState('page-state:licenses:page', 1);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [viewMode, setViewMode] = usePersistentPageState('page-state:licenses:view-mode', 'cards');
  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenseMetadata || []).map((license) => [license.id, license])),
    [licenseMetadata]
  );
  const tagIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId]), {
      clone: cloneTagOrder,
      work: workTagOrder,
    }),
    [presetTags, licenseInfoById, cloneTagOrder, workTagOrder]
  );

  const allocationStatsById = useMemo(() => {
    const map = {};

    (allocations || []).forEach((allocation) => {
      if (!map[allocation.licenseId]) {
        map[allocation.licenseId] = {
          totalMicros: 0,
          entries: 0,
          latestDate: allocation.completedAt,
          latestReward: allocation.amountMicros,
        };
      }

      map[allocation.licenseId].totalMicros += allocation.amountMicros;
      map[allocation.licenseId].entries += 1;

      if (new Date(allocation.completedAt) > new Date(map[allocation.licenseId].latestDate)) {
        map[allocation.licenseId].latestDate = allocation.completedAt;
        map[allocation.licenseId].latestReward = allocation.amountMicros;
      }
    });

    return map;
  }, [allocations]);

  const getBackendName = (licenseId) => {
    return getLicenseBackendName(licenseInfoById[licenseId]);
  };

  const getOriginalBackendName = (licenseId) => {
    const originalName = getLicenseOriginalBackendName(licenseInfoById[licenseId]);
    const canonicalName = getBackendName(licenseId);

    return originalName && originalName !== canonicalName ? originalName : '';
  };

  const getDisplayName = (licenseId) => {
    return getLicenseDisplayName({
      customLabel: getLabel(licenseId),
      backendName: getBackendName(licenseId),
      presetTag: getPresetTag(licenseId),
      tagIndex: tagIndexById[licenseId] || null,
    });
  };

  const licenses = useMemo(() => {
    const seen = new Set();
    const merged = (licenseMetadata || []).map((license) => {
      seen.add(license.id);

      const stats = allocationStatsById[license.id] || null;
      const normalizedSharePercentage =
        typeof license.leaseSharePercentage === 'number'
          ? Number(license.leaseSharePercentage.toFixed(2))
          : null;
      const distribution = getLicenseDistribution(normalizedSharePercentage);
      const latestRewardAt = stats?.latestDate || null;
      const validationAt = license.validationLastSuccessAt || null;
      const lastActivityAt =
        getDateValue(validationAt) > getDateValue(latestRewardAt) ? validationAt : latestRewardAt;

      return {
        licenseId: license.id,
        totalMicros: stats?.totalMicros || 0,
        entries: stats?.entries || 0,
        latestReward: stats?.latestReward || 0,
        latestRewardAt,
        lastActivityAt,
        deviceId: license.deviceId || '',
        deviceName: license.deviceName || '',
        alias: license.alias || '',
        uptime: typeof license.uptime === 'number' ? license.uptime * 100 : null,
        minUptime:
          typeof license.leaseMinUptimePercentage === 'number'
            ? license.leaseMinUptimePercentage
            : null,
        isOnline: Boolean(license.isOnline),
        leaseSharePercentage: normalizedSharePercentage,
        uloCutPercentage: distribution.ulo,
        unoCutPercentage: distribution.uno,
        leaseFrom: license.leaseFrom || null,
        leaseTo: license.leaseTo || null,
        validationLastSuccessAt: validationAt,
      };
    });

    Object.entries(allocationStatsById).forEach(([licenseId, stats]) => {
      if (seen.has(licenseId)) {
        return;
      }

      merged.push({
        licenseId,
        totalMicros: stats.totalMicros,
        entries: stats.entries,
        latestReward: stats.latestReward,
        latestRewardAt: stats.latestDate || null,
        lastActivityAt: stats.latestDate || null,
        deviceId: '',
        deviceName: '',
        alias: '',
        uptime: null,
        minUptime: null,
        isOnline: false,
        leaseSharePercentage: null,
        uloCutPercentage: null,
        unoCutPercentage: null,
        leaseFrom: null,
        leaseTo: null,
        validationLastSuccessAt: null,
      });
    });

    return merged;
  }, [licenseMetadata, allocationStatsById]);

  const availableUloCuts = useMemo(() => {
    return Array.from(
      new Set(
        licenses
          .map((license) => license.uloCutPercentage)
          .filter((value) => typeof value === 'number')
          .map((value) => value.toFixed(2))
      )
    )
      .map((value) => Number(value))
      .sort((a, b) => b - a);
  }, [licenses]);

  const availableDeviceNames = useMemo(() => {
    return Array.from(
      new Set(
        licenses
          .map((license) => getBackendName(license.licenseId))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [licenses, getBackendName]);

  const availableTaggedDevices = useMemo(() => {
    const taggedDevices = new Map();

    licenses.forEach((license) => {
      const backendName = getBackendName(license.licenseId);
      const presetTag = getPresetTag(license.licenseId);

      if (!backendName || !presetTag) {
        return;
      }

      const key = `${backendName.toLowerCase()}::${presetTag.toLowerCase()}`;
      if (!taggedDevices.has(key)) {
        taggedDevices.set(key, {
          value: `${backendName}::${presetTag}`,
          label: formatTaggedLicenseName(backendName, presetTag),
          backendName,
          presetTag,
        });
      }
    });

    return Array.from(taggedDevices.values()).sort((a, b) => {
      const nameComparison = a.backendName.localeCompare(b.backendName, undefined, { sensitivity: 'base' });
      if (nameComparison !== 0) return nameComparison;

      return a.presetTag.localeCompare(b.presetTag, undefined, { sensitivity: 'base' });
    });
  }, [licenses, getBackendName, getPresetTag]);

  const filtered = useMemo(() => {
    let list = licenses;
    if (operatorFilter !== 'all') {
      if (operatorFilter === '__unassigned__') {
        list = list.filter((l) => !getOperator(l.licenseId));
      } else {
        list = list.filter((l) => getOperator(l.licenseId) === operatorFilter);
      }
    }
    if (tagFilter !== 'all') {
      list = list.filter((license) => {
        const presetTag = getPresetTag(license.licenseId);
        if (tagFilter === '__untagged__') {
          return !presetTag;
        }
        return presetTag === tagFilter;
      });
    }
    if (taggedDeviceFilter !== 'all') {
      const [selectedBackendName, selectedPresetTag] = taggedDeviceFilter.split('::');

      list = list.filter((license) => {
        const backendName = getBackendName(license.licenseId);
        const presetTag = getPresetTag(license.licenseId);

        return backendName === selectedBackendName && presetTag === selectedPresetTag;
      });
    }
    if (deviceFilter !== 'all') {
      list = list.filter((license) => {
        const backendName = getBackendName(license.licenseId);
        if (deviceFilter === '__unknown__') {
          return !backendName;
        }

        return backendName === deviceFilter;
      });
    }
    if (uloCutFilter !== 'all') {
      list = list.filter((license) => {
        if (uloCutFilter === '__unknown__') {
          return license.uloCutPercentage === null;
        }

        return (
          typeof license.uloCutPercentage === 'number'
          && license.uloCutPercentage.toFixed(2) === uloCutFilter
        );
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((license) => {
        if (statusFilter === 'online') return hasBoundDevice(license) && license.isOnline;
        if (statusFilter === 'offline') return hasBoundDevice(license) && !license.isOnline;
        if (statusFilter === 'below-min') return isBelowMinUptime(license);
        if (statusFilter === 'unbound') return !hasBoundDevice(license);
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        l.licenseId.toLowerCase().includes(q) ||
        getDisplayName(l.licenseId).toLowerCase().includes(q) ||
        getBackendName(l.licenseId).toLowerCase().includes(q) ||
        getPresetTag(l.licenseId).toLowerCase().includes(q) ||
        (getOperator(l.licenseId) || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'totalMicros') comparison = b.totalMicros - a.totalMicros;
      if (sortBy === 'latestDate') comparison = getDateValue(b.lastActivityAt) - getDateValue(a.lastActivityAt);
      if (sortBy === 'licenseId') comparison = a.licenseId.localeCompare(b.licenseId);
      if (sortBy === 'latestReward') comparison = b.latestReward - a.latestReward;
      if (sortBy === 'uptime') comparison = (b.uptime ?? -1) - (a.uptime ?? -1);
      if (sortBy === 'name') {
        const nameA = getDisplayName(a.licenseId) || 'zzz';
        const nameB = getDisplayName(b.licenseId) || 'zzz';
        comparison = nameA.localeCompare(nameB);
      }

      if ((sortBy === 'latestReward' || sortBy === 'latestDate') && sortDirection === 'asc') {
        return comparison * -1;
      }

      return comparison;
    });
  }, [licenses, search, sortBy, sortDirection, operatorFilter, tagFilter, taggedDeviceFilter, deviceFilter, uloCutFilter, statusFilter, getOperator, getDisplayName, getBackendName, getPresetTag]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilterCount = [
    Boolean(search.trim()),
    operatorFilter !== 'all',
    tagFilter !== 'all',
    taggedDeviceFilter !== 'all',
    deviceFilter !== 'all',
    uloCutFilter !== 'all',
    statusFilter !== 'all',
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  useEffect(() => {
    if (totalPages === 0 && page !== 1) {
      setPage(1);
      return;
    }

    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, setPage, totalPages]);

  const handleSearchChange = (val) => { setSearch(val); setPage(1); };

  const clearFilters = () => {
    setSearch('');
    setOperatorFilter('all');
    setTagFilter('all');
    setTaggedDeviceFilter('all');
    setDeviceFilter('all');
    setUloCutFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const openLicenseDetail = (event, licenseId, isEditing) => {
    if (isEditing) return;

    const detailPath = `/licenses/${encodeURIComponent(licenseId)}`;
    if (event.ctrlKey || event.metaKey) {
      const absoluteUrl = `${window.location.origin}${detailPath}`;
      window.open(absoluteUrl, '_blank', 'noopener');
      return;
    }

    navigate(detailPath);
  };

  const handleLatestRewardSortToggle = () => {
    setPage(1);

    if (sortBy === 'latestReward') {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }

    setSortBy('latestReward');
    setSortDirection('desc');
  };

  const handleLatestDateSortToggle = () => {
    setPage(1);

    if (sortBy === 'latestDate') {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }

    setSortBy('latestDate');
    setSortDirection('desc');
  };

  const startEditing = (e, licenseId) => {
    e.stopPropagation();
    setEditingId(licenseId);
    setEditValue(getDisplayName(licenseId));
  };

  const saveLabel = (e) => {
    e.stopPropagation();
    const success = setLabel(editingId, editValue);
    if (success) setEditingId(null);
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  if (isLoading) {
    return <LicenseListSkeleton />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] sm:h-[calc(100vh-4rem)]">
      {/* Fixed header */}
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-white">Licenses</h1>
            <p className="text-[11px] sm:text-sm text-white/40 mt-0.5 sm:mt-1 truncate">
              {licenses.length} licenses - Total: <span className="text-success font-medium">${summaryData ? microsToUsd(summaryData.totalAmountMicros) : '—'} UP</span>
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
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full rounded-[1rem] border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/30 backdrop-blur focus:outline-none focus:border-accent/50 focus:bg-white/[0.06]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 sm:gap-3 lg:min-w-fit">
                <div className="hidden xl:block min-w-[160px]">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/30">Filter Shelf</p>
                  <p className="mt-1 text-xs text-white/45">
                    {hasActiveFilters ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'All licenses visible'}
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
                    onChange={(e) => { setOperatorFilter(e.target.value); setPage(1); }}
                    className={FILTER_SELECT_ICON_CLASS_NAME}
                  >
                    <option value="all" className="bg-[#151525] text-white">All Operators</option>
                    {allOperators.map((op) => (
                      <option key={op} value={op} className="bg-[#151525] text-white">{op}</option>
                    ))}
                    <option value="__unassigned__" className="bg-[#151525] text-white/50">Unassigned</option>
                  </select>
                </div>
              )}

              <div className={FILTER_FIELD_CLASS_NAME}>
                <select
                  value={tagFilter}
                  onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
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
                  value={taggedDeviceFilter}
                  onChange={(e) => { setTaggedDeviceFilter(e.target.value); setPage(1); }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="all" className="bg-[#151525] text-white">All Tagged Devices</option>
                  {availableTaggedDevices.map((item) => (
                    <option key={item.value} value={item.value} className="bg-[#151525] text-white">{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[170px] flex-1 sm:flex-none sm:w-[220px]">
                <select
                  value={deviceFilter}
                  onChange={(e) => { setDeviceFilter(e.target.value); setPage(1); }}
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
                  value={uloCutFilter}
                  onChange={(e) => { setUloCutFilter(e.target.value); setPage(1); }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="all" className="bg-[#151525] text-white">All ULO Cuts</option>
                  {availableUloCuts.map((cut) => (
                    <option key={cut} value={cut.toFixed(2)} className="bg-[#151525] text-white">{formatCutValue(cut)}% ULO</option>
                  ))}
                  <option value="__unknown__" className="bg-[#151525] text-white/50">No Lease Data</option>
                </select>
              </div>

              <div className={FILTER_FIELD_CLASS_NAME}>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
                  onChange={(e) => {
                    const nextSortBy = e.target.value;
                    setSortBy(nextSortBy);
                    if (nextSortBy === 'latestReward' || nextSortBy === 'latestDate') {
                      setSortDirection('desc');
                    }
                    setPage(1);
                  }}
                  className={FILTER_SELECT_CLASS_NAME}
                >
                  <option value="totalMicros" className="bg-[#151525] text-white">Sort by Total Rewards</option>
                  <option value="uptime" className="bg-[#151525] text-white">Sort by Uptime</option>
                  <option value="latestReward" className="bg-[#151525] text-white">Sort by Latest Reward</option>
                  <option value="latestDate" className="bg-[#151525] text-white">Sort by Latest Date</option>
                  <option value="name" className="bg-[#151525] text-white">Sort by Name</option>
                  <option value="licenseId" className="bg-[#151525] text-white">Sort by License ID</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable card */}
      {paginated.length === 0 ? (
        <div className="text-center py-12 text-white/40">No licenses found.</div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {viewMode === 'cards' ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1" style={{ scrollbarWidth: 'thin' }}>
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4 pb-1">
                {paginated.map((lic) => {
                  const customLabel = getLabel(lic.licenseId);
                  const presetTag = getPresetTag(lic.licenseId);
                  const tagIndex = tagIndexById[lic.licenseId] || null;
                  const displayName = getDisplayName(lic.licenseId);
                  const backendName = getBackendName(lic.licenseId);
                  const originalBackendName = getOriginalBackendName(lic.licenseId);
                  const taggedName = formatTaggedLicenseName(backendName, presetTag, tagIndex);
                  const operator = getOperator(lic.licenseId);
                  const isEditing = editingId === lic.licenseId;
                  const deviceBound = hasBoundDevice(lic);
                  const uptimeTone = getUptimeTone(lic.uptime, lic.minUptime, !deviceBound);
                  const uptimeWidth = lic.uptime === null ? 0 : Math.max(0, Math.min(100, lic.uptime));
                  const statusKey = deviceBound ? (lic.isOnline ? 'online' : 'offline') : 'unbound';
                  const distributionLabel = formatLicenseDistribution(lic.leaseSharePercentage);
                  const leaseTimeLeft = formatLeaseTimeLeft(lic.leaseTo);
                  const subtitle = customLabel && taggedName
                    ? `Auto tag: ${taggedName}`
                    : customLabel && backendName
                      ? `Device: ${backendName}`
                      : presetTag && backendName
                        ? `Base device: ${backendName}`
                        : lic.validationLastSuccessAt
                          ? `Validated ${formatDate(lic.validationLastSuccessAt)}`
                          : (deviceBound ? 'Device bound' : 'Awaiting device binding');
                  const alerts = [];
                  if (isBelowMinUptime(lic)) {
                    alerts.push({ label: 'Below Min', className: 'border-danger/20 bg-danger/10 text-danger' });
                  }
                  if (!deviceBound) {
                    alerts.push({ label: 'Unbound', className: 'border-white/[0.08] bg-white/[0.04] text-white/45' });
                  } else if (!lic.isOnline) {
                    alerts.push({ label: 'Offline', className: 'border-warning/20 bg-warning/10 text-warning' });
                  }

                  return (
                    <div
                      key={lic.licenseId}
                      onClick={(event) => openLicenseDetail(event, lic.licenseId, isEditing)}
                      className="glass p-4 sm:p-5 rounded-[1.25rem] border border-white/[0.06] hover:border-white/[0.14] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <LicenseStatusBadge status={statusKey} size="sm" uppercase />
                            <span className="font-mono text-[10px] tracking-normal text-white/25">{truncateHex(lic.licenseId, 8, 6)}</span>
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
                                text={displayName || truncateHex(lic.licenseId, 8, 6)}
                                className="text-base sm:text-lg font-semibold text-white truncate"
                                wrapperClassName="flex-1 min-w-0"
                              />
                              <button
                                onClick={(event) => startEditing(event, lic.licenseId)}
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
                          {originalBackendName && (
                            <HoverRevealText
                              as="p"
                              text={`Original identity: ${originalBackendName}`}
                              className="text-[11px] text-white/22 mt-1 truncate"
                            />
                          )}
                          {alerts.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {alerts.map((alert) => (
                                <span
                                  key={alert.label}
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${alert.className}`}
                                >
                                  {alert.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <LicenseTagPicker
                            value={presetTag}
                            onChange={(tag) => setPresetTag(lic.licenseId, tag)}
                            onRemove={() => setPresetTag(lic.licenseId, '')}
                          />
                          <OperatorPicker
                            value={operator}
                            allOperators={allOperators}
                            onChange={(name) => setOperator(lic.licenseId, name)}
                            onRemove={() => setOperator(lic.licenseId, '')}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Total Earned</p>
                          <p className="text-sm font-semibold text-success mt-1">${microsDetailed(lic.totalMicros)} UP</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Reward</p>
                          <p className="text-sm font-semibold text-warning mt-1">${microsDetailed(lic.latestReward)} UP</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Last Reward</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{formatDate(lic.latestRewardAt)}</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Last Active</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{formatDate(lic.lastActivityAt)}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-white/40">Uptime</span>
                          <span className={`${uptimeTone.valueClass} font-medium`}>
                            {deviceBound ? formatPercent(lic.uptime) : 'Not bound'}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full ${uptimeTone.fillClass}`} style={{ width: `${uptimeWidth}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-white/30 gap-3">
                          <span className="truncate">
                            {lic.entries ? `${lic.entries} reward${lic.entries !== 1 ? 's' : ''} logged` : 'No reward history yet'}
                          </span>
                          <span className="shrink-0">Min. Uptime: {lic.minUptime !== null ? `${lic.minUptime}%` : '—'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Distribution</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{distributionLabel}</p>
                        </div>
                        <div className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Lease Left</p>
                          <p className="text-sm font-medium text-white/75 mt-1">{leaseTimeLeft}</p>
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
                    <col className="w-28 hidden sm:table-column" />
                    <col className="w-28" />
                    <col className="w-28 hidden md:table-column" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#0d0d1f]">
                    <tr className="border-b border-white/[0.06]">
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider">#</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider">License</th>
                      <th className="py-3 px-4 text-xs font-medium text-white/30 uppercase tracking-wider hidden sm:table-cell">Total Earned</th>
                      <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={handleLatestRewardSortToggle}
                          className={`inline-flex items-center gap-1.5 ${sortBy === 'latestReward' ? 'text-warning' : 'text-white/30 hover:text-white/60'}`}
                        >
                          <span>Latest Reward</span>
                          <span className="text-[9px] leading-none">
                            {sortBy === 'latestReward' ? (sortDirection === 'desc' ? 'DESC' : 'ASC') : 'SORT'}
                          </span>
                        </button>
                      </th>
                      <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider hidden md:table-cell">
                        <button
                          type="button"
                          onClick={handleLatestDateSortToggle}
                          className={`inline-flex items-center gap-1.5 ${sortBy === 'latestDate' ? 'text-warning' : 'text-white/30 hover:text-white/60'}`}
                        >
                          <span>Last Active</span>
                          <span className="text-[9px] leading-none">
                            {sortBy === 'latestDate' ? (sortDirection === 'desc' ? 'DESC' : 'ASC') : 'SORT'}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((lic, i) => {
                      const customLabel = getLabel(lic.licenseId);
                      const presetTag = getPresetTag(lic.licenseId);
                      const tagIndex = tagIndexById[lic.licenseId] || null;
                      const displayName = getDisplayName(lic.licenseId);
                      const backendName = getBackendName(lic.licenseId);
                      const originalBackendName = getOriginalBackendName(lic.licenseId);
                      const taggedName = formatTaggedLicenseName(backendName, presetTag, tagIndex);
                      const operator = getOperator(lic.licenseId);
                      const isEditing = editingId === lic.licenseId;
                      const statusKey = hasBoundDevice(lic) ? (lic.isOnline ? 'online' : 'offline') : 'unbound';
                      const distributionLabel = formatLicenseDistribution(lic.leaseSharePercentage);
                      const leaseTimeLeft = formatLeaseTimeLeft(lic.leaseTo);

                      return (
                        <tr
                          key={lic.licenseId}
                          onClick={(event) => openLicenseDetail(event, lic.licenseId, isEditing)}
                          className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-4 text-sm text-white/30 align-middle">{(page - 1) * PAGE_SIZE + i + 1}</td>
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
                                  text={displayName || truncateHex(lic.licenseId, 8, 6)}
                                  className="text-sm text-white font-medium truncate"
                                  wrapperClassName="min-w-0 max-w-full"
                                />
                                <LicenseStatusBadge status={statusKey} size="sm" />
                                {displayName && (
                                  <span className="text-[10px] text-white/20 font-mono hidden lg:inline">{truncateHex(lic.licenseId, 8, 6)}</span>
                                )}
                                <button
                                  onClick={(event) => startEditing(event, lic.licenseId)}
                                  className="text-white/15 hover:text-white/50 shrink-0"
                                >
                                  <Pencil size={11} />
                                </button>
                                <div onClick={(event) => event.stopPropagation()}>
                                  <LicenseTagPicker
                                    value={presetTag}
                                    onChange={(tag) => setPresetTag(lic.licenseId, tag)}
                                    onRemove={() => setPresetTag(lic.licenseId, '')}
                                  />
                                </div>
                                <div onClick={(event) => event.stopPropagation()}>
                                  <OperatorPicker
                                    value={operator}
                                    allOperators={allOperators}
                                    onChange={(name) => setOperator(lic.licenseId, name)}
                                    onRemove={() => setOperator(lic.licenseId, '')}
                                  />
                                </div>
                                {(customLabel && backendName) || (customLabel && taggedName) ? (
                                  <HoverRevealText
                                    text={taggedName ? `Auto tag: ${taggedName}` : `Device: ${backendName}`}
                                    className="text-[10px] text-white/25 truncate basis-full"
                                    wrapperClassName="basis-full"
                                  />
                                ) : null}
                                {!customLabel && presetTag && backendName && (
                                  <HoverRevealText
                                    text={`Base device: ${backendName}`}
                                    className="text-[10px] text-white/25 truncate basis-full"
                                    wrapperClassName="basis-full"
                                  />
                                )}
                                {originalBackendName && (
                                  <HoverRevealText
                                    text={`Original identity: ${originalBackendName}`}
                                    className="text-[10px] text-white/22 truncate basis-full"
                                    wrapperClassName="basis-full"
                                  />
                                )}
                                {(distributionLabel !== '—' || leaseTimeLeft !== '—') && (
                                  <span className="text-[10px] text-white/25 truncate basis-full">
                                    {distributionLabel !== '—' ? distributionLabel : 'No distribution'}
                                    {leaseTimeLeft !== '—' ? ` · ${leaseTimeLeft}` : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-success font-medium align-middle hidden sm:table-cell">
                            ${microsDetailed(lic.totalMicros)} UP
                          </td>
                          <td className="py-2.5 px-4 text-sm text-warning font-medium align-middle">
                            ${microsDetailed(lic.latestReward)} UP
                          </td>
                          <td className="py-2.5 px-4 text-sm text-white/40 align-middle hidden md:table-cell">
                            {formatDate(lic.lastActivityAt)}
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
