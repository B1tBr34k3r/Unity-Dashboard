import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, RefreshCw, TrendingUp, Users, Wallet } from 'lucide-react';
import DateRangeFilter from '../components/common/DateRangeFilter';
import { DashboardSkeleton } from '../components/common/Skeleton';
import StatCard from '../components/dashboard/StatCard';
import { getLicenseSnapshotStatus } from '../data/licenseSnapshotHistory';
import { useLicenseDeviceHistory } from '../hooks/useLicenseDeviceHistory';
import { useLicenseSnapshotHistory } from '../hooks/useLicenseSnapshotHistory';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { usePersistentPageState } from '../hooks/usePersistentPageState';
import { addDaysToRewardDayKey, formatRewardDayLabel, getRewardDayKey, microsToUsd } from '../utils/formatters';
import { buildCloneIndexMap, getLicenseBackendName, getLicenseDisplayName } from '../utils/licenseDisplay';

const WINDOW_DAY_COUNTS = {
  today: 0,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function hasBoundDevice(license) {
  return Boolean(license?.deviceId || license?.deviceName);
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatUnsignedUsd(micros) {
  return `$${microsToUsd(Math.abs(micros || 0))}`;
}

function formatSignedUsd(micros) {
  if (micros > 0) {
    return `+${formatUnsignedUsd(micros)}`;
  }

  if (micros < 0) {
    return `-${formatUnsignedUsd(micros)}`;
  }

  return '$0.00';
}

function formatOperatorName(name) {
  return name === '__unassigned__' ? 'Unassigned' : name;
}

function getUtcDayBounds(dayKey) {
  const dayStart = Date.parse(`${dayKey}T00:00:00.000Z`);

  return {
    dayStart,
    dayEnd: dayStart + DAY_MS - 1,
  };
}

function getDeviceLinkForDay(record, dayKey) {
  if (!record?.links?.length || !dayKey) {
    return null;
  }

  const { dayStart, dayEnd } = getUtcDayBounds(dayKey);

  return record.links.find((link) => {
    const linkedAt = Date.parse(link.linkedAt);
    const unlinkedAt = link.current || !link.unlinkedAt ? Number.POSITIVE_INFINITY : Date.parse(link.unlinkedAt);

    return linkedAt <= dayEnd && unlinkedAt >= dayStart;
  }) || null;
}

function formatDeviceName(deviceName, deviceId) {
  if (deviceName) {
    return deviceName;
  }

  if (deviceId) {
    return `Device ${deviceId.slice(0, 8)}`;
  }

  return '';
}

function formatLicenseDeviceReference(name, deviceName) {
  return deviceName ? `${name} on ${deviceName}` : name;
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : null;
}

function getEntryDeviceName(entry, perspective = 'current') {
  if (perspective === 'previous') {
    return entry.previousDeviceName || entry.deviceName || entry.currentDeviceName || '';
  }

  return entry.currentDeviceName || entry.deviceName || entry.previousDeviceName || '';
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sumMicros(entries, selector) {
  return entries.reduce((sum, entry) => sum + selector(entry), 0);
}

function formatExactContributionReason(entries, perspective, action, totalMicros, totalLabel) {
  const visibleEntries = entries.slice(0, 2);
  const parts = visibleEntries.map((entry) => {
    const amount = perspective === 'previous' ? entry.previousAmount : entry.currentAmount;
    const causeSuffix = entry.snapshotCauseDetail ? ` ${entry.snapshotCauseDetail}` : '';
    return `${formatLicenseDeviceReference(entry.name, getEntryDeviceName(entry, perspective))} ${action} ${formatUnsignedUsd(amount)}${causeSuffix}`;
  });
  const remainder = entries.length - visibleEntries.length;
  const visibleMicros = sumMicros(visibleEntries, (entry) => (perspective === 'previous' ? entry.previousAmount : entry.currentAmount));
  const remainderMicros = totalMicros - visibleMicros;

  if (remainder > 0 && remainderMicros > 0) {
    parts.push(`${formatCountLabel(remainder, 'more online license')} ${action} ${formatUnsignedUsd(remainderMicros)}`);
  }

  return `${totalLabel} ${formatSignedUsd(totalMicros)}: ${parts.join('; ')}.`;
}

function formatContinuingContributionReason(entries, totalMicros) {
  const visibleEntries = entries.slice(0, 2);
  const parts = visibleEntries.map((entry) => {
    const deviceName = getEntryDeviceName(entry, entry.diffMicros >= 0 ? 'current' : 'previous');
    const causeSuffix = entry.snapshotCauseDetail ? ` ${entry.snapshotCauseDetail}` : '';
    return `${formatLicenseDeviceReference(entry.name, deviceName)} ${entry.diffMicros >= 0 ? 'added' : 'lost'} ${formatUnsignedUsd(entry.diffMicros)}${causeSuffix}`;
  });
  const remainder = entries.length - visibleEntries.length;
  const visibleMicros = sumMicros(visibleEntries, (entry) => entry.diffMicros);
  const remainderMicros = totalMicros - visibleMicros;

  if (remainder > 0 && remainderMicros !== 0) {
    parts.push(`${formatCountLabel(remainder, 'more continuing license')} ${remainderMicros >= 0 ? 'added' : 'lost'} ${formatUnsignedUsd(remainderMicros)}`);
  }

  return `Continuing licenses net ${formatSignedUsd(totalMicros)}: ${parts.join('; ')}.`;
}

function formatDeviceShiftSuffix(entry) {
  if (!entry.currentDeviceName || !entry.previousDeviceName || entry.currentDeviceName === entry.previousDeviceName) {
    return '';
  }

  return ` after moving from ${entry.previousDeviceName} to ${entry.currentDeviceName}`;
}

function getSnapshotForDay(snapshotDays, dayKey, licenseId) {
  return snapshotDays?.[dayKey]?.licenses?.[licenseId] || null;
}

function getStatusLabel(status) {
  switch (status) {
    case 'online':
      return 'online';
    case 'offline':
      return 'offline';
    case 'below-min':
      return 'below minimum uptime';
    case 'unbound':
      return 'unbound';
    default:
      return '';
  }
}

function getSnapshotCauseDetail(previousSnapshot, currentSnapshot, entry) {
  const previousStatus = previousSnapshot ? getLicenseSnapshotStatus(previousSnapshot) : null;
  const currentStatus = currentSnapshot ? getLicenseSnapshotStatus(currentSnapshot) : null;
  const currentDeviceName = formatDeviceName(currentSnapshot?.deviceName || '', currentSnapshot?.deviceId || '');
  const previousDeviceName = formatDeviceName(previousSnapshot?.deviceName || '', previousSnapshot?.deviceId || '');
  const previousUptime = formatPercent(previousSnapshot?.uptimePercentage);
  const currentUptime = formatPercent(currentSnapshot?.uptimePercentage);
  const currentMinUptime = formatPercent(currentSnapshot?.minUptimePercentage);
  const previousMinUptime = formatPercent(previousSnapshot?.minUptimePercentage);

  if (entry.currentAmount === 0 && entry.previousAmount > 0) {
    if (currentStatus === 'offline') {
      return 'after going offline';
    }

    if (currentStatus === 'below-min') {
      return currentUptime && currentMinUptime
        ? `after falling below min uptime (${currentUptime} vs min ${currentMinUptime})`
        : 'after falling below min uptime';
    }

    if (currentStatus === 'unbound') {
      return previousDeviceName
        ? `after losing its binding from ${previousDeviceName}`
        : 'after losing its device binding';
    }
  }

  if (entry.currentAmount > 0 && entry.previousAmount === 0) {
    if (previousStatus === 'offline' && currentStatus === 'online') {
      return 'after coming back online';
    }

    if (previousStatus === 'below-min' && currentStatus === 'online') {
      return 'after recovering above min uptime';
    }

    if (previousStatus === 'unbound' && currentStatus === 'online') {
      return currentDeviceName ? `after binding to ${currentDeviceName}` : 'after regaining device binding';
    }

    if (currentStatus === 'online' && currentDeviceName) {
      return `while online on ${currentDeviceName}`;
    }
  }

  if (entry.currentAmount > 0 && entry.previousAmount > 0) {
    if (previousStatus !== 'below-min' && currentStatus === 'below-min') {
      return currentUptime && currentMinUptime
        ? `as uptime slipped below min (${currentUptime} vs min ${currentMinUptime})`
        : 'as uptime slipped below minimum';
    }

    if (previousStatus === 'below-min' && currentStatus !== 'below-min') {
      return 'after recovering above minimum uptime';
    }

    if (previousDeviceName && currentDeviceName && previousDeviceName !== currentDeviceName) {
      return `after moving from ${previousDeviceName} to ${currentDeviceName}`;
    }

    if (previousUptime && currentUptime && previousUptime !== currentUptime) {
      const minHint = currentMinUptime || previousMinUptime;
      return minHint
        ? `with uptime moving ${previousUptime} -> ${currentUptime} (min ${minHint})`
        : `with uptime moving ${previousUptime} -> ${currentUptime}`;
    }

    if (previousStatus && currentStatus && previousStatus !== currentStatus) {
      return `with status moving from ${getStatusLabel(previousStatus)} to ${getStatusLabel(currentStatus)}`;
    }
  }

  return '';
}

function getHistoryStatusMeta(historyInfo) {
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
}

function getRangeBounds({ preset, customFrom, customTo, oldestDayKey, newestDayKey }) {
  const today = startOfLocalDay(new Date());
  const todayKey = getRewardDayKey(today);

  if (preset === 'custom') {
    const fallbackFrom = oldestDayKey || todayKey;
    const fallbackTo = newestDayKey || todayKey;
    const rawFrom = customFrom ? getRewardDayKey(customFrom) : fallbackFrom;
    const rawTo = customTo ? getRewardDayKey(customTo) : fallbackTo;

    return rawFrom <= rawTo
      ? { fromDayKey: rawFrom, toDayKey: rawTo }
      : { fromDayKey: rawTo, toDayKey: rawFrom };
  }

  if (preset === 'all') {
    const fromDayKey = oldestDayKey || todayKey;
    let toDayKey = newestDayKey || todayKey;

    if (newestDayKey) {
      const newestDate = startOfLocalDay(newestDayKey);
      const daysFromToday = Math.round((today.getTime() - newestDate.getTime()) / DAY_MS);

      if (daysFromToday >= 0 && daysFromToday <= 1) {
        toDayKey = todayKey;
      }
    }

    return { fromDayKey, toDayKey };
  }

  const dayCount = WINDOW_DAY_COUNTS[preset] ?? 7;
  const fromDate = startOfLocalDay(new Date());
  fromDate.setDate(fromDate.getDate() - dayCount);

  return {
    fromDayKey: getRewardDayKey(fromDate),
    toDayKey: todayKey,
  };
}

function sortByAbsoluteDiff(left, right) {
  const diff = Math.abs(right.diffMicros) - Math.abs(left.diffMicros);

  if (diff !== 0) {
    return diff;
  }

  return right.diffMicros - left.diffMicros;
}

function buildComparison(day, previousDay, getDisplayName, getSnapshotForLicenseDay) {
  if (!previousDay) {
    return {
      ...day,
      previousLabel: null,
      deltaMicros: 0,
      rewardedLicenseDelta: 0,
      trend: 'first',
      summary: 'This is the first visible day in the selected range.',
      reasons: [
        {
          tone: 'neutral',
          text: 'No day-over-day explanation yet because there is no earlier day in this filtered range.',
        },
      ],
      operatorDiffs: [],
      licenseDiffs: [],
      topLicenseDriver: null,
    };
  }

  const currentLicenseIds = Object.keys(day.licenseAmounts);
  const previousLicenseIds = Object.keys(previousDay.licenseAmounts);
  const licenseIdUnion = new Set([...currentLicenseIds, ...previousLicenseIds]);
  const operatorUnion = new Set([...Object.keys(day.operatorAmounts), ...Object.keys(previousDay.operatorAmounts)]);
  const licenseDiffs = [];
  const operatorDiffs = [];

  licenseIdUnion.forEach((licenseId) => {
    const currentAmount = day.licenseAmounts[licenseId] || 0;
    const previousAmount = previousDay.licenseAmounts[licenseId] || 0;
    const diffMicros = currentAmount - previousAmount;
    const currentContext = getDisplayName(licenseId, day.dayKey);
    const previousContext = getDisplayName(licenseId, previousDay.dayKey);
    const activeContext = currentAmount > 0 ? currentContext : previousContext;
    const currentSnapshot = getSnapshotForLicenseDay(day.dayKey, licenseId);
    const previousSnapshot = getSnapshotForLicenseDay(previousDay.dayKey, licenseId);

    if (diffMicros !== 0) {
      const nextEntry = {
        licenseId,
        name: activeContext.name || currentContext.name || previousContext.name,
        deviceName: activeContext.deviceName || currentContext.deviceName || previousContext.deviceName || '',
        currentDeviceName: currentContext.deviceName || '',
        previousDeviceName: previousContext.deviceName || '',
        diffMicros,
        currentAmount,
        previousAmount,
        currentSnapshot,
        previousSnapshot,
        snapshotCauseDetail: getSnapshotCauseDetail(previousSnapshot, currentSnapshot, {
          currentAmount,
          previousAmount,
        }),
      };

      licenseDiffs.push(nextEntry);
    }
  });

  operatorUnion.forEach((operatorName) => {
    const currentAmount = day.operatorAmounts[operatorName] || 0;
    const previousAmount = previousDay.operatorAmounts[operatorName] || 0;
    const diffMicros = currentAmount - previousAmount;

    if (diffMicros !== 0) {
      operatorDiffs.push({
        operatorName,
        diffMicros,
        currentAmount,
        previousAmount,
      });
    }
  });

  licenseDiffs.sort(sortByAbsoluteDiff);
  operatorDiffs.sort(sortByAbsoluteDiff);

  const missingRewardEntries = licenseDiffs.filter((entry) => entry.currentAmount === 0 && entry.previousAmount > 0);
  const newRewardedEntries = licenseDiffs.filter((entry) => entry.currentAmount > 0 && entry.previousAmount === 0);
  const continuingEntries = licenseDiffs.filter((entry) => entry.currentAmount > 0 && entry.previousAmount > 0);
  const droppedMicros = -sumMicros(missingRewardEntries, (entry) => entry.previousAmount);
  const gainedMicros = sumMicros(newRewardedEntries, (entry) => entry.currentAmount);
  const continuingDeltaMicros = sumMicros(continuingEntries, (entry) => entry.diffMicros);

  const deltaMicros = day.totalMicros - previousDay.totalMicros;
  const rewardedLicenseDelta = day.rewardedLicenseCount - previousDay.rewardedLicenseCount;
  const topPositiveLicense = licenseDiffs.find((entry) => entry.diffMicros > 0) || null;
  const topNegativeLicense = licenseDiffs.find((entry) => entry.diffMicros < 0) || null;
  const topLicenseDriver = licenseDiffs[0] || null;
  const dominantOperator = operatorDiffs[0] || null;
  const reasons = [];

  if (missingRewardEntries.length > 0) {
    reasons.push({
      tone: 'negative',
      text: formatExactContributionReason(missingRewardEntries, 'previous', 'removed', droppedMicros, 'Exact drops'),
    });
  }

  if (newRewardedEntries.length > 0) {
    reasons.push({
      tone: 'positive',
      text: formatExactContributionReason(newRewardedEntries, 'current', 'added', gainedMicros, 'Exact gains'),
    });
  }

  if (continuingEntries.length > 0 && continuingDeltaMicros !== 0) {
    reasons.push({
      tone: continuingDeltaMicros >= 0 ? 'positive' : 'negative',
      text: formatContinuingContributionReason(continuingEntries, continuingDeltaMicros),
    });
  }

  if (!reasons.length && topLicenseDriver) {
    reasons.push({
      tone: topLicenseDriver.diffMicros >= 0 ? 'positive' : 'negative',
      text: `${formatLicenseDeviceReference(topLicenseDriver.name, getEntryDeviceName(topLicenseDriver, topLicenseDriver.diffMicros >= 0 ? 'current' : 'previous'))} swung ${formatSignedUsd(topLicenseDriver.diffMicros)} day over day${formatDeviceShiftSuffix(topLicenseDriver)}.`,
    });
  }

  if (reasons.length < 3 && dominantOperator) {
    reasons.push({
      tone: dominantOperator.diffMicros >= 0 ? 'positive' : 'negative',
      text: `${formatOperatorName(dominantOperator.operatorName)} netted ${formatSignedUsd(dominantOperator.diffMicros)} day over day.`,
    });
  }

  if (!reasons.length && rewardedLicenseDelta !== 0) {
    reasons.push({
      tone: rewardedLicenseDelta >= 0 ? 'positive' : 'negative',
      text: `${Math.abs(rewardedLicenseDelta)} ${rewardedLicenseDelta > 0 ? 'more' : 'fewer'} online license${Math.abs(rewardedLicenseDelta) === 1 ? '' : 's'} were rewarded than yesterday.`,
    });
  }

  if (!reasons.length) {
    reasons.push({
      tone: 'neutral',
      text: 'The total held roughly flat versus the previous day, with no single driver standing out.',
    });
  }

  let summary;
  let trend = 'flat';

  if (deltaMicros > 0) {
    trend = 'up';
    summary = `Rewards increased ${formatUnsignedUsd(deltaMicros)} vs ${previousDay.label}.`;
  } else if (deltaMicros < 0) {
    trend = 'down';
    summary = `Rewards fell ${formatUnsignedUsd(deltaMicros)} vs ${previousDay.label}.`;
  } else {
    summary = `Rewards held flat vs ${previousDay.label}.`;
  }

  if (rewardedLicenseDelta !== 0) {
    summary += ` ${Math.abs(rewardedLicenseDelta)} ${rewardedLicenseDelta > 0 ? 'more' : 'fewer'} online license${Math.abs(rewardedLicenseDelta) === 1 ? '' : 's'} paid.`;
  }

  return {
    ...day,
    previousLabel: previousDay.label,
    deltaMicros,
    rewardedLicenseDelta,
    trend,
    summary,
    reasons: reasons.slice(0, 3),
    operatorDiffs,
    licenseDiffs,
    topLicenseDriver: deltaMicros < 0 ? topNegativeLicense || topLicenseDriver : topPositiveLicense || topLicenseDriver,
    reconciliation: {
      droppedMicros,
      gainedMicros,
      continuingDeltaMicros,
      recomposedDeltaMicros: droppedMicros + gainedMicros + continuingDeltaMicros,
    },
  };
}

function buildDailyChangeModel({ allocations, fromDayKey, toDayKey, getDisplayName, getOperator, getSnapshotForLicenseDay }) {
  if (!fromDayKey || !toDayKey) {
    return {
      days: [],
      comparisons: [],
      latestComparison: null,
      biggestIncrease: null,
      biggestDrop: null,
      topMovers: [],
    };
  }

  const bucketsByDay = new Map();

  allocations.forEach((allocation) => {
    const dayKey = getRewardDayKey(allocation.completedAt);

    if (dayKey < fromDayKey || dayKey > toDayKey) {
      return;
    }

    if (!bucketsByDay.has(dayKey)) {
      bucketsByDay.set(dayKey, {
        dayKey,
        totalMicros: 0,
        allocationCount: 0,
        licenseAmounts: {},
        operatorAmounts: {},
      });
    }

    const bucket = bucketsByDay.get(dayKey);
    bucket.totalMicros += allocation.amountMicros;
    bucket.allocationCount += 1;
    bucket.licenseAmounts[allocation.licenseId] = (bucket.licenseAmounts[allocation.licenseId] || 0) + allocation.amountMicros;

    const operatorName = getOperator(allocation.licenseId) || '__unassigned__';
    bucket.operatorAmounts[operatorName] = (bucket.operatorAmounts[operatorName] || 0) + allocation.amountMicros;
  });

  const days = [];

  for (let dayKey = fromDayKey; dayKey <= toDayKey; dayKey = addDaysToRewardDayKey(dayKey, 1)) {
    const bucket = bucketsByDay.get(dayKey);
    const licenseAmounts = bucket?.licenseAmounts || {};
    const operatorAmounts = bucket?.operatorAmounts || {};

    days.push({
      dayKey,
      label: formatRewardDayLabel(dayKey, true),
      totalMicros: bucket?.totalMicros || 0,
      allocationCount: bucket?.allocationCount || 0,
      rewardedLicenseCount: Object.keys(licenseAmounts).length,
      licenseAmounts,
      operatorAmounts,
    });
  }

  const comparisons = days.map((day, index) => buildComparison(day, days[index - 1], getDisplayName, getSnapshotForLicenseDay));
  const moversByLicenseId = {};

  comparisons.slice(1).forEach((comparison) => {
    comparison.licenseDiffs.forEach((entry) => {
      if (!moversByLicenseId[entry.licenseId]) {
        moversByLicenseId[entry.licenseId] = {
          licenseId: entry.licenseId,
          name: entry.name,
          deviceName: entry.currentDeviceName || entry.previousDeviceName || entry.deviceName || '',
          totalSwingMicros: 0,
          changedDays: 0,
          largestSingleDayMicros: 0,
        };
      }

      if (entry.currentDeviceName || entry.previousDeviceName || entry.deviceName) {
        moversByLicenseId[entry.licenseId].deviceName = entry.currentDeviceName || entry.previousDeviceName || entry.deviceName;
      }

      moversByLicenseId[entry.licenseId].totalSwingMicros += Math.abs(entry.diffMicros);
      moversByLicenseId[entry.licenseId].changedDays += 1;
      moversByLicenseId[entry.licenseId].largestSingleDayMicros = Math.max(
        moversByLicenseId[entry.licenseId].largestSingleDayMicros,
        Math.abs(entry.diffMicros)
      );
    });
  });

  const comparableDays = comparisons.filter((entry) => entry.previousLabel);

  return {
    days,
    comparisons,
    latestComparison: comparisons[comparisons.length - 1] || null,
    biggestIncrease: comparableDays
      .filter((entry) => entry.deltaMicros > 0)
      .sort((left, right) => right.deltaMicros - left.deltaMicros)[0] || null,
    biggestDrop: comparableDays
      .filter((entry) => entry.deltaMicros < 0)
      .sort((left, right) => left.deltaMicros - right.deltaMicros)[0] || null,
    topMovers: Object.values(moversByLicenseId)
      .sort((left, right) => {
        if (right.totalSwingMicros !== left.totalSwingMicros) {
          return right.totalSwingMicros - left.totalSwingMicros;
        }

        return right.changedDays - left.changedDays;
      })
      .slice(0, 6),
  };
}

function getTrendMeta(trend) {
  switch (trend) {
    case 'up':
      return {
        label: 'Up',
        badgeClass: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        accentClass: 'text-success',
      };
    case 'down':
      return {
        label: 'Down',
        badgeClass: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
        accentClass: 'text-warning',
      };
    case 'flat':
      return {
        label: 'Flat',
        badgeClass: 'border-white/[0.08] bg-white/[0.04] text-white/55',
        accentClass: 'text-white/70',
      };
    default:
      return {
        label: 'Start',
        badgeClass: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
        accentClass: 'text-accent-light',
      };
  }
}

function getReasonToneClass(tone) {
  if (tone === 'positive') {
    return 'border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-100';
  }

  if (tone === 'negative') {
    return 'border-amber-400/15 bg-amber-400/[0.08] text-amber-100';
  }

  return 'border-white/[0.08] bg-white/[0.03] text-white/60';
}

function EmptyState({ title, body }) {
  return (
    <div className="glass p-6 sm:p-8 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-sm text-white/45 mt-2 max-w-xl mx-auto">{body}</p>
    </div>
  );
}

export default function DailyChangesPage({ api }) {
  const { user, licenses, allocations, historyInfo, isLoading, error, manualRefresh } = api;
  const { deviceHistory } = useLicenseDeviceHistory(user?.id, licenses);
  const { days: snapshotDays, meta: snapshotMeta } = useLicenseSnapshotHistory(user?.id, licenses);
  const { getLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, presetTags, cloneTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator } = useOperatorTags(user?.id);
  const navigate = useNavigate();
  const [preset, setPreset] = usePersistentPageState('page-state:daily-changes:preset', '7d');
  const [customFrom, setCustomFrom] = usePersistentPageState('page-state:daily-changes:custom-from', '');
  const [customTo, setCustomTo] = usePersistentPageState('page-state:daily-changes:custom-to', '');

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenses || []).map((license) => [license.id, license])),
    [licenses]
  );

  const cloneIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId]), cloneTagOrder),
    [presetTags, licenseInfoById, cloneTagOrder]
  );

  const onlineLicenseIds = useMemo(() => {
    return new Set(
      (licenses || [])
        .filter((license) => hasBoundDevice(license) && license.isOnline)
        .map((license) => String(license.id))
    );
  }, [licenses]);

  const onlineAllocations = useMemo(() => {
    return (allocations || []).filter((allocation) => onlineLicenseIds.has(String(allocation.licenseId)));
  }, [allocations, onlineLicenseIds]);

  const oldestDayKey = useMemo(() => {
    if (!onlineAllocations.length) {
      return null;
    }

    return getRewardDayKey(onlineAllocations[0].completedAt);
  }, [onlineAllocations]);

  const newestDayKey = useMemo(() => {
    if (!onlineAllocations.length) {
      return null;
    }

    return getRewardDayKey(onlineAllocations[onlineAllocations.length - 1].completedAt);
  }, [onlineAllocations]);

  const rangeBounds = useMemo(
    () => getRangeBounds({ preset, customFrom, customTo, oldestDayKey, newestDayKey }),
    [preset, customFrom, customTo, oldestDayKey, newestDayKey]
  );

  const getDisplayName = (licenseId, dayKey) => {
    const license = licenseInfoById[licenseId];
    const historyRecord = deviceHistory[licenseId];
    const deviceLink = getDeviceLinkForDay(historyRecord, dayKey);
    const lastKnownLink = historyRecord?.links?.[historyRecord.links.length - 1] || null;
    const currentDeviceName = getLicenseBackendName(license);
    const currentDeviceId = typeof license?.deviceId === 'string' ? license.deviceId.trim() : String(license?.deviceId || '').trim();
    const deviceName = formatDeviceName(
      deviceLink?.deviceName || currentDeviceName || lastKnownLink?.deviceName || '',
      deviceLink?.deviceId || currentDeviceId || lastKnownLink?.deviceId || ''
    );

    return {
      name: getLicenseDisplayName({
        customLabel: getLabel(licenseId),
        backendName: currentDeviceName,
        presetTag: getPresetTag(licenseId),
        cloneIndex: cloneIndexById[licenseId] || null,
      }) || `License ${licenseId}`,
      deviceName,
    };
  };

  const getSnapshotForLicenseDay = (dayKey, licenseId) => {
    return getSnapshotForDay(snapshotDays, dayKey, licenseId);
  };

  const analysis = useMemo(
    () => buildDailyChangeModel({
      allocations: onlineAllocations,
      fromDayKey: rangeBounds.fromDayKey,
      toDayKey: rangeBounds.toDayKey,
      getDisplayName,
      getOperator,
      getSnapshotForLicenseDay,
    }),
    [onlineAllocations, rangeBounds.fromDayKey, rangeBounds.toDayKey, getOperator, getLabel, getPresetTag, cloneIndexById, licenseInfoById, deviceHistory, snapshotDays]
  );

  const historyStatus = useMemo(() => getHistoryStatusMeta(historyInfo), [historyInfo]);
  const recentComparisons = useMemo(() => analysis.comparisons.slice(-10).reverse(), [analysis.comparisons]);
  const latestComparison = analysis.latestComparison;
  const currentRangeLabel = useMemo(() => {
    if (!rangeBounds.fromDayKey || !rangeBounds.toDayKey) {
      return null;
    }

    return `${formatRewardDayLabel(rangeBounds.fromDayKey, true)} -> ${formatRewardDayLabel(rangeBounds.toDayKey, true)}`;
  }, [rangeBounds.fromDayKey, rangeBounds.toDayKey]);

  const openLicenseHistory = (event, licenseId) => {
    event.stopPropagation();

    const detailPath = `/license-history/${encodeURIComponent(licenseId)}`;

    if (event.ctrlKey || event.metaKey) {
      window.open(`${window.location.origin}${detailPath}`, '_blank', 'noopener');
      return;
    }

    navigate(detailPath);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!onlineLicenseIds.size) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-white">Daily Changes</h1>
            <p className="text-sm text-white/45 mt-2 max-w-2xl">
              This view explains daily reward moves for the licenses that are online right now.
            </p>
          </div>
        </div>
        <EmptyState
          title="No online licenses in scope"
          body="Bring at least one bound license online to generate day-over-day reward explanations here."
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white">Daily Changes</h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">
            Day-over-day reward explanations for the licenses that are online right now. The reasons are grounded in payout history, license participation, and operator movement.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${historyStatus.className}`}>
              {historyStatus.label}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
              {onlineLicenseIds.size} Online Licenses
            </span>
            {currentRangeLabel ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                {currentRangeLabel}
              </span>
            ) : null}
            {snapshotMeta?.snapshotDayCount ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                {snapshotMeta.snapshotDayCount} Stored Snapshot Day{snapshotMeta.snapshotDayCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DateRangeFilter
            preset={preset}
            setPreset={setPreset}
            customFrom={customFrom}
            setCustomFrom={setCustomFrom}
            customTo={customTo}
            setCustomTo={setCustomTo}
          />
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

      {error ? (
        <div className="glass border-danger/30 p-4 text-sm text-danger" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard
          icon={Users}
          label="Online Scope"
          value={String(onlineLicenseIds.size)}
          sub="Current online fleet"
          color="text-success"
        />
        <StatCard
          icon={Wallet}
          label="Latest Day"
          value={latestComparison ? formatUnsignedUsd(latestComparison.totalMicros) : '$0.00'}
          sub={latestComparison ? latestComparison.label : 'No day selected'}
          color="text-accent-light"
        />
        <StatCard
          icon={TrendingUp}
          label="Vs Previous Day"
          value={latestComparison?.previousLabel ? formatSignedUsd(latestComparison.deltaMicros) : '$0.00'}
          sub={latestComparison?.previousLabel ? `${latestComparison.label} vs ${latestComparison.previousLabel}` : 'Need at least 2 days'}
          color={latestComparison?.deltaMicros > 0 ? 'text-success' : latestComparison?.deltaMicros < 0 ? 'text-warning' : 'text-white'}
        />
        <StatCard
          icon={Calendar}
          label="Visible Days"
          value={String(analysis.days.length)}
          sub={`${analysis.comparisons.filter((entry) => entry.previousLabel).length} comparable day pairs`}
          color="text-white"
        />
      </div>

      {!onlineAllocations.length ? (
        <EmptyState
          title="No stored rewards for online licenses yet"
          body="This page only explains reward movement once the current online fleet has at least one stored payout day in history."
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)] gap-4 sm:gap-6">
          <div className="space-y-4">
            {latestComparison ? (
              <section className="glass p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Latest Read</p>
                    <h2 className="text-lg sm:text-xl font-semibold text-white mt-2">{latestComparison.label}</h2>
                    <p className="text-sm text-white/45 mt-2 max-w-2xl">{latestComparison.summary}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${getTrendMeta(latestComparison.trend).badgeClass}`}>
                    {getTrendMeta(latestComparison.trend).label} {latestComparison.previousLabel ? formatSignedUsd(latestComparison.deltaMicros) : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  <div className="glass-subtle rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Total Rewards</p>
                    <p className="text-sm font-semibold text-white mt-1">{formatUnsignedUsd(latestComparison.totalMicros)}</p>
                    <p className="text-[10px] text-white/35 mt-1">{latestComparison.allocationCount} allocations across {latestComparison.rewardedLicenseCount} online licenses</p>
                  </div>
                  <div className="glass-subtle rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Rewarded Licenses</p>
                    <p className="text-sm font-semibold text-white mt-1">{latestComparison.rewardedLicenseCount}</p>
                    <p className="text-[10px] text-white/35 mt-1">{latestComparison.previousLabel ? `${latestComparison.rewardedLicenseDelta >= 0 ? '+' : ''}${latestComparison.rewardedLicenseDelta} vs previous day` : 'No prior day yet'}</p>
                  </div>
                  <div className="glass-subtle rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/30">Largest Single Move</p>
                      {latestComparison.topLicenseDriver ? (
                        <button
                          onClick={(event) => openLicenseHistory(event, latestComparison.topLicenseDriver.licenseId)}
                          className="text-[10px] text-accent-light hover:text-white"
                        >
                          History
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-white mt-1">
                      {latestComparison.topLicenseDriver ? latestComparison.topLicenseDriver.name : 'No standout'}
                    </p>
                    <p className="text-[10px] text-white/35 mt-1">
                      {latestComparison.topLicenseDriver
                        ? `${formatSignedUsd(latestComparison.topLicenseDriver.diffMicros)} · ${getEntryDeviceName(latestComparison.topLicenseDriver, latestComparison.topLicenseDriver.diffMicros >= 0 ? 'current' : 'previous') || 'Device not remembered yet'}`
                        : 'No standout license shift'}
                    </p>
                  </div>
                </div>

                {latestComparison.previousLabel ? (
                  <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Delta Check</p>
                        <p className="text-[11px] text-white/35 mt-1">These categories add up exactly to the net change.</p>
                      </div>
                      <span className={`text-sm font-semibold ${latestComparison.reconciliation.recomposedDeltaMicros >= 0 ? 'text-success' : 'text-warning'}`}>
                        {formatSignedUsd(latestComparison.reconciliation.recomposedDeltaMicros)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mt-4">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Exact Drops</p>
                        <p className="text-sm font-semibold text-warning mt-1">{formatSignedUsd(latestComparison.reconciliation.droppedMicros)}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Exact Gains</p>
                        <p className="text-sm font-semibold text-success mt-1">{formatSignedUsd(latestComparison.reconciliation.gainedMicros)}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Continuing Net</p>
                        <p className={`text-sm font-semibold mt-1 ${latestComparison.reconciliation.continuingDeltaMicros >= 0 ? 'text-success' : 'text-warning'}`}>
                          {formatSignedUsd(latestComparison.reconciliation.continuingDeltaMicros)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Net Delta</p>
                        <p className={`text-sm font-semibold mt-1 ${latestComparison.deltaMicros >= 0 ? 'text-success' : 'text-warning'}`}>
                          {formatSignedUsd(latestComparison.deltaMicros)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 space-y-2.5">
                  {latestComparison.reasons.map((reason) => (
                    <div key={reason.text} className={`rounded-xl border px-3 py-3 text-sm ${getReasonToneClass(reason.tone)}`}>
                      {reason.text}
                    </div>
                  ))}
                </div>

                {latestComparison.licenseDiffs.length > 0 ? (
                  <div className="mt-5 border-t border-white/[0.06] pt-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Exact Drivers</p>
                        <p className="text-[11px] text-white/35 mt-1">The licenses and devices that most directly moved this read.</p>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {latestComparison.licenseDiffs.slice(0, 4).map((entry) => (
                        <div key={`${latestComparison.dayKey}-${entry.licenseId}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{entry.name}</p>
                              <p className="text-[11px] text-white/35 mt-1 truncate">{getEntryDeviceName(entry, entry.diffMicros >= 0 ? 'current' : 'previous') || 'Device not remembered yet'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span className={`text-sm font-semibold ${entry.diffMicros >= 0 ? 'text-success' : 'text-warning'}`}>
                                {formatSignedUsd(entry.diffMicros)}
                              </span>
                              <button
                                onClick={(event) => openLicenseHistory(event, entry.licenseId)}
                                className="text-[10px] text-accent-light hover:text-white"
                              >
                                View History
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-white/35 mt-2">
                            {formatUnsignedUsd(entry.previousAmount)} yesterday {'->'} {formatUnsignedUsd(entry.currentAmount)} today
                            {formatDeviceShiftSuffix(entry)}
                          </p>
                          {entry.snapshotCauseDetail ? (
                            <p className="text-[11px] text-white/45 mt-1">Stored state: {entry.snapshotCauseDetail}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="glass p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Timeline</p>
                  <h2 className="text-lg font-semibold text-white mt-2">Daily Reward Drivers</h2>
                </div>
                <span className="text-[11px] text-white/35">Newest 10 days in view</span>
              </div>

              <div className="space-y-3">
                {recentComparisons.map((comparison) => {
                  const trendMeta = getTrendMeta(comparison.trend);

                  return (
                    <article key={comparison.dayKey} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-white">{comparison.label}</h3>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${trendMeta.badgeClass}`}>
                              {trendMeta.label}
                            </span>
                          </div>
                          <p className="text-sm text-white/45 mt-2 max-w-2xl">{comparison.summary}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className={`text-base font-semibold ${trendMeta.accentClass}`}>{comparison.previousLabel ? formatSignedUsd(comparison.deltaMicros) : '—'}</p>
                          <p className="text-[11px] text-white/35 mt-1">Total {formatUnsignedUsd(comparison.totalMicros)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                          {comparison.rewardedLicenseCount} rewarded licenses
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                          {comparison.allocationCount} allocations
                        </span>
                        {comparison.previousLabel ? (
                          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                            {comparison.rewardedLicenseDelta >= 0 ? '+' : ''}{comparison.rewardedLicenseDelta} rewarded vs previous day
                          </span>
                        ) : null}
                        {comparison.previousLabel ? (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${comparison.deltaMicros >= 0 ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'}`}>
                            Check {formatSignedUsd(comparison.reconciliation.recomposedDeltaMicros)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {comparison.reasons.map((reason) => (
                          <div key={reason.text} className={`rounded-xl border px-3 py-2.5 text-sm ${getReasonToneClass(reason.tone)}`}>
                            {reason.text}
                          </div>
                        ))}
                      </div>

                      {comparison.licenseDiffs.length > 0 ? (
                        <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-2">
                          {comparison.licenseDiffs.slice(0, 3).map((entry) => (
                            <div key={`${comparison.dayKey}-${entry.licenseId}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="text-[12px] font-medium text-white truncate">{entry.name}</p>
                                <p className="text-[10px] text-white/35 truncate">{getEntryDeviceName(entry, entry.diffMicros >= 0 ? 'current' : 'previous') || 'Device not remembered yet'}</p>
                                {entry.snapshotCauseDetail ? (
                                  <p className="text-[10px] text-white/45 truncate mt-1">{entry.snapshotCauseDetail}</p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <button
                                  onClick={(event) => openLicenseHistory(event, entry.licenseId)}
                                  className="text-[10px] text-accent-light hover:text-white"
                                >
                                  History
                                </button>
                                <span className={`text-[12px] font-semibold ${entry.diffMicros >= 0 ? 'text-success' : 'text-warning'}`}>
                                  {formatSignedUsd(entry.diffMicros)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="glass p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Biggest Swings</p>
              <div className="space-y-3 mt-4">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Largest Increase</p>
                  <p className="text-sm font-semibold text-white mt-1">{analysis.biggestIncrease ? analysis.biggestIncrease.label : 'No increase in range'}</p>
                  <p className="text-[11px] text-success mt-1">{analysis.biggestIncrease ? formatSignedUsd(analysis.biggestIncrease.deltaMicros) : '—'}</p>
                  <p className="text-[11px] text-white/35 mt-1">{analysis.biggestIncrease?.summary || 'Pick a broader range to compare more days.'}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Largest Drop</p>
                  <p className="text-sm font-semibold text-white mt-1">{analysis.biggestDrop ? analysis.biggestDrop.label : 'No drop in range'}</p>
                  <p className="text-[11px] text-warning mt-1">{analysis.biggestDrop ? formatSignedUsd(analysis.biggestDrop.deltaMicros) : '—'}</p>
                  <p className="text-[11px] text-white/35 mt-1">{analysis.biggestDrop?.summary || 'Pick a broader range to compare more days.'}</p>
                </div>
              </div>
            </section>

            <section className="glass p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Most Volatile Licenses</p>
              <p className="text-xs text-white/40 mt-2">These online licenses caused the most day-to-day movement in the current range.</p>
              <div className="space-y-2.5 mt-4">
                {analysis.topMovers.length ? analysis.topMovers.map((mover) => (
                  <div key={mover.licenseId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white truncate">{mover.name}</p>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={(event) => openLicenseHistory(event, mover.licenseId)}
                          className="text-[10px] text-accent-light hover:text-white"
                        >
                          History
                        </button>
                        <span className="text-[11px] font-medium text-accent-light">{formatUnsignedUsd(mover.totalSwingMicros)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/35 mt-1">{mover.deviceName || 'Device not remembered yet'}</p>
                    <p className="text-[11px] text-white/35 mt-1">{mover.changedDays} changed days · Largest single-day move {formatUnsignedUsd(mover.largestSingleDayMicros)}</p>
                  </div>
                )) : (
                  <p className="text-sm text-white/40">No repeat movers yet in this range.</p>
                )}
              </div>
            </section>

            <section className="glass p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Scope Note</p>
              <div className="space-y-3 mt-4 text-sm text-white/45">
                <p>This page now stores one license-state snapshot per day from live dashboard refreshes, alongside the reward archive and remembered device links.</p>
                <p>That means offline, below-min, unbound, rebound, and device-shift explanations can be shown from the day tracking started forward.</p>
                <p>Older days still fall back to payout-only evidence, and chain-side payout delays still are not directly stored.</p>
              </div>
            </section>
          </div>
        </div>
      )}
      </div>
    </>
  );
}