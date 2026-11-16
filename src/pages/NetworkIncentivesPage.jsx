import { useState, useMemo, useCallback } from 'react';
import {
  Wallet,
  Clock,
  TrendingUp,
  RefreshCw,
  Search,
  Copy,
  Check,
  Calendar,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import {
  microsToUsd,
  microsDetailed,
  truncateHex,
  formatDateTime,
  formatDateOnly,
  formatIncentiveType,
} from '../utils/formatters';

const ITEMS_PER_PAGE = 25;

export default function NetworkIncentivesPage({ api }) {
  const {
    user,
    balance,
    pendingBalance,
    totalEarned,
    allocations = [],
    summary = [],
    isLoading,
    error,
    manualRefresh,
  } = api;

  const { getLabel } = useLicenseLabels(user?.id);

  // Active filter tab: 'all' | 'pending' | 'available'
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnlockDate, setSelectedUnlockDate] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'highest' | 'unlock_date'
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState(null);
  const [now] = useState(() => Date.now());

  const summaryItem = useMemo(() => {
    if (Array.isArray(summary) && summary.length > 0) return summary[0];
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) return summary;
    return null;
  }, [summary]);

  const resolvedAvailableBalance = balance !== null ? balance : 0;
  const resolvedPendingBalance = pendingBalance !== null
    ? pendingBalance
    : (summaryItem?.pendingAmountMicros ?? 0);
  const resolvedTotalEarned = totalEarned !== null
    ? totalEarned
    : (summaryItem?.totalAmountMicros ?? 0);

  // Copy helper
  const handleCopy = useCallback((text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast.success('License ID copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, []);

  // Classify each allocation as pending or available
  const enrichedAllocations = useMemo(() => {
    return allocations.map((item) => {
      const availableTime = item.availableAt ? new Date(item.availableAt).getTime() : null;
      const isPending = availableTime !== null && !Number.isNaN(availableTime) && availableTime > now;
      const daysUntilUnlock = isPending ? Math.ceil((availableTime - now) / (1000 * 60 * 60 * 24)) : 0;
      const unlockDateKey = item.availableAt ? item.availableAt.slice(0, 10) : null;

      return {
        ...item,
        isPending,
        availableTime,
        daysUntilUnlock,
        unlockDateKey,
        customLabel: getLabel(item.licenseId) || null,
      };
    });
  }, [allocations, getLabel, now]);

  // Compute upcoming release batches
  const releaseBatches = useMemo(() => {
    const batchesMap = new Map();

    enrichedAllocations.forEach((item) => {
      if (!item.isPending || !item.unlockDateKey) return;

      const existing = batchesMap.get(item.unlockDateKey);
      if (existing) {
        existing.totalMicros += item.amountMicros;
        existing.count += 1;
        existing.licenses.add(item.licenseId);
      } else {
        batchesMap.set(item.unlockDateKey, {
          dateKey: item.unlockDateKey,
          availableAt: item.availableAt,
          daysUntilUnlock: item.daysUntilUnlock,
          totalMicros: item.amountMicros,
          count: 1,
          licenses: new Set([item.licenseId]),
        });
      }
    });

    return Array.from(batchesMap.values()).sort(
      (a, b) => new Date(a.availableAt).getTime() - new Date(b.availableAt).getTime()
    );
  }, [enrichedAllocations]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let pendingCount = 0;
    let availableCount = 0;
    let pendingMicros = 0;
    let availableMicros = 0;

    enrichedAllocations.forEach((item) => {
      if (item.isPending) {
        pendingCount += 1;
        pendingMicros += item.amountMicros;
      } else {
        availableCount += 1;
        availableMicros += item.amountMicros;
      }
    });

    return {
      all: enrichedAllocations.length,
      pending: pendingCount,
      available: availableCount,
      pendingMicros,
      availableMicros,
    };
  }, [enrichedAllocations]);

  // Filter and sort
  const filteredAllocations = useMemo(() => {
    let list = enrichedAllocations;

    // Tab filter
    if (activeTab === 'pending') {
      list = list.filter((item) => item.isPending);
    } else if (activeTab === 'available') {
      list = list.filter((item) => !item.isPending);
    }

    // Specific unlock date filter
    if (selectedUnlockDate !== 'all') {
      list = list.filter((item) => item.unlockDateKey === selectedUnlockDate);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const matchesId = item.licenseId?.toLowerCase().includes(q);
        const matchesLabel = item.customLabel?.toLowerCase().includes(q);
        const matchesType = item.type?.toLowerCase().includes(q);
        const matchesDesc = item.description?.toLowerCase().includes(q);
        return matchesId || matchesLabel || matchesType || matchesDesc;
      });
    }

    // Sort
    const sorted = [...list];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
    } else if (sortBy === 'highest') {
      sorted.sort((a, b) => b.amountMicros - a.amountMicros);
    } else if (sortBy === 'unlock_date') {
      sorted.sort((a, b) => {
        const timeA = a.availableTime || 0;
        const timeB = b.availableTime || 0;
        return timeA - timeB;
      });
    }

    return sorted;
  }, [enrichedAllocations, activeTab, selectedUnlockDate, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAllocations.length / ITEMS_PER_PAGE));
  const paginatedAllocations = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAllocations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAllocations, currentPage]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
              <Sparkles size={12} />
              Vesting & Distribution
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Network Incentives
          </h1>
          <p className="text-xs sm:text-sm text-white/45 mt-1">
            Track pending vesting, release dates, and historical reward distributions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => manualRefresh?.()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh latest balance and incentive allocations"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border-danger/30 p-4 rounded-xl text-sm text-danger" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          {error}
        </div>
      )}

      {/* Hero 3-Stat KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        {/* Total Available */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-white/[0.02] to-transparent shadow-lg shadow-emerald-500/5 group hover:border-emerald-500/35"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-400/80">
              Total Available
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <Wallet size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              ${microsToUsd(resolvedAvailableBalance)}
            </span>
            <span className="text-sm font-semibold text-emerald-400">UP</span>
          </div>
          <p className="text-[11px] text-white/40 mt-2 flex items-center gap-1.5">
            <Unlock size={12} className="text-emerald-400" />
            <span>Unlocked & ready for withdrawal</span>
          </p>
        </div>

        {/* Pending */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] via-white/[0.02] to-transparent shadow-lg shadow-amber-500/5 group hover:border-amber-500/35"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-amber-400/80">
              Pending Lockup
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              ${microsToUsd(resolvedPendingBalance)}
            </span>
            <span className="text-sm font-semibold text-amber-400">UP</span>
          </div>
          <p className="text-[11px] text-white/40 mt-2 flex items-center gap-1.5">
            <Lock size={12} className="text-amber-400" />
            <span>Vesting in 7-day maturity hold</span>
          </p>
        </div>

        {/* Total Earned */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-white/[0.02] to-transparent shadow-lg shadow-cyan-500/5 group hover:border-cyan-500/35"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-400/80">
              Total Earned
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              ${microsToUsd(resolvedTotalEarned)}
            </span>
            <span className="text-sm font-semibold text-cyan-400">UP</span>
          </div>
          <p className="text-[11px] text-white/40 mt-2 flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-cyan-400" />
            <span>Cumulative all-time incentives</span>
          </p>
        </div>
      </div>

      {/* Release Batches / Unlock Schedule (Segregation by Release Date) */}
      {releaseBatches.length > 0 && (
        <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-amber-400" />
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-wide">
                Upcoming Unlock Batches
              </h2>
            </div>
            <span className="text-[11px] text-white/40">
              Click any batch to filter allocations unlocking on that date
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {releaseBatches.map((batch) => {
              const isSelected = selectedUnlockDate === batch.dateKey;
              return (
                <button
                  key={batch.dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedUnlockDate(isSelected ? 'all' : batch.dateKey);
                    setCurrentPage(1);
                  }}
                  className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-amber-400/50 bg-amber-400/10 shadow-md shadow-amber-400/10 ring-1 ring-amber-400/30'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {formatDateOnly(batch.availableAt)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-400/15 text-amber-300 border border-amber-400/25">
                      {batch.daysUntilUnlock === 0 ? 'Today' : batch.daysUntilUnlock === 1 ? 'Tomorrow' : `in ${batch.daysUntilUnlock} days`}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-lg font-bold text-emerald-400">
                      +${microsToUsd(batch.totalMicros)} <span className="text-xs text-white/50 font-normal">UP</span>
                    </span>
                    <span className="text-[11px] text-white/45">
                      {batch.count} incentive{batch.count === 1 ? '' : 's'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedUnlockDate !== 'all' && (
            <div className="mt-3 flex items-center justify-between text-xs text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
              <span>Showing allocations unlocking on: <strong>{formatDateOnly(selectedUnlockDate)}</strong></span>
              <button
                type="button"
                onClick={() => setSelectedUnlockDate('all')}
                className="underline hover:text-white cursor-pointer text-[11px]"
              >
                Clear date filter
              </button>
            </div>
          )}
        </section>
      )}

      {/* Main Filter & Feed Section */}
      <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08] space-y-5">
        {/* Tab Switcher & Count Badges */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* All */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'all'
                  ? 'bg-gradient-to-r from-accent/20 to-accent-cyan/15 text-white border border-white/20 shadow-sm'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>All Incentives</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-white/70">
                {tabCounts.all}
              </span>
            </button>

            {/* Pending */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('pending');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30 shadow-sm'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Clock size={13} className={activeTab === 'pending' ? 'text-amber-400' : ''} />
              <span>Pending Lockup</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400/20 text-amber-300">
                {tabCounts.pending}
              </span>
            </button>

            {/* Available */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('available');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'available'
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shadow-sm'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Unlock size={13} className={activeTab === 'available' ? 'text-emerald-400' : ''} />
              <span>Available / Unlocked</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400/20 text-emerald-300">
                {tabCounts.available}
              </span>
            </button>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search license or label..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-white/[0.03] border border-white/[0.08] text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-xl text-xs bg-white/[0.03] border border-white/[0.08] text-white/80 focus:outline-none focus:border-cyan-400/50 transition-colors cursor-pointer"
            >
              <option value="newest" className="bg-slate-900 text-white">Newest First</option>
              <option value="oldest" className="bg-slate-900 text-white">Oldest First</option>
              <option value="highest" className="bg-slate-900 text-white">Highest Amount</option>
              <option value="unlock_date" className="bg-slate-900 text-white">Unlock Date</option>
            </select>
          </div>
        </div>

        {/* Incentive Cards Feed */}
        <div className="space-y-3">
          {paginatedAllocations.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-sm">
              {searchQuery || selectedUnlockDate !== 'all'
                ? 'No incentive allocations match your current filters.'
                : 'No network incentive allocations found.'}
            </div>
          ) : (
            paginatedAllocations.map((item) => {
              const formattedDate = formatDateTime(item.completedAt || item.createdAt);
              const isCopied = copiedId === item.id;
              const formattedAmount = microsDetailed(item.amountMicros);
              const title = formatIncentiveType(item.type, item.description);

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 rounded-2xl border border-white/[0.06] bg-slate-900/60 hover:bg-slate-800/40 hover:border-white/[0.12] transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 group"
                >
                  {/* Left Column: Details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white tracking-wide">
                        {title}
                      </span>
                      {item.customLabel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 truncate max-w-[150px]">
                          {item.customLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/40">
                      <span>{formattedDate}</span>
                      <span>to</span>
                      <span className="font-mono text-white/70">
                        {truncateHex(item.licenseId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.licenseId, item.id)}
                        title="Copy license ID"
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                      >
                        {isCopied ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>

                    {/* Unlock Status Badge */}
                    <div className="pt-0.5">
                      {item.isPending ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300/90 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                          <Clock size={11} className="text-amber-400" />
                          <span>
                            Available from {formatDateOnly(item.availableAt)}
                            {item.daysUntilUnlock > 0 ? ` (in ${item.daysUntilUnlock}d)` : ' (today)'}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/90 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-md">
                          <Check size={11} className="text-emerald-400" />
                          <span>Unlocked & Available</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Amount */}
                  <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-white/[0.06] pt-2 sm:pt-0">
                    <span className="text-xs uppercase tracking-wider text-white/30 sm:hidden">
                      Amount
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg sm:text-xl font-bold text-emerald-400 font-mono tracking-tight">
                        +{formattedAmount}
                      </span>
                      <span className="text-xs font-semibold text-emerald-400/70">UP</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] text-xs text-white/50">
            <span>
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAllocations.length)} of{' '}
              {filteredAllocations.length}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-white"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 py-1 text-white font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-white"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
