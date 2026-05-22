import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Pencil, Check, X } from 'lucide-react';
import TrendCandleBar from '../components/common/TrendCandleBar';
import HoverRevealText from '../components/common/HoverRevealText';
import { useDeviceCombinations } from '../hooks/useDeviceCombinations';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import LicenseTagPicker from '../components/licenses/LicenseTagPicker';
import LicenseStatusBadge from '../components/licenses/LicenseStatusBadge';
import OperatorPicker from '../components/licenses/OperatorPicker';
import { aggregateByRewardMonth, formatDateShort, formatRewardDayLabel, getRewardDayKey, getRewardMonthKey, microsDetailed, truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, formatLeaseTimeLeft, formatLicenseDistribution, formatTaggedLicenseName, getLicenseBackendName, getLicenseDisplayName, getLicenseOriginalBackendName } from '../utils/licenseDisplay';
import { ResponsiveContainer, ComposedChart, Area, Bar, Brush, Cell, Line, ReferenceLine, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { LicenseDetailSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';

const DAILY_REWARD_DEFAULT_WINDOW = 45;
const DAILY_REWARD_MIN_WIDTH = 720;
const DAILY_REWARD_BAR_WIDTH = 24;
const TOOLTIP_BREAKDOWN_LIMIT = 6;

function formatDailyRewardAmount(value) {
  return `$${Number(value || 0).toFixed(4)} UP`;
}

function formatRewardBreakdownTime(value) {
  if (!value) {
    return 'Unknown time';
  }

  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DailyRewardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;
  const hasCombinedBreakdown = point.rewardCount > 1 && point.breakdown?.length;

  return (
    <div
      style={{
        background: 'rgba(10,10,26,0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '12px',
        color: '#fff',
        padding: '10px 14px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{formatDailyRewardAmount(point.reward)}</p>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
        {hasCombinedBreakdown
          ? `${point.rewardCount} rewards combined into this day total`
          : 'Single reward for this day'}
      </p>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 }}>
        7-day trend {formatDailyRewardAmount(point.rollingAverage)}
      </p>
      {hasCombinedBreakdown ? (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Breakdown
          </p>
          {point.breakdown.slice(0, TOOLTIP_BREAKDOWN_LIMIT).map((entry) => (
            <div
              key={`${entry.timestamp}-${entry.amount}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}
            >
              <span style={{ color: 'rgba(255,255,255,0.48)', fontSize: 10 }}>{entry.timeLabel}</span>
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 10, fontFamily: 'monospace' }}>
                {formatDailyRewardAmount(entry.amount)}
              </span>
            </div>
          ))}
          {point.breakdown.length > TOOLTIP_BREAKDOWN_LIMIT ? (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 6 }}>
              +{point.breakdown.length - TOOLTIP_BREAKDOWN_LIMIT} more reward{point.breakdown.length - TOOLTIP_BREAKDOWN_LIMIT === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function LicenseDetailPage({ api }) {
  const { id } = useParams();
  const decodedId = decodeURIComponent(id);
  const { user, allocations, licenses: licenseMetadata, isLoading } = api;

  // All daily reward logs for this license
  const allLogs = useMemo(() => {
    return (allocations || [])
      .filter((a) => a.licenseId === decodedId)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  }, [allocations, decodedId]);

  const dateRange = useDateRangeFilter(allLogs);
  const logs = dateRange.filtered;

  const monthData = useMemo(() => aggregateByRewardMonth(logs), [logs]);
  const hasRewardData = allLogs.length > 0;

  const totalReward = logs.reduce((sum, a) => sum + a.amountMicros, 0);
  const { deviceAliasLookup } = useDeviceCombinations(user?.id);
  const { getLabel, setLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, setPresetTag, presetTags, cloneTagOrder, workTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator, setOperator, allOperators } = useOperatorTags(user?.id);
  const [selectedChartMonthKey, setSelectedChartMonthKey] = useState('all');
  const [dailyRewardBrushRange, setDailyRewardBrushRange] = useState({ startIndex: 0, endIndex: 0 });

  const chartData = useMemo(() => {
    const dailyBuckets = logs.reduce((map, allocation) => {
      const dayKey = getRewardDayKey(allocation.completedAt);
      const current = map.get(dayKey) || {
        dayKey,
        monthKey: getRewardMonthKey(dayKey),
        totalMicros: 0,
        rewardCount: 0,
        breakdown: [],
      };

      current.totalMicros += allocation.amountMicros;
      current.rewardCount += 1;
      current.breakdown.push({
        timestamp: allocation.completedAt,
        timeLabel: formatRewardBreakdownTime(allocation.completedAt),
        amount: Number((allocation.amountMicros / 1_000_000).toFixed(4)),
      });
      map.set(dayKey, current);
      return map;
    }, new Map());

    const orderedDays = Array.from(dailyBuckets.values()).sort((left, right) => left.dayKey.localeCompare(right.dayKey));
    const peakTotalMicros = orderedDays.reduce((maxValue, entry) => Math.max(maxValue, entry.totalMicros), 0);

    return orderedDays.map((entry, index) => {
      const windowEntries = orderedDays.slice(Math.max(0, index - 6), index + 1);
      const rollingAverageMicros = windowEntries.reduce((sum, windowEntry) => sum + windowEntry.totalMicros, 0) / windowEntries.length;

      return {
        dayKey: entry.dayKey,
        date: formatRewardDayLabel(entry.dayKey),
        reward: Number((entry.totalMicros / 1_000_000).toFixed(4)),
        rewardCount: entry.rewardCount,
        monthKey: entry.monthKey,
        breakdown: [...entry.breakdown].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp)),
        rollingAverage: Number((rollingAverageMicros / 1_000_000).toFixed(4)),
        isPeak: peakTotalMicros > 0 && entry.totalMicros === peakTotalMicros,
        isLatest: index === orderedDays.length - 1,
      };
    });
  }, [logs]);

  const visibleDailyRewardData = useMemo(() => {
    if (!chartData.length) {
      return [];
    }

    const safeStart = Math.max(0, Math.min(dailyRewardBrushRange.startIndex, chartData.length - 1));
    const safeEnd = Math.max(safeStart, Math.min(dailyRewardBrushRange.endIndex, chartData.length - 1));

    return chartData.slice(safeStart, safeEnd + 1);
  }, [chartData, dailyRewardBrushRange]);

  const visibleDailyRewardRangeLabel = useMemo(() => {
    if (!visibleDailyRewardData.length) {
      return null;
    }

    return `${visibleDailyRewardData[0].date} - ${visibleDailyRewardData[visibleDailyRewardData.length - 1].date}`;
  }, [visibleDailyRewardData]);

  const dailyRewardInsights = useMemo(() => {
    if (!visibleDailyRewardData.length) {
      return null;
    }

    const totalVisibleRewards = visibleDailyRewardData.reduce((sum, entry) => sum + entry.reward, 0);
    const bestDay = [...visibleDailyRewardData].sort((left, right) => right.reward - left.reward)[0];
    const latestDay = visibleDailyRewardData[visibleDailyRewardData.length - 1];

    return {
      bestDay,
      latestDay,
      averagePerDay: Number((totalVisibleRewards / visibleDailyRewardData.length).toFixed(4)),
      dayCount: visibleDailyRewardData.length,
    };
  }, [visibleDailyRewardData]);

  const dailyRewardBrushStartIndex = useMemo(() => {
    if (!chartData.length) {
      return 0;
    }

    return Math.max(0, chartData.length - DAILY_REWARD_DEFAULT_WINDOW);
  }, [chartData]);

  const dailyRewardChartMinWidth = useMemo(
    () => Math.max(DAILY_REWARD_MIN_WIDTH, visibleDailyRewardData.length * DAILY_REWARD_BAR_WIDTH),
    [visibleDailyRewardData]
  );

  const monthChartWindows = useMemo(() => {
    const rangesByMonthKey = new Map();

    chartData.forEach((entry, index) => {
      const current = rangesByMonthKey.get(entry.monthKey);

      if (current) {
        current.endIndex = index;
        return;
      }

      rangesByMonthKey.set(entry.monthKey, {
        startIndex: index,
        endIndex: index,
      });
    });

    return monthData.map((month) => ({
      ...month,
      startIndex: rangesByMonthKey.get(month.key)?.startIndex ?? 0,
      endIndex: rangesByMonthKey.get(month.key)?.endIndex ?? 0,
    }));
  }, [chartData, monthData]);

  const selectedChartMonth = useMemo(
    () => monthChartWindows.find((month) => month.key === selectedChartMonthKey) || null,
    [monthChartWindows, selectedChartMonthKey]
  );

  useEffect(() => {
    if (selectedChartMonthKey === 'all') {
      return;
    }

    if (!selectedChartMonth) {
      setSelectedChartMonthKey('all');
    }
  }, [selectedChartMonth, selectedChartMonthKey]);

  useEffect(() => {
    if (!chartData.length) {
      setDailyRewardBrushRange({ startIndex: 0, endIndex: 0 });
      return;
    }

    if (selectedChartMonth) {
      setDailyRewardBrushRange({
        startIndex: selectedChartMonth.startIndex,
        endIndex: selectedChartMonth.endIndex,
      });
      return;
    }

    setDailyRewardBrushRange({
      startIndex: dailyRewardBrushStartIndex,
      endIndex: chartData.length - 1,
    });
  }, [chartData.length, dailyRewardBrushStartIndex, selectedChartMonth]);

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

  const licenseDetails = useMemo(
    () => (licenseMetadata || []).find((license) => license.id === decodedId) || null,
    [licenseMetadata, decodedId]
  );
  const backendName = getLicenseBackendName(licenseDetails, deviceAliasLookup);
  const originalBackendName = getLicenseOriginalBackendName(licenseDetails);
  const originalIdentityName = originalBackendName && originalBackendName !== backendName ? originalBackendName : '';
  const label = getLabel(decodedId);
  const presetTag = getPresetTag(decodedId);
  const tagIndex = tagIndexById[decodedId] || null;
  const latestRewardAt = logs.length ? logs[logs.length - 1].completedAt : null;
  const latestValidationAt = licenseDetails?.validationLastSuccessAt || null;
  const latestDate = (() => {
    const rewardTs = latestRewardAt ? new Date(latestRewardAt).getTime() : 0;
    const validationTs = latestValidationAt ? new Date(latestValidationAt).getTime() : 0;
    const latest = validationTs > rewardTs ? latestValidationAt : latestRewardAt;
    return latest ? new Date(latest).toLocaleDateString() : '—';
  })();
  const uptimePercentage =
    typeof licenseDetails?.uptime === 'number' ? Number((licenseDetails.uptime * 100).toFixed(2)) : null;
  const minUptime =
    typeof licenseDetails?.leaseMinUptimePercentage === 'number'
      ? licenseDetails.leaseMinUptimePercentage
      : null;
  const statusKey = !licenseDetails?.deviceId && !licenseDetails?.deviceName
    ? 'unbound'
    : licenseDetails?.isOnline
      ? 'online'
      : 'offline';
  const deviceSummary = backendName || licenseDetails?.deviceId || 'No device bound';
  const distributionLabel = formatLicenseDistribution(licenseDetails?.leaseSharePercentage);
  const leaseTimeLeft = formatLeaseTimeLeft(licenseDetails?.leaseTo);
  const taggedName = formatTaggedLicenseName(backendName, presetTag, tagIndex);
  const displayName = getLicenseDisplayName({ customLabel: label, backendName, presetTag, tagIndex });
  const operator = getOperator(decodedId);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const copyId = () => {
    navigator.clipboard.writeText(decodedId);
    toast.success('License ID copied');
  };

  const startEditing = () => {
    setEditValue(displayName || '');
    setEditing(true);
  };

  const saveLabel = () => {
    const success = setLabel(decodedId, editValue);
    if (success) setEditing(false);
  };

  const handleSelectChartMonth = (monthKey) => {
    if (!chartData.length || monthKey === 'all') {
      setSelectedChartMonthKey('all');
      setDailyRewardBrushRange({
        startIndex: dailyRewardBrushStartIndex,
        endIndex: Math.max(0, chartData.length - 1),
      });
      return;
    }

    const targetMonth = monthChartWindows.find((month) => month.key === monthKey);

    if (!targetMonth) {
      return;
    }

    setSelectedChartMonthKey(targetMonth.key);
    setDailyRewardBrushRange({
      startIndex: targetMonth.startIndex,
      endIndex: targetMonth.endIndex,
    });
  };

  const handleDailyRewardBrushChange = ({ startIndex, endIndex }) => {
    if (!chartData.length) {
      return;
    }

    const nextStartIndex = typeof startIndex === 'number' ? startIndex : 0;
    const nextEndIndex = typeof endIndex === 'number' ? endIndex : chartData.length - 1;

    if (selectedChartMonth && (nextStartIndex !== selectedChartMonth.startIndex || nextEndIndex !== selectedChartMonth.endIndex)) {
      setSelectedChartMonthKey('all');
    }

    setDailyRewardBrushRange({
      startIndex: nextStartIndex,
      endIndex: nextEndIndex,
    });
  };

  if (isLoading) return <LicenseDetailSkeleton />;

  if (!licenseDetails && !allLogs.length) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link to="/licenses" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">License Not Found</h1>
        </div>
        <p className="text-white/40">No reward data found for this license.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link to="/licenses" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40 shrink-0 mt-0.5">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLabel();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    placeholder="e.g. Phone-01, Laptop..."
                    className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-base sm:text-lg text-white placeholder-white/30 focus:outline-none focus:border-accent/50 w-full max-w-[200px]"
                    autoFocus
                  />
                  <button onClick={saveLabel} className="text-success hover:text-success/80 p-1">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60 p-1">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <HoverRevealText
                    as="h1"
                    text={displayName || 'License Details'}
                    className="text-xl sm:text-2xl font-bold text-white truncate"
                    wrapperClassName="flex-1 min-w-0"
                  />
                  <button onClick={startEditing} className="text-white/20 hover:text-white/60 shrink-0">
                    <Pencil size={14} />
                  </button>
                  <LicenseTagPicker
                    value={presetTag}
                    onChange={(tag) => setPresetTag(decodedId, tag)}
                    onRemove={() => setPresetTag(decodedId, '')}
                  />
                  <OperatorPicker
                    value={operator}
                    allOperators={allOperators}
                    onChange={(name) => setOperator(decodedId, name)}
                    onRemove={() => setOperator(decodedId, '')}
                  />
                </div>
              )}
              {(label && backendName) || (label && taggedName) ? (
                <HoverRevealText
                  as="p"
                  text={taggedName ? `Auto tag name: ${taggedName}` : `Device: ${backendName}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              ) : null}
              {!label && presetTag && backendName && (
                <HoverRevealText
                  as="p"
                  text={`Tag preset: ${presetTag}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              )}
              {originalIdentityName && (
                <HoverRevealText
                  as="p"
                  text={`Original identity: ${originalIdentityName}`}
                  className="text-xs sm:text-sm text-white/25 mt-1 truncate"
                />
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs sm:text-sm text-white/30 font-mono truncate">{truncateHex(decodedId, 8, 6)}</span>
                <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>
            {hasRewardData && <DateRangeFilter {...dateRange} />}
          </div>
        </div>
      </div>

      {/* Stats + License ID row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Total Earned</p>
          <p className="text-base sm:text-xl font-bold text-success mt-0.5 sm:mt-1 truncate">${microsDetailed(totalReward)}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">UP</p>
        </div>
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Entries</p>
          <p className="text-base sm:text-xl font-bold text-white mt-0.5 sm:mt-1">{logs.length}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">reward logs</p>
        </div>
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Last Active</p>
          <p className="text-base sm:text-xl font-bold text-white/70 mt-0.5 sm:mt-1 truncate">{latestDate}</p>
        </div>
      </div>

      {licenseDetails && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Device</p>
            <HoverRevealText
              as="p"
              text={taggedName || deviceSummary}
              className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate"
            />
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {originalIdentityName ? `Original: ${originalIdentityName}` : 'Official metadata'}
            </p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Uptime</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">
              {uptimePercentage !== null ? `${uptimePercentage}%` : '—'}
            </p>
            <p className="text-[9px] sm:text-[10px] text-white/30">Min. {minUptime !== null ? `${minUptime}%` : '—'}</p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Status</p>
            <div className="mt-2">
              <LicenseStatusBadge status={statusKey} />
            </div>
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {latestValidationAt ? `Validated ${new Date(latestValidationAt).toLocaleDateString()}` : 'No validation yet'}
            </p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Distribution</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{distributionLabel}</p>
            <p className="text-[9px] sm:text-[10px] text-white/30">ULO and UNO cut</p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Lease Left</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{leaseTimeLeft}</p>
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {licenseDetails?.leaseTo ? `Ends ${formatDateShort(licenseDetails.leaseTo)}` : 'No lease expiry'}
            </p>
          </div>
        </div>
      )}

      {/* License ID compact */}
      <div className="glass-subtle px-3 sm:px-4 py-2.5 sm:py-3 mb-4 sm:mb-6 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">License ID</p>
          <p className="text-xs text-white/50 font-mono truncate">{decodedId}</p>
        </div>
        <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0 ml-3 p-1">
          <Copy size={14} />
        </button>
      </div>

      {monthData.length > 0 && (
        <div className="glass p-4 sm:p-6 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Monthly Rewards</h2>
              <p className="text-[11px] text-white/30 mt-1">Select a month to jump the daily chart to that section.</p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectChartMonth('all')}
              className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs transition-colors ${selectedChartMonthKey === 'all'
                ? 'border-accent-light/40 bg-accent-light/15 text-accent-light'
                : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75'}`}
            >
              All visible months
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {monthChartWindows.map((month) => (
              <button
                key={month.key}
                type="button"
                onClick={() => handleSelectChartMonth(month.key)}
                className={`glass-subtle p-3 rounded-xl text-left transition-colors ${selectedChartMonthKey === month.key
                  ? 'border border-accent-light/35 bg-accent-light/12'
                  : 'border border-transparent hover:border-white/[0.08] hover:bg-white/[0.05]'}`}
              >
                <p className="text-xs text-white/40">{month.label}</p>
                <p className="text-sm font-bold text-accent-light mt-1">${microsDetailed(month.totalMicros)} UP</p>
                <p className="text-[10px] text-white/20">{month.count} rewards</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reward chart — full width */}
      {chartData.length > 1 && (
        <div className="glass p-4 sm:p-6 mb-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Daily Rewards</h2>
              <p className="text-[11px] text-white/30 mt-1">
                {selectedChartMonth
                  ? `Focused on ${selectedChartMonth.label}${visibleDailyRewardRangeLabel ? ` · ${visibleDailyRewardRangeLabel}` : ''}`
                  : visibleDailyRewardRangeLabel || 'Showing the current visible range'}
              </p>
            </div>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.18em]">Navigator below</p>
          </div>

          {dailyRewardInsights && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Best Day</p>
                <p className="text-sm font-semibold text-white mt-1">{formatDailyRewardAmount(dailyRewardInsights.bestDay.reward)}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyRewardInsights.bestDay.date}</p>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Average / Day</p>
                <p className="text-sm font-semibold text-white mt-1">{formatDailyRewardAmount(dailyRewardInsights.averagePerDay)}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyRewardInsights.dayCount} visible day buckets</p>
              </div>
              <div className="glass-subtle rounded-xl p-3 col-span-2 lg:col-span-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Day</p>
                <p className="text-sm font-semibold text-white mt-1">{formatDailyRewardAmount(dailyRewardInsights.latestDay.reward)}</p>
                <p className="text-[10px] text-white/35 mt-1">{dailyRewardInsights.latestDay.date}</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            <div style={{ minWidth: `${dailyRewardChartMinWidth}px` }}>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={visibleDailyRewardData} margin={{ top: 8, right: 12, left: -12, bottom: 20 }}>
                  <defs>
                    <linearGradient id="dailyRewardArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="dailyRewardBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="dailyRewardPeak" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.92} />
                      <stop offset="100%" stopColor="#15803d" stopOpacity={0.52} />
                    </linearGradient>
                    <linearGradient id="dailyRewardLatest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.92} />
                      <stop offset="100%" stopColor="#155e75" stopOpacity={0.52} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
                    stroke="rgba(255,255,255,0.06)"
                    minTickGap={26}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
                    stroke="rgba(255,255,255,0.06)"
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip content={<DailyRewardTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  {dailyRewardInsights && (
                    <ReferenceLine
                      y={dailyRewardInsights.averagePerDay}
                      stroke="rgba(255,255,255,0.22)"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="reward"
                    stroke="rgba(129,140,248,0.45)"
                    strokeWidth={1.5}
                    fill="url(#dailyRewardArea)"
                    dot={false}
                    activeDot={false}
                  />
                  <Bar dataKey="reward" shape={(shapeProps) => <TrendCandleBar {...shapeProps} />} maxBarSize={18}>
                    {visibleDailyRewardData.map((entry) => (
                      <Cell
                        key={entry.dayKey}
                        fill={entry.isPeak ? 'url(#dailyRewardPeak)' : entry.isLatest ? 'url(#dailyRewardLatest)' : 'url(#dailyRewardBar)'}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="rollingAverage"
                    stroke="#22d3ee"
                    strokeWidth={2.2}
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
            <ResponsiveContainer width="100%" height={84}>
              <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: -12, bottom: 0 }} key={`${selectedChartMonthKey}-${chartData.length}`}>
                <defs>
                  <linearGradient id="dailyRewardNavigator" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, 'dataMax']} />
                <Area type="monotone" dataKey="reward" stroke="rgba(129,140,248,0.45)" strokeWidth={1.2} fill="url(#dailyRewardNavigator)" dot={false} activeDot={false} />
                <Brush
                  dataKey="date"
                  height={24}
                  travellerWidth={10}
                  stroke="rgba(129,140,248,0.72)"
                  fill="rgba(129,140,248,0.10)"
                  startIndex={dailyRewardBrushRange.startIndex}
                  endIndex={dailyRewardBrushRange.endIndex}
                  onChange={handleDailyRewardBrushChange}
                  tickFormatter={() => ''}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-white/32 mt-3">
            Same-day rewards are merged into one daily total. Select a month card to jump straight to that section, then use the navigator below to fine-tune the visible window.
          </p>
        </div>
      )}

      {!hasRewardData && (
        <div className="glass p-4 sm:p-6 mb-4 text-sm text-white/40">
          No reward data has been recorded for this license yet. Device status and uptime are still available from the official license metadata.
        </div>
      )}

      {/* Reward log — fixed card with scroll, same pattern as Licenses page */}
      <div className="glass overflow-hidden flex flex-col" style={{ maxHeight: '400px' }}>
        <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Reward Log</h2>
          <span className="text-xs text-white/20">{logs.length} entries</span>
        </div>

        {/* Single table with sticky header */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left text-sm table-fixed">
            <colgroup>
              <col className="w-28" />
              <col />
              <col className="w-32 hidden sm:table-column" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[#0d0d1f]">
              <tr className="border-b border-white/[0.06]">
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium">Date</th>
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium">Reward</th>
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium hidden sm:table-cell">Type</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                [...logs].reverse().map((a) => (
                  <tr key={a.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2.5 px-4 text-white/40 text-xs sm:text-sm">{new Date(a.completedAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-4 text-accent-light font-medium text-xs sm:text-sm">${microsDetailed(a.amountMicros)} UP</td>
                    <td className="py-2.5 px-4 text-white/20 text-xs hidden sm:table-cell">{a.type?.replace(/_/g, ' ')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-sm text-white/35">
                    No reward entries yet for this license.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
