import { getRewardDayKey } from '../utils/formatters';
import { getLicenseBackendName } from '../utils/licenseDisplay';

const SNAPSHOT_KEY_PREFIX = 'unity_license_snapshot_history_v1:';
const META_KEY_PREFIX = 'unity_license_snapshot_meta_v1:';

export const MAX_LICENSE_SNAPSHOT_DAYS = 400;

function getStorageKeys(userId) {
  const normalizedUserId = String(userId || '').trim();

  if (!normalizedUserId) {
    return null;
  }

  return {
    snapshotsKey: `${SNAPSHOT_KEY_PREFIX}${normalizedUserId}`,
    metaKey: `${META_KEY_PREFIX}${normalizedUserId}`,
  };
}

function normalizeTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeIdentifier(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeFiniteNumber(value, digits = 2) {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue)) {
    return null;
  }

  return Number(nextValue.toFixed(digits));
}

function readJsonStorage(storageKey) {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(storageKey, value) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore local storage failures and keep in-memory snapshots usable.
  }
}

function removeStorageKey(storageKey) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore local storage cleanup failures.
  }
}

function compactLicenseSnapshot(license) {
  const licenseId = normalizeIdentifier(license?.id);

  if (!licenseId) {
    return null;
  }

  const deviceId = normalizeIdentifier(license?.deviceId);
  const deviceName = normalizeIdentifier(getLicenseBackendName(license));
  const uptimePercentage = typeof license?.uptime === 'number'
    ? normalizeFiniteNumber(license.uptime * 100)
    : null;
  const minUptimePercentage = typeof license?.leaseMinUptimePercentage === 'number'
    ? normalizeFiniteNumber(license.leaseMinUptimePercentage)
    : null;

  return {
    licenseId,
    deviceId,
    deviceName,
    hasBoundDevice: Boolean(deviceId || deviceName),
    isOnline: Boolean(license?.isOnline),
    uptimePercentage,
    minUptimePercentage,
  };
}

function normalizeSnapshotDayKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const normalizedTimestamp = normalizeTimestamp(value);
  return normalizedTimestamp ? getRewardDayKey(normalizedTimestamp) : null;
}

function normalizeSnapshotLicenseMap(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue)
    .map(([, license]) => compactLicenseSnapshot(license))
    .filter(Boolean)
    .sort((left, right) => left.licenseId.localeCompare(right.licenseId))
    .reduce((accumulator, snapshot) => {
      accumulator[snapshot.licenseId] = snapshot;
      return accumulator;
    }, {});
}

function normalizeSnapshotDay(dayKey, rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const normalizedDayKey = normalizeSnapshotDayKey(dayKey || rawValue.dayKey);
  const capturedAt = normalizeTimestamp(rawValue.capturedAt);
  const licenses = normalizeSnapshotLicenseMap(rawValue.licenses);

  if (!normalizedDayKey || !capturedAt) {
    return null;
  }

  return {
    dayKey: normalizedDayKey,
    capturedAt,
    licenses,
  };
}

export function normalizeLicenseSnapshotDays(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  const normalizedEntries = Object.entries(rawValue)
    .map(([dayKey, snapshot]) => normalizeSnapshotDay(dayKey, snapshot))
    .filter(Boolean)
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
    .slice(-MAX_LICENSE_SNAPSHOT_DAYS);

  return normalizedEntries.reduce((accumulator, snapshot) => {
    accumulator[snapshot.dayKey] = snapshot;
    return accumulator;
  }, {});
}

export function buildLicenseSnapshotMeta(snapshotDays, overrides = {}) {
  const dayKeys = Object.keys(normalizeLicenseSnapshotDays(snapshotDays)).sort((left, right) => left.localeCompare(right));
  const now = new Date().toISOString();

  return {
    snapshotDayCount: dayKeys.length,
    oldestDayKey: dayKeys[0] || null,
    newestDayKey: dayKeys[dayKeys.length - 1] || null,
    lastUpdatedAt: overrides.lastUpdatedAt || now,
    ...overrides,
  };
}

export function readLicenseSnapshotHistory(userId) {
  const storageKeys = getStorageKeys(userId);

  if (!storageKeys) {
    return { days: {}, meta: null };
  }

  const days = normalizeLicenseSnapshotDays(readJsonStorage(storageKeys.snapshotsKey));
  const rawMeta = readJsonStorage(storageKeys.metaKey);
  const meta = Object.keys(days).length || rawMeta
    ? buildLicenseSnapshotMeta(days, rawMeta || {})
    : null;

  return { days, meta };
}

export function writeLicenseSnapshotHistory(userId, snapshotDays, metaOverrides = {}) {
  const storageKeys = getStorageKeys(userId);
  const days = normalizeLicenseSnapshotDays(snapshotDays);
  const meta = buildLicenseSnapshotMeta(days, metaOverrides);

  if (storageKeys) {
    writeJsonStorage(storageKeys.snapshotsKey, days);
    writeJsonStorage(storageKeys.metaKey, meta);
  }

  return { days, meta };
}

export function clearLicenseSnapshotHistory(userId) {
  const storageKeys = getStorageKeys(userId);

  if (!storageKeys) {
    return;
  }

  removeStorageKey(storageKeys.snapshotsKey);
  removeStorageKey(storageKeys.metaKey);
}

function buildDailySnapshot(licenses, capturedAt) {
  const normalizedCapturedAt = normalizeTimestamp(capturedAt) || new Date().toISOString();
  const dayKey = getRewardDayKey(normalizedCapturedAt);

  return {
    dayKey,
    capturedAt: normalizedCapturedAt,
    licenses: normalizeSnapshotLicenseMap(
      (licenses || []).reduce((accumulator, license) => {
        const compact = compactLicenseSnapshot(license);

        if (compact) {
          accumulator[compact.licenseId] = compact;
        }

        return accumulator;
      }, {})
    ),
  };
}

function snapshotDaysEqual(leftSnapshot, rightSnapshot) {
  if (!leftSnapshot || !rightSnapshot) {
    return false;
  }

  return JSON.stringify(leftSnapshot.licenses) === JSON.stringify(rightSnapshot.licenses);
}

export function writeDailyLicenseSnapshot(userId, licenses, capturedAt = new Date().toISOString()) {
  if (!userId) {
    return { days: {}, meta: null, changed: false };
  }

  const currentHistory = readLicenseSnapshotHistory(userId);
  const nextSnapshot = buildDailySnapshot(licenses, capturedAt);
  const existingSnapshot = currentHistory.days[nextSnapshot.dayKey] || null;

  if (existingSnapshot && snapshotDaysEqual(existingSnapshot, nextSnapshot)) {
    return {
      days: currentHistory.days,
      meta: currentHistory.meta,
      changed: false,
      snapshot: existingSnapshot,
    };
  }

  const { days, meta } = writeLicenseSnapshotHistory(userId, {
    ...currentHistory.days,
    [nextSnapshot.dayKey]: nextSnapshot,
  });

  return {
    days,
    meta,
    changed: true,
    snapshot: days[nextSnapshot.dayKey],
  };
}

export function getLicenseSnapshotStatus(snapshot) {
  if (!snapshot?.hasBoundDevice) {
    return 'unbound';
  }

  if (
    typeof snapshot.uptimePercentage === 'number'
    && typeof snapshot.minUptimePercentage === 'number'
    && snapshot.uptimePercentage < snapshot.minUptimePercentage
  ) {
    return 'below-min';
  }

  return snapshot.isOnline ? 'online' : 'offline';
}