const HISTORY_KEY_PREFIX = 'unity_reward_history_allocations_v1:';
const META_KEY_PREFIX = 'unity_reward_history_meta_v1:';

export const REWARD_HISTORY_PAGE_SIZE = 250;
export const MAX_REWARD_HISTORY_PAGES = 60;
export const REWARD_HISTORY_BACKFILL_RETRY_MS = 12 * 60 * 60 * 1000;

function getStorageKeys(userId) {
  const normalizedUserId = String(userId || '').trim();

  if (!normalizedUserId) {
    return null;
  }

  return {
    allocationsKey: `${HISTORY_KEY_PREFIX}${normalizedUserId}`,
    metaKey: `${META_KEY_PREFIX}${normalizedUserId}`,
  };
}

function normalizeCompletedAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function compactRewardAllocation(allocation) {
  if (!allocation?.id || !allocation?.licenseId) {
    return null;
  }

  const completedAt = normalizeCompletedAt(allocation.completedAt);
  const amountMicros = Number(allocation.amountMicros);

  if (!completedAt || !Number.isFinite(amountMicros)) {
    return null;
  }

  return {
    id: String(allocation.id),
    licenseId: String(allocation.licenseId),
    amountMicros: Math.round(amountMicros),
    completedAt,
  };
}

export function mergeRewardAllocations(...sources) {
  const allocationMap = new Map();

  sources.flat().forEach((allocation) => {
    const compact = compactRewardAllocation(allocation);

    if (compact) {
      allocationMap.set(compact.id, compact);
    }
  });

  return Array.from(allocationMap.values()).sort((left, right) => {
    const leftTime = new Date(left.completedAt).getTime();
    const rightTime = new Date(right.completedAt).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

export function buildRewardHistoryMeta(allocations, overrides = {}) {
  const mergedAllocations = mergeRewardAllocations(allocations);
  const now = new Date().toISOString();

  return {
    backfillStatus: 'pending',
    backfillComplete: false,
    paginationSupported: null,
    backfillPagesFetched: 0,
    lastBackfillAttemptAt: null,
    lastBackfillAt: null,
    ...overrides,
    allocationCount: mergedAllocations.length,
    oldestCompletedAt: mergedAllocations[0]?.completedAt || null,
    newestCompletedAt: mergedAllocations[mergedAllocations.length - 1]?.completedAt || null,
    lastUpdatedAt: overrides.lastUpdatedAt || now,
  };
}

export function readRewardHistory(userId) {
  const storageKeys = getStorageKeys(userId);

  if (!storageKeys || typeof window === 'undefined') {
    return { allocations: [], meta: null };
  }

  try {
    const rawAllocations = window.localStorage.getItem(storageKeys.allocationsKey);
    const parsedAllocations = rawAllocations ? JSON.parse(rawAllocations) : [];
    const allocations = mergeRewardAllocations(parsedAllocations);

    const rawMeta = window.localStorage.getItem(storageKeys.metaKey);
    const parsedMeta = rawMeta ? JSON.parse(rawMeta) : null;
    const meta = allocations.length || parsedMeta
      ? buildRewardHistoryMeta(allocations, parsedMeta || {})
      : null;

    return { allocations, meta };
  } catch {
    return { allocations: [], meta: null };
  }
}

export function writeRewardHistory(userId, allocations, metaOverrides = {}) {
  const storageKeys = getStorageKeys(userId);
  const mergedAllocations = mergeRewardAllocations(allocations);
  const meta = buildRewardHistoryMeta(mergedAllocations, metaOverrides);

  if (!storageKeys || typeof window === 'undefined') {
    return { allocations: mergedAllocations, meta };
  }

  try {
    window.localStorage.setItem(storageKeys.allocationsKey, JSON.stringify(mergedAllocations));
    window.localStorage.setItem(storageKeys.metaKey, JSON.stringify(meta));
  } catch {
    // Ignore local storage capacity/write failures and keep in-memory history usable.
  }

  return { allocations: mergedAllocations, meta };
}

export function clearRewardHistory(userId) {
  const storageKeys = getStorageKeys(userId);

  if (!storageKeys || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKeys.allocationsKey);
    window.localStorage.removeItem(storageKeys.metaKey);
  } catch {
    // Ignore local storage failures.
  }
}

export function shouldAttemptRewardBackfill(meta) {
  if (!meta) {
    return true;
  }

  if (meta.backfillComplete) {
    return false;
  }

  const lastAttempt = meta.lastBackfillAttemptAt ? Date.parse(meta.lastBackfillAttemptAt) : Number.NaN;

  if (!Number.isNaN(lastAttempt)) {
    const msSinceAttempt = Date.now() - lastAttempt;

    if (msSinceAttempt < REWARD_HISTORY_BACKFILL_RETRY_MS && meta.backfillStatus && meta.backfillStatus !== 'pending') {
      return false;
    }
  }

  return true;
}