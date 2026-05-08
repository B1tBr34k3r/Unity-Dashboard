import { useMemo } from 'react';
import StatCard from '../components/dashboard/StatCard';
import RewardsChart from '../components/dashboard/RewardsChart';
import MonthlyCycleChart from '../components/dashboard/MonthlyCycleChart';
import OperatorBadge from '../components/licenses/OperatorBadge';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { aggregateByCycle, getCycleInfo, microsToUsd, truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, getLicenseBackendName, getLicenseDisplayName } from '../utils/licenseDisplay';
import { Wallet, TrendingUp, Calendar, Clock, RefreshCw, Users } from 'lucide-react';
import { DashboardSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';

export default function DashboardPage({ api }) {
  const { balance, licenses, allocations, summary, isLoading, error, refetch } = api;
  const summaryData = summary?.[0] || null;
  const { getLabel } = useLicenseLabels();
  const { getPresetTag, presetTags } = useLicensePresetTags();
  const { getOperator, allOperators } = useOperatorTags();
  const dateRange = useDateRangeFilter(allocations, (item) => item.completedAt, 'page-state:dashboard');
  const filteredAllocations = dateRange.filtered;
  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenses || []).map((license) => [license.id, license])),
    [licenses]
  );
  const cloneIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId])),
    [presetTags, licenseInfoById]
  );

  // Group allocations by licenseId for chart
  const licenseMap = {};
  (filteredAllocations || []).forEach((a) => {
    const key = a.licenseId;
    if (!licenseMap[key]) licenseMap[key] = 0;
    licenseMap[key] += a.amountMicros;
  });
  const cycleData = useMemo(() => {
    return aggregateByCycle(filteredAllocations || []).map((c) => ({
      label: c.label,
      amount: Number((c.totalMicros / 1_000_000).toFixed(2)),
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

  // Chart data: top earning licenses
  const chartData = Object.entries(licenseMap)
    .sort(([, a], [, b]) => b - a)
    .map(([id, micros], i) => ({
      date:
        getLicenseDisplayName({
          customLabel: getLabel(id),
          backendName: getLicenseBackendName(licenseInfoById[id]),
          presetTag: getPresetTag(id),
          cloneIndex: cloneIndexById[id] || null,
        }) || truncateHex(id),
      amount: Number((micros / 1_000_000).toFixed(2)),
    }));

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <h1 className="text-lg sm:text-2xl font-bold text-white">Dashboard</h1>
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
        <h2 className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider mb-3 sm:mb-5">Rewards by License</h2>
        <RewardsChart data={chartData} />
      </div>

      <div className="glass p-3.5 sm:p-6">
        <h2 className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider mb-3 sm:mb-5">Monthly Rewards (5th–4th Cycle)</h2>
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
