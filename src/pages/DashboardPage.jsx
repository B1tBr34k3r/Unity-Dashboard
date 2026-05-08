import { useMemo } from 'react';
import StatCard from '../components/dashboard/StatCard';
import MonthlyCycleChart from '../components/dashboard/MonthlyCycleChart';
import OperatorBadge from '../components/licenses/OperatorBadge';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { formatRewardMonthLabel, getCycleInfo, getRewardMonthKey, microsToUsd } from '../utils/formatters';
import { Wallet, TrendingUp, Calendar, Clock, RefreshCw, Users } from 'lucide-react';
import { DashboardSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';

export default function DashboardPage({ api }) {
  const { balance, allocations, summary, historyInfo, isLoading, error, refetch } = api;
  const summaryData = summary?.[0] || null;
  const { getOperator, allOperators } = useOperatorTags();
  const dateRange = useDateRangeFilter(allocations, (item) => item.completedAt, 'page-state:dashboard');
  const filteredAllocations = dateRange.filtered;

  const cycleData = useMemo(() => {
    const byMonth = (filteredAllocations || []).reduce((map, allocation) => {
      const key = getRewardMonthKey(allocation.completedAt);

      if (!map[key]) {
        map[key] = {
          key,
          label: formatRewardMonthLabel(key),
          amountMicros: 0,
          count: 0,
        };
      }

      map[key].amountMicros += allocation.amountMicros;
      map[key].count += 1;
      return map;
    }, {});

    return Object.values(byMonth)
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        amount: Number((entry.amountMicros / 1_000_000).toFixed(2)),
        count: entry.count,
      }));
  }, [filteredAllocations]);

  // Operator summary: group allocations by operator with monthly cycle breakdown
  const operatorSummary = useMemo(() => {
    if (!allOperators.length || !filteredAllocations?.length) return [];

    const byOperator = {};
    const licenseIds = new Set(filteredAllocations.map((a) => a.licenseId));

    licenseIds.forEach((lid) => {
      const op = getOperator(lid) || '__unassigned__';
      if (!byOperator[op]) byOperator[op] = { name: op, totalMicros: 0, licenseCount: 0, latestDate: null, cycles: {} };
      byOperator[op].licenseCount++;
    });

    filteredAllocations.forEach((a) => {
      const op = getOperator(a.licenseId) || '__unassigned__';
      if (!byOperator[op]) byOperator[op] = { name: op, totalMicros: 0, licenseCount: 0, latestDate: null, cycles: {} };
      byOperator[op].totalMicros += a.amountMicros;
      if (!byOperator[op].latestDate || new Date(a.completedAt) > new Date(byOperator[op].latestDate)) {
        byOperator[op].latestDate = a.completedAt;
      }
      // Aggregate by 5th-cycle month
      const cycle = getCycleInfo(a.completedAt);
      if (!byOperator[op].cycles[cycle.key]) {
        byOperator[op].cycles[cycle.key] = { key: cycle.key, label: cycle.label, totalMicros: 0 };
      }
      byOperator[op].cycles[cycle.key].totalMicros += a.amountMicros;
    });

    return Object.values(byOperator)
      .map((op) => ({
        ...op,
        cycles: Object.values(op.cycles).sort((a, b) => a.key.localeCompare(b.key)),
      }))
      .sort((a, b) => b.totalMicros - a.totalMicros);
  }, [filteredAllocations, allOperators, getOperator]);

  const historyStatus = useMemo(() => {
    switch (historyInfo?.backfillStatus) {
      case 'complete':
        return {
          label: 'History Synced',
          className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
        };
      case 'backfilling':
        return {
          label: 'Backfilling Older Rewards',
          className: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100',
        };
      case 'partial':
        return {
          label: 'Partial Archive',
          className: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
        };
      case 'unsupported':
        return {
          label: 'Stored Recent History',
          className: 'border-slate-400/30 bg-slate-400/10 text-slate-100',
        };
      default:
        return {
          label: 'History Pending',
          className: 'border-white/10 bg-white/[0.04] text-white/60',
        };
    }
  }, [historyInfo]);

  const historyRangeLabel = useMemo(() => {
    if (!historyInfo?.oldestCompletedAt || !historyInfo?.newestCompletedAt) {
      return null;
    }

    const formatDate = (value) => new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${formatDate(historyInfo.oldestCompletedAt)} -> ${formatDate(historyInfo.newestCompletedAt)}`;
  }, [historyInfo]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white">Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${historyStatus.className}`}>
              {historyStatus.label}
            </span>
            {historyInfo?.allocationCount ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                {historyInfo.allocationCount} Stored Rewards
              </span>
            ) : null}
            {historyRangeLabel ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                {historyRangeLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter {...dateRange} />
          <button
            onClick={refetch}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 glass text-xs sm:text-sm text-white/60 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border-danger/30 p-4 mb-6 text-sm text-danger" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard
          icon={Wallet}
          label="Available Balance"
          value={balance !== null ? `$${microsToUsd(balance)}` : '—'}
          sub="UP"
          color="text-success"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Earned"
          value={summaryData ? `$${microsToUsd(summaryData.totalAmountMicros)}` : '—'}
          sub="UP all-time"
          color="text-accent-light"
        />
        <StatCard
          icon={Calendar}
          label="Last 7 Days"
          value={summaryData ? `$${microsToUsd(summaryData.last7DaysAmountMicros)}` : '—'}
          sub={summaryData ? `$${microsToUsd(summaryData.thisWeekAmountMicros)} this week` : ''}
          color="text-warning"
        />
        <StatCard
          icon={Clock}
          label="Today"
          value={summaryData ? `$${microsToUsd(summaryData.todayAmountMicros)}` : '—'}
          sub="UP"
          color="text-white/50"
        />
      </div>

      <div className="glass p-3.5 sm:p-6">
        <h2 className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider mb-3 sm:mb-5">Monthly Reward Momentum</h2>
        <MonthlyCycleChart data={cycleData} />
      </div>

      {/* Operator summary */}
      {operatorSummary.length > 0 && (
        <div className="glass p-3.5 sm:p-6">
          <div className="flex items-center gap-2 mb-3 sm:mb-5">
            <Users size={14} className="text-white/40" />
            <h2 className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider">Rewards by Operator</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {operatorSummary.map((op) => (
              <div key={op.name} className="glass-subtle p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  {op.name === '__unassigned__' ? (
                    <span className="text-xs text-white/30 font-medium">Unassigned</span>
                  ) : (
                    <OperatorBadge name={op.name} size="md" />
                  )}
                  <span className="text-lg font-bold text-success">${microsToUsd(op.totalMicros)}</span>
                </div>
                <p className="text-[10px] text-white/30 mb-3">
                  {op.licenseCount} license{op.licenseCount !== 1 ? 's' : ''}
                  {op.latestDate && ` · Last active ${new Date(op.latestDate).toLocaleDateString()}`}
                </p>
                {/* Monthly cycle breakdown */}
                {op.cycles.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-2 space-y-1">
                    {op.cycles.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-[11px]">
                        <span className="text-white/30">{c.label}</span>
                        <span className="text-accent-light font-medium">${microsToUsd(c.totalMicros)} UP</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
