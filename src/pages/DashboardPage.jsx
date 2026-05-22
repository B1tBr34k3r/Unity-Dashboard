import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../components/dashboard/StatCard';
import MonthlyRewardsChart from '../components/dashboard/MonthlyRewardsChart';
import OperatorBadge from '../components/licenses/OperatorBadge';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { aggregateByRewardMonth, formatRewardDayLabel, formatRewardMonthLabel, getRewardDayKey, getRewardMonthKey, microsToUsd } from '../utils/formatters';
import { Wallet, TrendingUp, Calendar, Clock, RefreshCw, Users, ArrowUpRight } from 'lucide-react';
import { DashboardSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';
import { buildCloneIndexMap, getLicenseBackendName, getLicenseDisplayName } from '../utils/licenseDisplay';

function formatSignedUsd(micros) {
  if (micros > 0) {
    return `+$${microsToUsd(micros)}`;
  }

  if (micros < 0) {
    return `-$${microsToUsd(Math.abs(micros))}`;
  }

  return '$0.00';
}

function buildDailyInsight(allocations, getDisplayName) {
  const relevantAllocations = Array.isArray(allocations) ? allocations : [];

  if (!relevantAllocations.length) {
    return null;
  }

  const byDay = {};

  relevantAllocations.forEach((allocation) => {
    const dayKey = getRewardDayKey(allocation.completedAt);

    if (!byDay[dayKey]) {
      byDay[dayKey] = {
        dayKey,
        totalMicros: 0,
        allocationCount: 0,
        licenseAmounts: {},
      };
    }

    byDay[dayKey].totalMicros += allocation.amountMicros;
    byDay[dayKey].allocationCount += 1;
    byDay[dayKey].licenseAmounts[allocation.licenseId] = (byDay[dayKey].licenseAmounts[allocation.licenseId] || 0) + allocation.amountMicros;
  });

  const dayKeys = Object.keys(byDay).sort((left, right) => left.localeCompare(right));
  const todayDayKey = getRewardDayKey(new Date());
  const effectiveDayKeys = dayKeys.length > 2 && dayKeys[dayKeys.length - 1] === todayDayKey
    ? dayKeys.slice(0, -1)
    : dayKeys;
  const latestDayKey = effectiveDayKeys[effectiveDayKeys.length - 1];
  const previousDayKey = effectiveDayKeys[effectiveDayKeys.length - 2] || null;
  const latestDay = byDay[latestDayKey];

  if (!previousDayKey) {
    return {
      latestLabel: formatRewardDayLabel(latestDayKey, true),
      previousLabel: null,
      deltaMicros: 0,
      totalMicros: latestDay.totalMicros,
      allocationCount: latestDay.allocationCount,
      rewardedLicenseCount: Object.keys(latestDay.licenseAmounts).length,
      topDriver: null,
    };
  }

  const previousDay = byDay[previousDayKey];
  const licenseIds = new Set([...Object.keys(latestDay.licenseAmounts), ...Object.keys(previousDay.licenseAmounts)]);
  const licenseDiffs = Array.from(licenseIds)
    .map((licenseId) => ({
      licenseId,
      name: getDisplayName(licenseId),
      diffMicros: (latestDay.licenseAmounts[licenseId] || 0) - (previousDay.licenseAmounts[licenseId] || 0),
    }))
    .filter((entry) => entry.diffMicros !== 0)
    .sort((left, right) => Math.abs(right.diffMicros) - Math.abs(left.diffMicros));

  return {
    latestLabel: formatRewardDayLabel(latestDayKey, true),
    previousLabel: formatRewardDayLabel(previousDayKey, true),
    deltaMicros: latestDay.totalMicros - previousDay.totalMicros,
    totalMicros: latestDay.totalMicros,
    allocationCount: latestDay.allocationCount,
    rewardedLicenseCount: Object.keys(latestDay.licenseAmounts).length,
    topDriver: licenseDiffs[0] || null,
  };
}

export default function DashboardPage({ api }) {
  const { user, balance, allocations, licenses, summary, historyInfo, isLoading, error, manualRefresh } = api;
  const summaryData = summary?.[0] || null;
  const { getOperator, allOperators } = useOperatorTags(user?.id);
  const { getLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, presetTags, cloneTagOrder, workTagOrder } = useLicensePresetTags(user?.id);
  const dateRange = useDateRangeFilter(allocations, (item) => item.completedAt, 'page-state:dashboard');
  const filteredAllocations = dateRange.filtered;
  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenses || []).map((license) => [license.id, license])),
    [licenses]
  );
  const tagIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId]), {
      clone: cloneTagOrder,
      work: workTagOrder,
    }),
    [presetTags, licenseInfoById, cloneTagOrder, workTagOrder]
  );

  const getDisplayName = (licenseId) => getLicenseDisplayName({
    customLabel: getLabel(licenseId),
    backendName: getLicenseBackendName(licenseInfoById[licenseId]),
    presetTag: getPresetTag(licenseId),
    tagIndex: tagIndexById[licenseId] || null,
  }) || `License ${licenseId}`;

  const dailyInsight = useMemo(
    () => buildDailyInsight(allocations, getDisplayName),
    [allocations, getLabel, getPresetTag, tagIndexById, licenseInfoById]
  );

  const monthData = useMemo(() => {
    return aggregateByRewardMonth(filteredAllocations || []).map((entry) => ({
      key: entry.key,
      label: entry.label,
      amount: Number((entry.totalMicros / 1_000_000).toFixed(2)),
      count: entry.count,
    }));
  }, [filteredAllocations]);

  // Operator summary: group allocations by operator with actual calendar-month breakdown
  const operatorSummary = useMemo(() => {
    if (!allOperators.length || !filteredAllocations?.length) return [];

    const byOperator = {};
    const licenseIds = new Set(filteredAllocations.map((a) => a.licenseId));

    licenseIds.forEach((lid) => {
      const op = getOperator(lid) || '__unassigned__';
      if (!byOperator[op]) byOperator[op] = { name: op, totalMicros: 0, licenseCount: 0, latestDate: null, months: {} };
      byOperator[op].licenseCount++;
    });

    filteredAllocations.forEach((a) => {
      const op = getOperator(a.licenseId) || '__unassigned__';
      if (!byOperator[op]) byOperator[op] = { name: op, totalMicros: 0, licenseCount: 0, latestDate: null, months: {} };
      byOperator[op].totalMicros += a.amountMicros;
      if (!byOperator[op].latestDate || new Date(a.completedAt) > new Date(byOperator[op].latestDate)) {
        byOperator[op].latestDate = a.completedAt;
      }
      const monthKey = getRewardMonthKey(a.completedAt);
      if (!byOperator[op].months[monthKey]) {
        byOperator[op].months[monthKey] = { key: monthKey, label: formatRewardMonthLabel(monthKey), totalMicros: 0 };
      }
      byOperator[op].months[monthKey].totalMicros += a.amountMicros;
    });

    return Object.values(byOperator)
      .map((op) => ({
        ...op,
        months: Object.values(op.months).sort((a, b) => a.key.localeCompare(b.key)),
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

      {dailyInsight ? (
        <Link to="/daily-changes" className="block group">
          <section className="glass p-4 sm:p-6 transition-colors duration-200 hover:bg-white/[0.05]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider">Why Rewards Changed</p>
                <h2 className="text-base sm:text-lg font-semibold text-white mt-2">Daily Changes Teaser</h2>
                <p className="text-sm text-white/45 mt-2 max-w-2xl">
                  {dailyInsight.previousLabel
                    ? `${dailyInsight.latestLabel} moved ${formatSignedUsd(dailyInsight.deltaMicros)} vs ${dailyInsight.previousLabel}. ${dailyInsight.topDriver ? `Largest single mover: ${dailyInsight.topDriver.name} ${formatSignedUsd(dailyInsight.topDriver.diffMicros)}.` : ''}`
                    : `Stored rewards are live for ${dailyInsight.latestLabel}. Open Daily Changes once a second reward day exists to see the exact day-over-day explanation.`}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/60 group-hover:text-white">
                Open Daily Changes
                <ArrowUpRight size={13} />
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Day</p>
                <p className="text-sm font-semibold text-white mt-1">{dailyInsight.latestLabel}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyInsight.rewardedLicenseCount} rewarded licenses</p>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Total</p>
                <p className="text-sm font-semibold text-white mt-1">${microsToUsd(dailyInsight.totalMicros)}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyInsight.allocationCount} allocations</p>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Net Delta</p>
                <p className={`text-sm font-semibold mt-1 ${dailyInsight.deltaMicros >= 0 ? 'text-success' : 'text-warning'}`}>{formatSignedUsd(dailyInsight.deltaMicros)}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyInsight.previousLabel ? `vs ${dailyInsight.previousLabel}` : 'Need prior day'}</p>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Largest Mover</p>
                <p className="text-sm font-semibold text-white mt-1 truncate">{dailyInsight.topDriver?.name || 'No standout yet'}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyInsight.topDriver ? formatSignedUsd(dailyInsight.topDriver.diffMicros) : 'Open for the full breakdown'}</p>
              </div>
            </div>
          </section>
        </Link>
      ) : null}

      <div className="glass p-3.5 sm:p-6">
        <h2 className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider mb-3 sm:mb-5">Monthly Reward Momentum</h2>
        <MonthlyRewardsChart data={monthData} />
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
                  {op.latestDate && ` · Last active ${formatRewardDayLabel(op.latestDate, true)}`}
                </p>
                {op.months.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-2 space-y-1">
                    {op.months.map((month) => (
                      <div key={month.key} className="flex items-center justify-between text-[11px]">
                        <span className="text-white/30">{month.label}</span>
                        <span className="text-accent-light font-medium">${microsToUsd(month.totalMicros)} UP</span>
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
