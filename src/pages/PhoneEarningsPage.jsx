import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Layers, RefreshCw, Search, Smartphone, Trophy } from 'lucide-react';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';
import { DashboardSkeleton } from '../components/common/Skeleton';
import StatCard from '../components/dashboard/StatCard';
import { usePhoneEarningsGroups } from '../hooks/usePhoneEarningsGroups';
import { microsDetailed, microsToUsd } from '../utils/formatters';

function formatUsdFromNumber(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function MiniTile({ label, value, tone = 'text-white/75' }) {
  return (
    <div className="glass-subtle rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-white/35">
        <Smartphone size={22} />
      </div>
      <h2 className="text-base font-semibold text-white">No phone earnings found</h2>
      <p className="mt-2 text-sm text-white/40">Try another date range or refresh once reward history has loaded.</p>
    </div>
  );
}

export default function PhoneEarningsPage({ api }) {
  const { user, licenses: licenseMetadata, allocations, isLoading, error, manualRefresh } = api;
  const [search, setSearch] = useState('');
  const dateRange = useDateRangeFilter(allocations || [], (item) => item.completedAt, 'page-state:phone-earnings');
  const filteredAllocations = useMemo(() => dateRange.filtered || [], [dateRange.filtered]);
  const phoneGroups = usePhoneEarningsGroups({
    userId: user?.id,
    licenseMetadata,
    allocations: filteredAllocations,
  });

  const visiblePhoneGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return phoneGroups;

    return phoneGroups.filter((group) => (
      group.phoneName.toLowerCase().includes(query)
      || group.licenses.some((license) => license.displayName.toLowerCase().includes(query) || license.licenseId.toLowerCase().includes(query))
    ));
  }, [phoneGroups, search]);

  const totals = useMemo(() => {
    const totalMicros = visiblePhoneGroups.reduce((sum, group) => sum + group.totalMicros, 0);
    const totalLicenses = visiblePhoneGroups.reduce((sum, group) => sum + group.licenseCount, 0);
    const leader = visiblePhoneGroups[0] || null;

    return { totalMicros, totalLicenses, leader };
  }, [visiblePhoneGroups]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Phone Earnings</p>
          <h1 className="mt-2 text-xl sm:text-3xl font-bold text-white">Combined earnings by phone</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/40">
            Adds every payout from matching phone devices into one total, so all A30 licenses show as one combined A30 earning card.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <DateRangeFilter {...dateRange} />
          <button
            onClick={manualRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 glass text-xs sm:text-sm text-white/60 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border-danger/30 p-4 text-sm text-danger" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard icon={Smartphone} label="Phone Groups" value={String(visiblePhoneGroups.length)} sub={`${totals.totalLicenses} earning license${totals.totalLicenses === 1 ? '' : 's'}`} color="text-accent-light" />
        <StatCard icon={Activity} label="Grouped Earnings" value={`$${microsToUsd(totals.totalMicros)}`} sub={`${filteredAllocations.length} payout entr${filteredAllocations.length === 1 ? 'y' : 'ies'} in range`} color="text-success" />
        <StatCard icon={Trophy} label="Top Phone" value={totals.leader ? formatUsdFromNumber(totals.leader.amount) : '-'} sub={totals.leader?.phoneName || 'No leader yet'} color="text-warning" />
        <StatCard icon={Layers} label="Avg / Phone" value={visiblePhoneGroups.length ? formatUsdFromNumber(totals.totalMicros / visiblePhoneGroups.length / 1_000_000) : '-'} sub="Across visible phone groups" color="text-white/70" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Phone Cards</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Open a phone page to see graphs and contributors</h2>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search phone or license..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/25 focus:border-accent/50 focus:outline-none"
          />
        </div>
      </div>

      {visiblePhoneGroups.length ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4">
            {visiblePhoneGroups.map((group, index) => {
              return (
              <div key={group.phoneName} className="glass rounded-[1.25rem] border border-white/[0.06] transition-colors hover:border-white/[0.14]">
                <Link
                  to={`/phone-earnings/${encodeURIComponent(group.phoneName)}`}
                  className="block w-full p-4 text-left sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Earning
                        </span>
                        <span className="font-mono text-[10px] tracking-normal text-white/25">#{index + 1}</span>
                      </div>
                      <h3 className="truncate text-base font-semibold text-white sm:text-lg">{group.phoneName}</h3>
                      <p className="mt-1 text-xs text-white/35">
                        {group.licenseCount} grouped license{group.licenseCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <MiniTile label="Total Earned" value={`${formatUsdFromNumber(group.amount)} UP`} tone="text-success" />
                    <MiniTile label="Latest Reward" value={`$${microsDetailed(group.latestRewardMicros)} UP`} tone="text-warning" />
                    <MiniTile label="Last Reward" value={formatDate(group.latestRewardAt)} />
                    <MiniTile label="Last Active" value={formatDate(group.lastActivityAt || group.latestRewardAt)} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniTile label="Rewards Logged" value={String(group.entries)} />
                    <MiniTile label="Avg / License" value={`${formatUsdFromNumber(group.averagePerLicense)} UP`} />
                  </div>
                </Link>
              </div>
            );
            })}
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
