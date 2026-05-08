export function formatReward(value) {
  return Number(value).toFixed(2);
}

/** Convert micros to USD string with 2 decimal places */
export function microsToUsd(val) {
  return (val / 1_000_000).toFixed(2);
}

/** Convert micros to string with 4 decimal places (for per-license detail) */
export function microsDetailed(val) {
  return (val / 1_000_000).toFixed(4);
}

/** Format number as $X,XXX.XX */
export function formatUsd(val) {
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Truncate hex address for display */
export function truncateHex(hex, startLen = 6, endLen = 4) {
  if (!hex || hex.length < 16) return hex;
  return `${hex.slice(0, startLen)}...${hex.slice(-endLen)}`;
}

/** Format date as "DD MMM YYYY" */
export function formatDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getRewardDayKey(dateValue) {
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
    return dateValue.slice(0, 10);
  }

  return new Date(dateValue).toISOString().slice(0, 10);
}

export function getRewardMonthKey(dateValue) {
  return getRewardDayKey(dateValue).slice(0, 7);
}

function getUtcDateFromRewardDayKey(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatRewardDayLabel(dateValue, includeYear = false) {
  const dayKey = typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : getRewardDayKey(dateValue);

  return getUtcDateFromRewardDayKey(dayKey).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

export function formatRewardMonthLabel(dateValue) {
  const monthKey = typeof dateValue === 'string' && /^\d{4}-\d{2}$/.test(dateValue) ? dateValue : getRewardMonthKey(dateValue);
  const [year, month] = monthKey.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  });
}

export function addDaysToRewardDayKey(dayKey, amount) {
  const nextDate = getUtcDateFromRewardDayKey(dayKey);
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate.toISOString().slice(0, 10);
}

function formatCycleRange(startDate, endDate) {
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();

  if (sameYear) {
    return `${startDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  return `${startDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function getCycleInfo(isoDateStr) {
  const [rawYear, rawMonth, rawDay] = getRewardDayKey(isoDateStr).split('-').map(Number);
  let year = rawYear;
  let month = rawMonth - 1;

  if (rawDay < 5) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }

  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const cycleStart = new Date(Date.UTC(year, month, 5));
  const cycleEnd = new Date(Date.UTC(year, month + 1, 4));

  return {
    key,
    label: formatRewardMonthLabel(key),
    rangeLabel: formatCycleRange(cycleStart, cycleEnd),
    year,
    month,
  };
}

export function aggregateByCycle(allocations) {
  const map = {};
  for (const a of allocations) {
    const info = getCycleInfo(a.completedAt);
    if (!map[info.key]) {
      map[info.key] = { key: info.key, label: info.label, rangeLabel: info.rangeLabel, totalMicros: 0, count: 0 };
    }
    map[info.key].totalMicros += a.amountMicros;
    map[info.key].count += 1;
  }
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
}

