import { mergeRewardAllocations } from './rewardHistory';

const ACCOUNT_OVERVIEW_CACHE_KEY_PREFIX = 'unity_account_overview_cache_v1:';

function getStorageKey(userId) {
  const normalizedUserId = String(userId || '').trim();

  return normalizedUserId ? `${ACCOUNT_OVERVIEW_CACHE_KEY_PREFIX}${normalizedUserId}` : null;
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeBalance(value) {
  const nextValue = Number(value);

  return Number.isFinite(nextValue) ? Math.round(nextValue) : null;
}

function normalizeLicenseList(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue.filter((license) => license && typeof license === 'object' && !Array.isArray(license) && license.id !== undefined && license.id !== null);
}

function normalizeSummaryList(rawValue) {
  const summaryItems = Array.isArray(rawValue)
    ? rawValue
    : rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? [rawValue]
      : [];

  return summaryItems.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

function normalizeAccountOverview(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  return {
    balance: normalizeBalance(rawValue.balance),
    licenses: normalizeLicenseList(rawValue.licenses),
    summary: normalizeSummaryList(rawValue.summary),
    recentAllocations: mergeRewardAllocations(rawValue.recentAllocations || []),
    fetchedAt: normalizeTimestamp(rawValue.fetchedAt),
  };
}

export function readAccountOverviewCache(userId) {
  const storageKey = getStorageKey(userId);

  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    return rawValue ? normalizeAccountOverview(JSON.parse(rawValue)) : null;
  } catch {
    return null;
  }
}

export function writeAccountOverviewCache(userId, overview) {
  const storageKey = getStorageKey(userId);
  const normalizedOverview = normalizeAccountOverview({
    ...overview,
    fetchedAt: overview?.fetchedAt || new Date().toISOString(),
  });

  if (!storageKey || !normalizedOverview || typeof window === 'undefined') {
    return normalizedOverview;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizedOverview));
  } catch {
    // Ignore browser storage write failures and keep the in-memory dashboard usable.
  }

  return normalizedOverview;
}

export function clearAccountOverviewCache(userId) {
  const storageKey = getStorageKey(userId);

  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore browser storage cleanup failures.
  }
}