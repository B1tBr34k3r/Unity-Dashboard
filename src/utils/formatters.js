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

export function aggregateByRewardMonth(allocations) {
  const map = {};

  for (const allocation of allocations || []) {
    const key = getRewardMonthKey(allocation.completedAt);

    if (!map[key]) {
      map[key] = {
        key,
        label: formatRewardMonthLabel(key),
        totalMicros: 0,
        count: 0,
      };
    }

    map[key].totalMicros += allocation.amountMicros;
    map[key].count += 1;
  }

  return Object.values(map).sort((left, right) => left.key.localeCompare(right.key));
}

export function addDaysToRewardDayKey(dayKey, amount) {
  const nextDate = getUtcDateFromRewardDayKey(dayKey);
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate.toISOString().slice(0, 10);
}

