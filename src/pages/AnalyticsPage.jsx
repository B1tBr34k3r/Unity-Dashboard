import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Brush,
  BarChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { RefreshCw, Wallet, TrendingUp, Clock, Users } from 'lucide-react';
import TrendCandleBar from '../components/common/TrendCandleBar';
import StatCard from '../components/dashboard/StatCard';
import { DashboardSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';
import { useDeviceCombinations } from '../hooks/useDeviceCombinations';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { addDaysToRewardDayKey, formatRewardDayLabel, formatRewardMonthLabel, getRewardDayKey, getRewardMonthKey, microsToUsd, truncateHex } from '../utils/formatters';
import {
  buildCloneIndexMap,
  getLicenseBackendName,
  getLicenseDisplayName,
  getLicenseDistribution,
} from '../utils/licenseDisplay';

const CHART_COLORS = ['#6366f1', '#818cf8', '#06b6d4', '#22d3ee', '#f59e0b', '#22c55e', '#a78bfa', '#fb7185'];
const STATUS_COLORS = {
  Online: '#22c55e',
  Offline: '#f59e0b',
  'Below Min': '#ef4444',
  Unbound: '#64748b',
};
const DATE_RANGE_LABELS = {
  all: 'All Stored History',
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  custom: 'Custom Range',
};
const COMBINED_EARNINGS_DEFAULT_WINDOW = 45;
const COMBINED_EARNINGS_MIN_WIDTH = 840;
const COMBINED_EARNINGS_BAR_WIDTH = 22;
const TOOLTIP_BREAKDOWN_LIMIT = 6;

function tooltipContainer(children, label) {
  return (
    <div
      style={{
        background: 'rgba(12,12,30,0.95)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
      }}
    >
      {label ? <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{label}</p> : null}
      {children}
    </div>
  );
}

function RewardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  return tooltipContainer(
    <>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#818cf8', fontFamily: 'monospace' }}>
        ${Number(payload[0].value).toFixed(2)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>UP</span>
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontFamily: 'monospace' }}>
        {point.count} allocation{point.count !== 1 ? 's' : ''}
      </p>
    </>,
    label
  );
}

function DailyEarningsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const deltaPrefix = point.deltaAmount > 0 ? '+' : '';
  const hasCombinedBreakdown = point.count > 1 && point.licenseBreakdown?.length;

  return tooltipContainer(
    <>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
        ${point.amount.toFixed(2)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>UP</span>
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontFamily: 'monospace' }}>
        {hasCombinedBreakdown
          ? `${point.count} allocations across ${point.licenseBreakdown.length} license${point.licenseBreakdown.length === 1 ? '' : 's'}`
          : `${point.count} allocation${point.count !== 1 ? 's' : ''}`}
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
        7d avg ${point.rollingAverage.toFixed(2)} UP
      </p>
      <p style={{ fontSize: 10, color: point.deltaAmount >= 0 ? '#22c55e' : '#f59e0b', marginTop: 2 }}>
        {point.deltaIndex === 0 ? 'First visible day' : `${deltaPrefix}${point.deltaAmount.toFixed(2)} UP vs previous day`}
      </p>
      {hasCombinedBreakdown ? (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Breakdown
          </p>
          {point.licenseBreakdown.slice(0, TOOLTIP_BREAKDOWN_LIMIT).map((entry) => (
            <div
              key={entry.licenseId}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, margin: 0 }}>{entry.label}</p>
                <p style={{ color: 'rgba(255,255,255,0.34)', fontSize: 10, marginTop: 1 }}>{entry.count} allocation{entry.count === 1 ? '' : 's'}</p>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>
                ${entry.amount.toFixed(2)}
              </span>
            </div>
          ))}
          {point.licenseBreakdown.length > TOOLTIP_BREAKDOWN_LIMIT ? (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 6 }}>
              +{point.licenseBreakdown.length - TOOLTIP_BREAKDOWN_LIMIT} more contributor{point.licenseBreakdown.length - TOOLTIP_BREAKDOWN_LIMIT === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : null}
    </>,
    label
  );
}

function PieBreakdownTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  return tooltipContainer(
    <>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>{point.name}</p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{point.value} licenses</p>
      {point.share !== undefined ? (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{point.share}% of visible fleet</p>
      ) : null}
    </>,
    null
  );
}

function RadarBreakdownTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return tooltipContainer(
    <>
      {payload.map((entry) => (
        <p key={entry.name} style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
          {entry.name === 'Rewards' ? `${entry.name}: $${Number(entry.value).toFixed(2)} UP` : `${entry.name}: ${entry.value}`}
        </p>
      ))}
    </>,
    label
  );
}

function DeviceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  return tooltipContainer(
    <>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#06b6d4', fontFamily: 'monospace' }}>
        ${Number(payload[0].value).toFixed(2)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>UP</span>
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{point.licenseCount} license{point.licenseCount !== 1 ? 's' : ''}</p>
    </>,
    label
  );
}

function CutTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  return tooltipContainer(
    <>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>{point.count} licenses</p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>${point.amount.toFixed(2)} UP in range</p>
    </>,
    label
  );
}

function ScatterTooltipContent({ active, payload }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  return tooltipContainer(
    <>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>{point.name}</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 5 }}>Uptime {point.x.toFixed(2)}%</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Rewards ${point.y.toFixed(2)} UP</p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
        {point.entries} reward entr{point.entries === 1 ? 'y' : 'ies'} · {point.status}
      </p>
    </>,
    null
  );
}

function ChartCard({ eyebrow, title, description, children, footer, className = '' }) {
  return (
    <section className={`glass p-4 sm:p-6 ${className}`}>
      <div className="mb-4 sm:mb-5">
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">{eyebrow}</p>
        <div className="flex flex-col gap-1 mt-2">
          <h2 className="text-base sm:text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="text-xs text-white/40 max-w-2xl">{description}</p> : null}
        </div>
      </div>
      {children}
      {footer ? <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-white/35">{footer}</div> : null}
    </section>
  );
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
}

function formatCutValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';

  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatUsdValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';

  return `$${value.toFixed(2)}`;
}

function formatShareValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';

  return `${value.toFixed(1)}%`;
}

function formatRangeDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusBucket(license) {
  const hasBoundDevice = Boolean(license.deviceId || license.deviceName);
  const uptimePercentage = typeof license.uptime === 'number' ? Number((license.uptime * 100).toFixed(2)) : null;
  const minUptime = typeof license.leaseMinUptimePercentage === 'number' ? license.leaseMinUptimePercentage : null;

  if (!hasBoundDevice) {
    return { bucket: 'Unbound', uptimePercentage, minUptime, hasBoundDevice };
  }

  if (uptimePercentage !== null && minUptime !== null && uptimePercentage < minUptime) {
    return { bucket: 'Below Min', uptimePercentage, minUptime, hasBoundDevice };
  }

  return { bucket: license.isOnline ? 'Online' : 'Offline', uptimePercentage, minUptime, hasBoundDevice };
}

export default function AnalyticsPage({ api }) {
  const { user, balance, licenses: licenseMetadata, allocations, historyInfo, isLoading, error, manualRefresh } = api;
  const { deviceAliasLookup } = useDeviceCombinations(user?.id);
  const { getLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, presetTags, cloneTagOrder, workTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator } = useOperatorTags(user?.id);
  const dateRange = useDateRangeFilter(allocations || [], (item) => item.completedAt, 'page-state:analytics');
  const filteredAllocations = dateRange.filtered || [];
  const [selectedTrendMonthKey, setSelectedTrendMonthKey] = useState('all');
  const [dailyTrendBrushRange, setDailyTrendBrushRange] = useState({ startIndex: 0, endIndex: 0 });

  const activeDateRangeLabel = useMemo(() => {
    if (dateRange.preset === 'custom') {
      if (dateRange.customFrom && dateRange.customTo) {
        return `${formatRangeDate(dateRange.customFrom)} -> ${formatRangeDate(dateRange.customTo)}`;
      }

      if (dateRange.customFrom) {
        return `${formatRangeDate(dateRange.customFrom)} onward`;
      }

      if (dateRange.customTo) {
        return `Until ${formatRangeDate(dateRange.customTo)}`;
      }
    }

    return DATE_RANGE_LABELS[dateRange.preset] || DATE_RANGE_LABELS.all;
  }, [dateRange.preset, dateRange.customFrom, dateRange.customTo]);

  const storedHistoryLabel = useMemo(() => {
    if (!historyInfo?.oldestCompletedAt || !historyInfo?.newestCompletedAt) {
      return null;
    }

    return `${formatRangeDate(historyInfo.oldestCompletedAt)} -> ${formatRangeDate(historyInfo.newestCompletedAt)}`;
  }, [historyInfo]);

  const historyStatusLabel = useMemo(() => {
    switch (historyInfo?.backfillStatus) {
      case 'complete':
        return 'History Synced';
      case 'backfilling':
        return 'Backfilling Older Rewards';
      case 'partial':
        return 'Partial History';
      case 'unsupported':
        return 'Recent History Only';
      default:
        return 'History Pending';
    }
  }, [historyInfo]);

  const historyCoverageMessage = useMemo(() => {
    if (!storedHistoryLabel) {
      return null;
    }

    if (dateRange.preset !== 'all') {
      return `Current view is ${activeDateRangeLabel}. Stored history already covers ${storedHistoryLabel}.`;
    }

    if (historyInfo?.backfillStatus && historyInfo.backfillStatus !== 'complete') {
      return `Stored history currently starts ${formatRangeDate(historyInfo.oldestCompletedAt)}. Older rewards before that will not show until they are returned by the API or already cached in this browser.`;
    }

    return `Showing all stored history from ${storedHistoryLabel}.`;
  }, [activeDateRangeLabel, dateRange.preset, historyInfo, storedHistoryLabel]);

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenseMetadata || []).map((license) => [license.id, license])),
    [licenseMetadata]
  );

  const tagIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId], deviceAliasLookup), {
      clone: cloneTagOrder,
      work: workTagOrder,
    }),
    [presetTags, licenseInfoById, cloneTagOrder, workTagOrder, deviceAliasLookup]
  );

  const allocationStatsById = useMemo(() => {
    return filteredAllocations.reduce((map, allocation) => {
      const current = map[allocation.licenseId] || {
        totalMicros: 0,
        entries: 0,
        latestRewardAt: null,
      };

      current.totalMicros += allocation.amountMicros;
      current.entries += 1;
      if (!current.latestRewardAt || new Date(allocation.completedAt) > new Date(current.latestRewardAt)) {
        current.latestRewardAt = allocation.completedAt;
      }

      map[allocation.licenseId] = current;
      return map;
    }, {});
  }, [filteredAllocations]);

  const licenseAnalytics = useMemo(() => {
    const seen = new Set();
    const merged = (licenseMetadata || []).map((license) => {
      seen.add(license.id);
      const stats = allocationStatsById[license.id] || { totalMicros: 0, entries: 0, latestRewardAt: null };
      const backendName = getLicenseBackendName(license, deviceAliasLookup);
      const presetTag = getPresetTag(license.id);
      const tagIndex = tagIndexById[license.id] || null;
      const { bucket, uptimePercentage, minUptime, hasBoundDevice } = getStatusBucket(license);
      const normalizedSharePercentage =
        typeof license.leaseSharePercentage === 'number'
          ? Number(license.leaseSharePercentage.toFixed(2))
          : null;
      const distribution = getLicenseDistribution(normalizedSharePercentage);

      return {
        licenseId: license.id,
        displayName:
          getLicenseDisplayName({
            customLabel: getLabel(license.id),
            backendName,
            presetTag,
            tagIndex,
          }) || truncateHex(license.id),
        backendName,
        presetTag: presetTag || 'Untagged',
        operator: getOperator(license.id) || 'Unassigned',
        totalMicros: stats.totalMicros,
        entries: stats.entries,
        latestRewardAt: stats.latestRewardAt,
        uptimePercentage,
        minUptime,
        hasBoundDevice,
        statusBucket: bucket,
        uloCutPercentage: distribution.ulo,
      };
    });

    Object.entries(allocationStatsById).forEach(([licenseId, stats]) => {
      if (seen.has(licenseId)) {
        return;
      }

      merged.push({
        licenseId,
        displayName: truncateHex(licenseId),
        backendName: '',
        presetTag: 'Untagged',
        operator: 'Unassigned',
        totalMicros: stats.totalMicros,
        entries: stats.entries,
        latestRewardAt: stats.latestRewardAt,
        uptimePercentage: null,
        minUptime: null,
        hasBoundDevice: false,
        statusBucket: 'Unbound',
        uloCutPercentage: null,
      });
    });

    return merged;
  }, [licenseMetadata, allocationStatsById, getLabel, getOperator, getPresetTag, tagIndexById, deviceAliasLookup]);

  const filteredRewardTotalMicros = useMemo(
    () => filteredAllocations.reduce((sum, allocation) => sum + allocation.amountMicros, 0),
    [filteredAllocations]
  );

  const rewardedLicenses = useMemo(
    () => licenseAnalytics.filter((license) => license.totalMicros > 0).length,
    [licenseAnalytics]
  );

  const boundLicenses = useMemo(
    () => licenseAnalytics.filter((license) => license.hasBoundDevice).length,
    [licenseAnalytics]
  );

  const onlineLicenses = useMemo(
    () => licenseAnalytics.filter((license) => license.statusBucket === 'Online').length,
    [licenseAnalytics]
  );

  const avgUptime = useMemo(() => {
    const uptimeValues = licenseAnalytics
      .map((license) => license.uptimePercentage)
      .filter((value) => typeof value === 'number');

    if (!uptimeValues.length) return null;

    return uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length;
  }, [licenseAnalytics]);

  const licenseNameById = useMemo(
    () => Object.fromEntries(licenseAnalytics.map((license) => [license.licenseId, license.displayName])),
    [licenseAnalytics]
  );

  const dailyTrendData = useMemo(() => {
    const byDay = filteredAllocations.reduce((map, allocation) => {
      const dayKey = getRewardDayKey(allocation.completedAt);
      if (!map[dayKey]) {
        map[dayKey] = { dayKey, label: formatRewardDayLabel(dayKey), amount: 0, count: 0, breakdownByLicense: {} };
      }

      map[dayKey].amount += allocation.amountMicros / 1_000_000;
      map[dayKey].count += 1;
      const licenseId = allocation.licenseId;
      const currentLicenseBreakdown = map[dayKey].breakdownByLicense[licenseId] || {
        licenseId,
        label: licenseNameById[licenseId] || truncateHex(licenseId),
        amount: 0,
        count: 0,
      };

      currentLicenseBreakdown.amount += allocation.amountMicros / 1_000_000;
      currentLicenseBreakdown.count += 1;
      map[dayKey].breakdownByLicense[licenseId] = currentLicenseBreakdown;
      return map;
    }, {});

    const dayKeys = Object.keys(byDay).sort();
    if (!dayKeys.length) return [];

    const filledDays = [];
    const rollingWindow = [];
    let currentDayKey = dayKeys[0];
    const lastDayKey = dayKeys[dayKeys.length - 1];
    let previousAmount = 0;
    let deltaIndex = 0;

    while (currentDayKey <= lastDayKey) {
      const existingDay = byDay[currentDayKey] || {
        dayKey: currentDayKey,
        label: formatRewardDayLabel(currentDayKey),
        amount: 0,
        count: 0,
        breakdownByLicense: {},
      };
      const roundedAmount = Number(existingDay.amount.toFixed(2));
      const licenseBreakdown = Object.values(existingDay.breakdownByLicense)
        .map((entry) => ({
          ...entry,
          amount: Number(entry.amount.toFixed(2)),
        }))
        .sort((left, right) => right.amount - left.amount);

      rollingWindow.push(roundedAmount);
      if (rollingWindow.length > 7) {
        rollingWindow.shift();
      }

      const rollingAverage = rollingWindow.reduce((sum, value) => sum + value, 0) / rollingWindow.length;

      filledDays.push({
        dayKey: existingDay.dayKey,
        label: existingDay.label,
        amount: roundedAmount,
        count: existingDay.count,
        licenseBreakdown,
        rollingAverage: Number(rollingAverage.toFixed(2)),
        deltaAmount: Number((roundedAmount - previousAmount).toFixed(2)),
        deltaIndex,
      });

      previousAmount = roundedAmount;
      deltaIndex += 1;
      currentDayKey = addDaysToRewardDayKey(currentDayKey, 1);
    }

    const peakAmount = Math.max(...filledDays.map((entry) => entry.amount));

    return filledDays.map((entry, index) => ({
      ...entry,
      monthKey: getRewardMonthKey(entry.dayKey),
      isPeak: peakAmount > 0 && entry.amount === peakAmount,
      isLatest: index === filledDays.length - 1,
    }));
  }, [filteredAllocations, licenseNameById]);

  const visibleDailyTrendData = useMemo(() => {
    if (!dailyTrendData.length) {
      return [];
    }

    const safeStart = Math.max(0, Math.min(dailyTrendBrushRange.startIndex, dailyTrendData.length - 1));
    const safeEnd = Math.max(safeStart, Math.min(dailyTrendBrushRange.endIndex, dailyTrendData.length - 1));

    return dailyTrendData.slice(safeStart, safeEnd + 1);
  }, [dailyTrendData, dailyTrendBrushRange]);

  const visibleDailyTrendRangeLabel = useMemo(() => {
    if (!visibleDailyTrendData.length) {
      return null;
    }

    return `${visibleDailyTrendData[0].label} - ${visibleDailyTrendData[visibleDailyTrendData.length - 1].label}`;
  }, [visibleDailyTrendData]);

  const dailyEarningsInsights = useMemo(() => {
    if (!visibleDailyTrendData.length) return null;

    const bestDay = visibleDailyTrendData.reduce((bestEntry, entry) => (entry.amount > bestEntry.amount ? entry : bestEntry), visibleDailyTrendData[0]);
    const latestDay = visibleDailyTrendData[visibleDailyTrendData.length - 1];
    const averagePerDay = visibleDailyTrendData.reduce((sum, entry) => sum + entry.amount, 0) / visibleDailyTrendData.length;

    return {
      bestDay,
      latestDay,
      averagePerDay: Number(averagePerDay.toFixed(2)),
    };
  }, [visibleDailyTrendData]);

  const dailyTrendBrushStartIndex = useMemo(() => {
    if (!dailyTrendData.length) {
      return 0;
    }

    return Math.max(0, dailyTrendData.length - COMBINED_EARNINGS_DEFAULT_WINDOW);
  }, [dailyTrendData]);

  const dailyTrendMonthWindows = useMemo(() => {
    const monthsByKey = new Map();

    dailyTrendData.forEach((entry, index) => {
      const current = monthsByKey.get(entry.monthKey) || {
        key: entry.monthKey,
        label: formatRewardMonthLabel(entry.monthKey),
        startIndex: index,
        endIndex: index,
        amount: 0,
        activeDays: 0,
      };

      current.endIndex = index;
      current.amount += entry.amount;
      if (entry.amount > 0) {
        current.activeDays += 1;
      }

      monthsByKey.set(entry.monthKey, current);
    });

    return Array.from(monthsByKey.values()).map((month) => ({
      ...month,
      amount: Number(month.amount.toFixed(2)),
    }));
  }, [dailyTrendData]);

  const selectedTrendMonth = useMemo(
    () => dailyTrendMonthWindows.find((month) => month.key === selectedTrendMonthKey) || null,
    [dailyTrendMonthWindows, selectedTrendMonthKey]
  );

  const dailyTrendChartMinWidth = useMemo(
    () => Math.max(COMBINED_EARNINGS_MIN_WIDTH, visibleDailyTrendData.length * COMBINED_EARNINGS_BAR_WIDTH),
    [visibleDailyTrendData]
  );

  useEffect(() => {
    if (selectedTrendMonthKey === 'all') {
      return;
    }

    if (!selectedTrendMonth) {
      setSelectedTrendMonthKey('all');
    }
  }, [selectedTrendMonth, selectedTrendMonthKey]);

  useEffect(() => {
    if (!dailyTrendData.length) {
      setDailyTrendBrushRange({ startIndex: 0, endIndex: 0 });
      return;
    }

    if (selectedTrendMonth) {
      setDailyTrendBrushRange({
        startIndex: selectedTrendMonth.startIndex,
        endIndex: selectedTrendMonth.endIndex,
      });
      return;
    }

    setDailyTrendBrushRange({
      startIndex: dailyTrendBrushStartIndex,
      endIndex: dailyTrendData.length - 1,
    });
  }, [dailyTrendBrushStartIndex, dailyTrendData.length, selectedTrendMonth]);

  const statusMixData = useMemo(() => {
    const total = licenseAnalytics.length || 1;
    const byStatus = ['Online', 'Offline', 'Below Min', 'Unbound'].map((name) => ({
      name,
      value: licenseAnalytics.filter((license) => license.statusBucket === name).length,
      color: STATUS_COLORS[name],
    }));

    return byStatus
      .filter((item) => item.value > 0)
      .map((item) => ({ ...item, share: Number(((item.value / total) * 100).toFixed(1)) }));
  }, [licenseAnalytics]);

  const dominantStatus = useMemo(
    () => [...statusMixData].sort((a, b) => b.value - a.value)[0]?.name || null,
    [statusMixData]
  );

  const tagCoverageData = useMemo(() => {
    const tags = ['Clone', 'Work', 'Secure Folder', 'Main', 'Untagged'];

    return tags.map((tag) => {
      const matching = licenseAnalytics.filter((license) => license.presetTag === tag);
      return {
        subject: tag === 'Secure Folder' ? 'Secure' : tag,
        licenses: matching.length,
        rewards: Number((matching.reduce((sum, license) => sum + license.totalMicros, 0) / 1_000_000).toFixed(2)),
      };
    });
  }, [licenseAnalytics]);

  const rewardCadence = useMemo(() => {
    if (!dailyTrendData.length) {
      return null;
    }

    const totalDays = dailyTrendData.length;
    const activeDays = dailyTrendData.filter((entry) => entry.amount > 0);
    const quietDays = totalDays - activeDays.length;
    const activeRate = totalDays ? (activeDays.length / totalDays) * 100 : 0;
    const averageActiveDay = activeDays.length
      ? activeDays.reduce((sum, entry) => sum + entry.amount, 0) / activeDays.length
      : 0;

    let longestActiveStreak = 0;
    let longestQuietStreak = 0;
    let currentActiveStreak = 0;
    let currentQuietStreak = 0;

    dailyTrendData.forEach((entry) => {
      if (entry.amount > 0) {
        currentActiveStreak += 1;
        currentQuietStreak = 0;
      } else {
        currentQuietStreak += 1;
        currentActiveStreak = 0;
      }

      longestActiveStreak = Math.max(longestActiveStreak, currentActiveStreak);
      longestQuietStreak = Math.max(longestQuietStreak, currentQuietStreak);
    });

    let bestWeekTotal = 0;
    let bestWeekStartLabel = dailyTrendData[0].label;
    let bestWeekEndLabel = dailyTrendData[0].label;

    dailyTrendData.forEach((_, index) => {
      const windowEntries = dailyTrendData.slice(Math.max(0, index - 6), index + 1);
      const windowTotal = windowEntries.reduce((sum, entry) => sum + entry.amount, 0);

      if (windowTotal > bestWeekTotal) {
        bestWeekTotal = windowTotal;
        bestWeekStartLabel = windowEntries[0].label;
        bestWeekEndLabel = windowEntries[windowEntries.length - 1].label;
      }
    });

    const latestWeekEntries = dailyTrendData.slice(-7);
    const latestWeekTotal = latestWeekEntries.reduce((sum, entry) => sum + entry.amount, 0);

    return {
      totalDays,
      activeDays: activeDays.length,
      quietDays,
      activeRate: Number(activeRate.toFixed(1)),
      quietRate: Number((100 - activeRate).toFixed(1)),
      averageActiveDay: Number(averageActiveDay.toFixed(2)),
      bestWeekTotal: Number(bestWeekTotal.toFixed(2)),
      latestWeekTotal: Number(latestWeekTotal.toFixed(2)),
      bestWeekLabel: `${bestWeekStartLabel} - ${bestWeekEndLabel}`,
      longestActiveStreak,
      longestQuietStreak,
    };
  }, [dailyTrendData]);

  const topDeviceRewards = useMemo(() => {
    const grouped = licenseAnalytics.reduce((map, license) => {
      const key = license.backendName || license.displayName;
      if (!map[key]) {
        map[key] = { name: key, amount: 0, licenseCount: 0 };
      }

      map[key].amount += license.totalMicros / 1_000_000;
      map[key].licenseCount += 1;
      return map;
    }, {});

    return Object.values(grouped)
      .map((entry) => ({ ...entry, amount: Number(entry.amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [licenseAnalytics]);

  const uptimeScatterData = useMemo(() => {
    return licenseAnalytics
      .filter((license) => typeof license.uptimePercentage === 'number' && license.totalMicros > 0)
      .map((license) => ({
        name: license.displayName,
        x: license.uptimePercentage,
        y: Number((license.totalMicros / 1_000_000).toFixed(2)),
        z: Math.max(1, license.entries),
        entries: license.entries,
        status: license.statusBucket,
      }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 40);
  }, [licenseAnalytics]);

  const uloDistributionData = useMemo(() => {
    const grouped = licenseAnalytics.reduce((map, license) => {
      if (license.uloCutPercentage === null) {
        return map;
      }

      const key = license.uloCutPercentage.toFixed(2);
      if (!map[key]) {
        map[key] = { cut: `${formatCutValue(license.uloCutPercentage)}% ULO`, cutValue: license.uloCutPercentage, count: 0, amount: 0 };
      }

      map[key].count += 1;
      map[key].amount += license.totalMicros / 1_000_000;
      return map;
    }, {});

    return Object.values(grouped)
      .map((entry) => ({ ...entry, amount: Number(entry.amount.toFixed(2)) }))
      .sort((a, b) => b.cutValue - a.cutValue);
  }, [licenseAnalytics]);

  const dominantUloBand = useMemo(
    () => [...uloDistributionData].sort((a, b) => b.count - a.count)[0]?.cut || null,
    [uloDistributionData]
  );

  const handleSelectTrendMonth = (monthKey) => {
    if (!dailyTrendData.length || monthKey === 'all') {
      setSelectedTrendMonthKey('all');
      setDailyTrendBrushRange({
        startIndex: dailyTrendBrushStartIndex,
        endIndex: Math.max(0, dailyTrendData.length - 1),
      });
      return;
    }

    const targetMonth = dailyTrendMonthWindows.find((month) => month.key === monthKey);

    if (!targetMonth) {
      return;
    }

    setSelectedTrendMonthKey(targetMonth.key);
    setDailyTrendBrushRange({
      startIndex: targetMonth.startIndex,
      endIndex: targetMonth.endIndex,
    });
  };

  const handleDailyTrendBrushChange = ({ startIndex, endIndex }) => {
    if (!dailyTrendData.length) {
      return;
    }

    const nextStartIndex = typeof startIndex === 'number' ? startIndex : 0;
    const nextEndIndex = typeof endIndex === 'number' ? endIndex : dailyTrendData.length - 1;

    if (selectedTrendMonth && (nextStartIndex !== selectedTrendMonth.startIndex || nextEndIndex !== selectedTrendMonth.endIndex)) {
      setSelectedTrendMonthKey('all');
    }

    setDailyTrendBrushRange({
      startIndex: nextStartIndex,
      endIndex: nextEndIndex,
    });
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Analytics Tab</p>
          <h1 className="text-xl sm:text-3xl font-bold text-white mt-2">Signals and breakdowns</h1>
          <p className="text-sm text-white/40 mt-1 max-w-2xl">
            A separate analytics surface for range-based reward flow, device health, tag distribution, ULO spread, and reward density.
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
        <StatCard
          icon={Wallet}
          label="Available Balance"
          value={balance !== null ? `$${microsToUsd(balance)}` : '—'}
          sub="Current wallet balance"
          color="text-success"
        />
        <StatCard
          icon={TrendingUp}
          label="Range Rewards"
          value={`$${microsToUsd(filteredRewardTotalMicros)}`}
          sub={`${filteredAllocations.length} allocation${filteredAllocations.length === 1 ? '' : 's'} in range`}
          color="text-accent-light"
        />
        <StatCard
          icon={Users}
          label="Rewarded Licenses"
          value={String(rewardedLicenses)}
          sub={`${onlineLicenses} online / ${boundLicenses} bound`}
          color="text-warning"
        />
        <StatCard
          icon={Clock}
          label="Average Uptime"
          value={avgUptime !== null ? formatPercent(avgUptime) : '—'}
          sub="Across all licenses with telemetry"
          color="text-white/70"
        />
      </div>

      <ChartCard
        eyebrow="Reward Flow"
        title="Combined daily earnings"
        description="Shows total daily UP across all visible licenses, plus a 7-day earning trend and daily baseline."
        footer={visibleDailyTrendData.length ? `${visibleDailyTrendData.length} day buckets currently in focus${dailyEarningsInsights ? ` · Best day ${dailyEarningsInsights.bestDay.label}` : ''}.` : 'No reward activity in this date range.'}
      >
          {dailyTrendData.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  View {activeDateRangeLabel}
                </span>
                {storedHistoryLabel ? (
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                    Stored {storedHistoryLabel}
                  </span>
                ) : null}
                {historyInfo ? (
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                    {historyStatusLabel}
                  </span>
                ) : null}
                {dateRange.preset !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => dateRange.setPreset('all')}
                    className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100 hover:bg-cyan-400/15"
                  >
                    Show All Stored History
                  </button>
                ) : null}
              </div>

              {historyCoverageMessage ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 mb-4 text-[11px] text-white/45">
                  {historyCoverageMessage}
                </div>
              ) : null}

              {dailyTrendMonthWindows.length ? (
                <div className="mb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Month Focus</p>
                      <p className="text-[11px] text-white/35 mt-1">Jump straight to a month, then refine the view with the navigator below.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTrendMonth('all')}
                      className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs transition-colors ${selectedTrendMonthKey === 'all'
                        ? 'border-accent-light/40 bg-accent-light/15 text-accent-light'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75'}`}
                    >
                      All visible months
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {dailyTrendMonthWindows.map((month) => (
                      <button
                        key={month.key}
                        type="button"
                        onClick={() => handleSelectTrendMonth(month.key)}
                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${selectedTrendMonthKey === month.key
                          ? 'border-cyan-300/35 bg-cyan-400/12'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.05]'}`}
                      >
                        <p className="text-[11px] text-white/40">{month.label}</p>
                        <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(month.amount)}</p>
                        <p className="text-[10px] text-white/28 mt-1">{month.activeDays} active day{month.activeDays === 1 ? '' : 's'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {dailyEarningsInsights && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mb-6">
                  <div className="glass-subtle rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Best Day</p>
                    <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(dailyEarningsInsights.bestDay.amount)}</p>
                    <p className="text-[10px] text-white/35 mt-1">{dailyEarningsInsights.bestDay.label}</p>
                  </div>
                  <div className="glass-subtle rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Average / Day</p>
                    <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(dailyEarningsInsights.averagePerDay)}</p>
                    <p className="text-[10px] text-white/35 mt-1">Across visible days</p>
                  </div>
                  <div className="glass-subtle rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Day</p>
                    <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(dailyEarningsInsights.latestDay.amount)}</p>
                    <p className="text-[10px] text-white/35 mt-1">{dailyEarningsInsights.latestDay.label}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Visible Window</p>
                  <p className="text-[11px] text-white/35 mt-1">
                    {selectedTrendMonth
                      ? `Focused on ${selectedTrendMonth.label}${visibleDailyTrendRangeLabel ? ` · ${visibleDailyTrendRangeLabel}` : ''}`
                      : visibleDailyTrendRangeLabel || 'Showing the current visible window'}
                  </p>
                </div>
                <p className="text-[10px] text-white/30 uppercase tracking-[0.18em]">Navigator below</p>
              </div>

              <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                <div style={{ minWidth: `${dailyTrendChartMinWidth}px` }}>
                  <ResponsiveContainer width="100%" height={430}>
                    <ComposedChart data={visibleDailyTrendData} margin={{ top: 8, right: 12, left: -16, bottom: 16 }}>
                      <defs>
                        <linearGradient id="combinedDailyArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="combinedDailyBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#312e81" stopOpacity={0.45} />
                        </linearGradient>
                        <linearGradient id="combinedDailyPeak" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#15803d" stopOpacity={0.45} />
                        </linearGradient>
                        <linearGradient id="combinedDailyLatest" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#155e75" stopOpacity={0.45} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={26}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `$${value}`}
                      />
                      <Tooltip content={<DailyEarningsTooltip />} cursor={{ fill: 'rgba(129,140,248,0.06)' }} />
                      {dailyEarningsInsights && (
                        <ReferenceLine
                          y={dailyEarningsInsights.averagePerDay}
                          stroke="rgba(255,255,255,0.22)"
                          strokeDasharray="4 4"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="rgba(129,140,248,0.42)"
                        strokeWidth={1.5}
                        fill="url(#combinedDailyArea)"
                        dot={false}
                        activeDot={false}
                      />
                      <Bar dataKey="amount" shape={(shapeProps) => <TrendCandleBar {...shapeProps} />} maxBarSize={18}>
                        {visibleDailyTrendData.map((entry) => (
                          <Cell
                            key={entry.dayKey}
                            fill={entry.isPeak ? 'url(#combinedDailyPeak)' : entry.isLatest ? 'url(#combinedDailyLatest)' : 'url(#combinedDailyBar)'}
                          />
                        ))}
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="rollingAverage"
                        stroke="#22d3ee"
                        strokeWidth={2.4}
                        dot={false}
                        activeDot={{ r: 4, fill: '#22d3ee', stroke: 'rgba(10,10,26,0.9)', strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 mt-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Timeline Navigator</p>
                  <p className="text-[10px] text-white/26 uppercase tracking-[0.18em]">Drag to adjust focus</p>
                </div>
                <ResponsiveContainer width="100%" height={86}>
                  <ComposedChart data={dailyTrendData} margin={{ top: 6, right: 10, left: -16, bottom: 0 }} key={`${selectedTrendMonthKey}-${dailyTrendData.length}`}>
                    <defs>
                      <linearGradient id="combinedDailyNavigator" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" hide />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Area type="monotone" dataKey="amount" stroke="rgba(129,140,248,0.45)" strokeWidth={1.2} fill="url(#combinedDailyNavigator)" dot={false} activeDot={false} />
                    <Brush
                      dataKey="label"
                      height={24}
                      travellerWidth={10}
                      stroke="rgba(129,140,248,0.72)"
                      fill="rgba(129,140,248,0.10)"
                      startIndex={dailyTrendBrushRange.startIndex}
                      endIndex={dailyTrendBrushRange.endIndex}
                      onChange={handleDailyTrendBrushChange}
                      tickFormatter={() => ''}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] text-white/35 uppercase tracking-[0.18em]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-accent-light" />
                  Daily Total
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-5 rounded-full bg-accent-cyan" />
                  7D Trend
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-5 rounded-full border-t border-dashed border-white/40" />
                  Average Day
                </div>
              </div>
            </>
          ) : (
            <div className="h-[420px] flex items-center justify-center text-sm text-white/30 px-6 text-center">
              {historyCoverageMessage || 'No reward flow to chart yet.'}
            </div>
          )}
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">

        <ChartCard
          eyebrow="Fleet Health"
          title="License health split"
          description="Shows how the visible fleet breaks down by current runtime status."
          footer={dominantStatus ? `${dominantStatus} is the largest status slice right now.` : 'No licenses available to classify.'}
        >
          {statusMixData.length ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusMixData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3}>
                    {statusMixData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieBreakdownTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {statusMixData.map((entry) => (
                  <div key={entry.name} className="glass-subtle p-3 rounded-xl">
                    <div className="flex items-center gap-2 text-xs text-white/45">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      {entry.name}
                    </div>
                    <p className="text-lg font-semibold text-white mt-1">{entry.value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-white/30">No license telemetry yet.</div>
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Tag Shape"
          title="Tag coverage radar"
          description="Compares how many licenses and how much range reward each preset tag contributes."
          footer="Clone, Work, Secure Folder, Main, and Untagged are measured side by side."
        >
          {tagCoverageData.some((entry) => entry.licenses > 0 || entry.rewards > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={tagCoverageData} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} stroke="rgba(255,255,255,0.06)" />
                <Tooltip content={<RadarBreakdownTooltip />} />
                <Radar name="Licenses" dataKey="licenses" stroke="#818cf8" fill="#818cf8" fillOpacity={0.26} />
                <Radar name="Rewards" dataKey="rewards" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.12} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-white/30">No tag activity to compare yet.</div>
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Cadence"
          title="Reward cadence profile"
          description="Shows how steady the visible reward flow is, how often rewards land, and whether the range is streaky or quiet."
          footer={rewardCadence ? `${rewardCadence.activeDays} active reward days across ${rewardCadence.totalDays} visible days.` : 'No rewarded days in this date range.'}
        >
          {rewardCadence ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Active Days</p>
                  <p className="text-sm font-semibold text-white mt-1">{rewardCadence.activeDays}</p>
                  <p className="text-[10px] text-white/35 mt-1">{formatShareValue(rewardCadence.activeRate)} of visible range</p>
                </div>
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Quiet Days</p>
                  <p className="text-sm font-semibold text-white mt-1">{rewardCadence.quietDays}</p>
                  <p className="text-[10px] text-white/35 mt-1">{formatShareValue(rewardCadence.quietRate)} with no payout</p>
                </div>
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Avg Active Day</p>
                  <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(rewardCadence.averageActiveDay)}</p>
                  <p className="text-[10px] text-white/35 mt-1">Only days with rewards</p>
                </div>
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Best 7d Run</p>
                  <p className="text-sm font-semibold text-white mt-1">{formatUsdValue(rewardCadence.bestWeekTotal)}</p>
                  <p className="text-[10px] text-white/35 mt-1">{rewardCadence.bestWeekLabel}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.05]">
                  <div style={{ width: `${rewardCadence.activeRate}%`, backgroundColor: '#22c55e' }} title={`Active days: ${rewardCadence.activeRate}%`} />
                  <div style={{ width: `${rewardCadence.quietRate}%`, backgroundColor: '#475569' }} title={`Quiet days: ${rewardCadence.quietRate}%`} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/55">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-success" />
                      <span>Latest 7d</span>
                    </div>
                    <span className="font-medium text-white">{formatUsdValue(rewardCadence.latestWeekTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/55">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-accent-light" />
                      <span>Best 7d</span>
                    </div>
                    <span className="font-medium text-white">{formatUsdValue(rewardCadence.bestWeekTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/55">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span>Longest Active</span>
                    </div>
                    <span className="font-medium text-white">{rewardCadence.longestActiveStreak} day{rewardCadence.longestActiveStreak === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/55">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                      <span>Longest Quiet</span>
                    </div>
                    <span className="font-medium text-white">{rewardCadence.longestQuietStreak} day{rewardCadence.longestQuietStreak === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <p className="text-[11px] text-white/35 mt-4">
                  Rewards landed on {formatShareValue(rewardCadence.activeRate)} of visible days. The best 7-day stretch produced {formatUsdValue(rewardCadence.bestWeekTotal)}, while the longest dry spell lasted {rewardCadence.longestQuietStreak} day{rewardCadence.longestQuietStreak === 1 ? '' : 's'}.
                </p>
              </div>
            </>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-white/30">No rewarded days to profile yet.</div>
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Device Leaders"
          title="Top devices by rewards"
          description="Groups licenses by the combined device identity and ranks them by selected-range earnings."
          className="xl:col-span-3"
          footer={topDeviceRewards.length ? `${topDeviceRewards[0].name} is the strongest device family in the current range.` : 'No device reward data in this range.'}
        >
          {topDeviceRewards.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topDeviceRewards} layout="vertical" margin={{ top: 8, right: 12, left: 16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => (value.length > 18 ? `${value.slice(0, 16)}…` : value)}
                />
                <Tooltip content={<DeviceTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                  {topDeviceRewards.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-white/30">No device rewards to rank yet.</div>
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Density Map"
          title="Uptime versus rewards"
          description="Bubbles show which licenses convert uptime into reward volume and how often they earned."
          className="xl:col-span-2"
          footer="Bubble size scales with reward entry count inside the selected date range."
        >
          {uptimeScatterData.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="x" name="Uptime" domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
                <YAxis type="number" dataKey="y" name="Rewards" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                <ZAxis type="number" dataKey="z" range={[70, 350]} />
                <Tooltip content={<ScatterTooltipContent />} cursor={{ strokeDasharray: '4 4', stroke: 'rgba(129,140,248,0.3)' }} />
                <Scatter data={uptimeScatterData} fill="#818cf8" fillOpacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-white/30">No uptime-linked rewards to compare yet.</div>
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Cut Spread"
          title="ULO distribution bands"
          description="Counts how many licenses sit in each ULO cut bucket and how much reward each band produced in range."
          footer={dominantUloBand ? `${dominantUloBand} is the most common visible ULO band.` : 'No lease-share data available.'}
        >
          {uloDistributionData.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={uloDistributionData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="cut" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CutTooltip />} cursor={{ fill: 'rgba(34,197,94,0.08)' }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#22c55e" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-white/30">No ULO cut bands to chart yet.</div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}