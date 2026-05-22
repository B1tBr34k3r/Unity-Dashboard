import { LICENSE_TAG_PRESETS, getLicenseBackendName, normalizeDeviceAliasKey } from '../utils/licenseDisplay';

const LABELS_STORAGE_KEY = 'unity_license_labels';
const LEGACY_LICENSES_KEY = 'unity_nodes_licenses';
const OPERATORS_STORAGE_KEY = 'unity_license_operators';
const DEVICE_COMBINATIONS_STORAGE_KEY = 'unity_device_combinations';
const PRESET_TAGS_STORAGE_KEY = 'unity_license_preset_tags';
const CLONE_TAG_ORDER_STORAGE_KEY = 'unity_license_clone_tag_order';
const WORK_TAG_ORDER_STORAGE_KEY = 'unity_license_work_tag_order';
const DEVICE_HISTORY_STORAGE_KEY = 'unity_license_device_history';
const MAX_DEVICE_LINK_PERIODS = 8;
const DEVICE_LINK_NOISE_WINDOW_MS = 10 * 60 * 1000;

function getTimestampValue(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getScopedStorageKey(baseKey, userId) {
  return userId ? `${baseKey}:${userId}` : null;
}

function readJsonStorage(storageKey) {
  if (!storageKey) {
    return null;
  }

  try {
    const rawValue = localStorage.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(storageKey, value) {
  if (!storageKey) {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore browser storage failures and keep in-memory state alive.
  }
}

function removeStorageKey(storageKey) {
  if (!storageKey) {
    return;
  }

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore browser storage failures during cleanup.
  }
}

export function normalizeLabels(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue).reduce((accumulator, [licenseId, label]) => {
    const trimmedLabel = typeof label === 'string' ? label.trim() : '';

    if (licenseId && trimmedLabel) {
      accumulator[licenseId] = trimmedLabel;
    }

    return accumulator;
  }, {});
}

export function writeLabels(userId, labels) {
  writeJsonStorage(getScopedStorageKey(LABELS_STORAGE_KEY, userId), normalizeLabels(labels));
}

export function readLabels(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(LABELS_STORAGE_KEY, userId);
  const scopedValue = readJsonStorage(scopedKey);

  if (scopedValue) {
    return normalizeLabels(scopedValue);
  }

  const legacyScopedValue = readJsonStorage(LABELS_STORAGE_KEY);

  if (legacyScopedValue) {
    const migrated = normalizeLabels(legacyScopedValue);

    if (Object.keys(migrated).length > 0) {
      writeLabels(userId, migrated);
      removeStorageKey(LABELS_STORAGE_KEY);
      return migrated;
    }
  }

  const legacyLicenses = readJsonStorage(LEGACY_LICENSES_KEY);

  if (Array.isArray(legacyLicenses)) {
    const migrated = legacyLicenses.reduce((accumulator, item) => {
      const trimmedName = typeof item?.name === 'string' ? item.name.trim() : '';

      if (item?.id && trimmedName) {
        accumulator[item.id] = trimmedName;
      }

      return accumulator;
    }, {});

    if (Object.keys(migrated).length > 0) {
      writeLabels(userId, migrated);
      removeStorageKey(LEGACY_LICENSES_KEY);
      return migrated;
    }
  }

  return {};
}

export function clearLabels(userId) {
  removeStorageKey(getScopedStorageKey(LABELS_STORAGE_KEY, userId));
  removeStorageKey(LEGACY_LICENSES_KEY);
}

export function normalizeOperators(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue).reduce((accumulator, [licenseId, operatorName]) => {
    const trimmedName = typeof operatorName === 'string' ? operatorName.trim() : '';

    if (licenseId && trimmedName) {
      accumulator[licenseId] = trimmedName;
    }

    return accumulator;
  }, {});
}

export function writeOperators(userId, operators) {
  writeJsonStorage(getScopedStorageKey(OPERATORS_STORAGE_KEY, userId), normalizeOperators(operators));
}

export function readOperators(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(OPERATORS_STORAGE_KEY, userId);
  const scopedValue = readJsonStorage(scopedKey);

  if (scopedValue) {
    return normalizeOperators(scopedValue);
  }

  const legacyValue = readJsonStorage(OPERATORS_STORAGE_KEY);

  if (legacyValue) {
    const migrated = normalizeOperators(legacyValue);

    if (Object.keys(migrated).length > 0) {
      writeOperators(userId, migrated);
      removeStorageKey(OPERATORS_STORAGE_KEY);
      return migrated;
    }
  }

  return {};
}

export function clearOperators(userId) {
  removeStorageKey(getScopedStorageKey(OPERATORS_STORAGE_KEY, userId));
}

function normalizeDeviceCombinationName(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeDeviceCombinationEntry(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const label = normalizeDeviceCombinationName(rawValue.label || rawValue.name || rawValue.canonicalName);
  const aliasSource = Array.isArray(rawValue.aliases)
    ? rawValue.aliases
    : Array.isArray(rawValue.deviceNames)
      ? rawValue.deviceNames
      : Array.isArray(rawValue.devices)
        ? rawValue.devices
        : [];

  if (!label) {
    return null;
  }

  const aliases = [];
  const seen = new Set();

  const addAlias = (value) => {
    const alias = normalizeDeviceCombinationName(value);
    const aliasKey = normalizeDeviceAliasKey(alias);

    if (!alias || !aliasKey || seen.has(aliasKey)) {
      return;
    }

    seen.add(aliasKey);
    aliases.push(alias);
  };

  addAlias(label);
  aliasSource.forEach(addAlias);

  if (aliases.length < 2) {
    return null;
  }

  return { label, aliases };
}

export function normalizeDeviceCombinations(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const normalized = [];
  const usedAliasKeys = new Set();

  rawValue.forEach((entry) => {
    const normalizedEntry = normalizeDeviceCombinationEntry(entry);

    if (!normalizedEntry) {
      return;
    }

    const aliases = [];

    normalizedEntry.aliases.forEach((alias) => {
      const aliasKey = normalizeDeviceAliasKey(alias);

      if (!aliasKey || usedAliasKeys.has(aliasKey)) {
        return;
      }

      usedAliasKeys.add(aliasKey);
      aliases.push(alias);
    });

    if (aliases.length < 2 || normalizeDeviceAliasKey(normalizedEntry.label) !== normalizeDeviceAliasKey(aliases[0])) {
      return;
    }

    normalized.push({
      label: normalizedEntry.label,
      aliases,
    });
  });

  return normalized;
}

export function writeDeviceCombinations(userId, deviceCombinations) {
  writeJsonStorage(getScopedStorageKey(DEVICE_COMBINATIONS_STORAGE_KEY, userId), normalizeDeviceCombinations(deviceCombinations));
}

export function readDeviceCombinations(userId) {
  if (!userId) {
    return [];
  }

  const scopedValue = readJsonStorage(getScopedStorageKey(DEVICE_COMBINATIONS_STORAGE_KEY, userId));
  return normalizeDeviceCombinations(scopedValue);
}

export function clearDeviceCombinations(userId) {
  removeStorageKey(getScopedStorageKey(DEVICE_COMBINATIONS_STORAGE_KEY, userId));
}

export function normalizePresetTag(tag) {
  const trimmedTag = tag ? tag.trim() : '';

  if (!trimmedTag) {
    return '';
  }

  return LICENSE_TAG_PRESETS.find(
    (preset) => preset.toLowerCase() === trimmedTag.toLowerCase()
  ) || '';
}

export function normalizePresetTags(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue).reduce((accumulator, [licenseId, tag]) => {
    const normalizedTag = normalizePresetTag(tag);

    if (licenseId && normalizedTag) {
      accumulator[licenseId] = normalizedTag;
    }

    return accumulator;
  }, {});
}

function getPresetTaggedLicenseIds(presetTags, targetTag) {
  const normalizedTargetTag = typeof targetTag === 'string' ? targetTag.toLowerCase() : '';

  return Object.entries(presetTags || {}).reduce((taggedIds, [licenseId, tag]) => {
    if (tag && tag.toLowerCase() === normalizedTargetTag) {
      taggedIds.push(licenseId);
    }

    return taggedIds;
  }, []);
}

function normalizePresetTagOrder(rawValue, presetTags, targetTag) {
  const taggedLicenseIds = getPresetTaggedLicenseIds(presetTags, targetTag);
  const validTaggedIds = new Set(taggedLicenseIds);
  const normalizedOrder = [];
  const seen = new Set();

  const addLicenseId = (licenseId) => {
    const normalizedId = typeof licenseId === 'string' ? licenseId.trim() : String(licenseId || '').trim();

    if (!normalizedId || seen.has(normalizedId) || !validTaggedIds.has(normalizedId)) {
      return;
    }

    seen.add(normalizedId);
    normalizedOrder.push(normalizedId);
  };

  if (Array.isArray(rawValue)) {
    rawValue.forEach(addLicenseId);
  }

  taggedLicenseIds.forEach(addLicenseId);

  return normalizedOrder;
}

export function normalizeCloneTagOrder(rawValue, presetTags) {
  return normalizePresetTagOrder(rawValue, presetTags, 'clone');
}

export function normalizeWorkTagOrder(rawValue, presetTags) {
  return normalizePresetTagOrder(rawValue, presetTags, 'work');
}

export function writePresetTags(userId, presetTags) {
  writeJsonStorage(getScopedStorageKey(PRESET_TAGS_STORAGE_KEY, userId), normalizePresetTags(presetTags));
}

export function readPresetTags(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(PRESET_TAGS_STORAGE_KEY, userId);
  const scopedValue = readJsonStorage(scopedKey);

  if (scopedValue) {
    return normalizePresetTags(scopedValue);
  }

  const legacyValue = readJsonStorage(PRESET_TAGS_STORAGE_KEY);

  if (legacyValue) {
    const migrated = normalizePresetTags(legacyValue);

    if (Object.keys(migrated).length > 0) {
      writePresetTags(userId, migrated);
      removeStorageKey(PRESET_TAGS_STORAGE_KEY);
      return migrated;
    }
  }

  return {};
}

export function clearPresetTags(userId) {
  removeStorageKey(getScopedStorageKey(PRESET_TAGS_STORAGE_KEY, userId));
}

function writePresetTagOrder(userId, tagOrder, presetTags, storageKey, normalizeTagOrder) {
  writeJsonStorage(
    getScopedStorageKey(storageKey, userId),
    normalizeTagOrder(tagOrder, presetTags)
  );
}

function readPresetTagOrder(userId, presetTags, storageKey, normalizeTagOrder) {
  const fallbackOrder = normalizeTagOrder([], presetTags);

  if (!userId) {
    return fallbackOrder;
  }

  const scopedKey = getScopedStorageKey(storageKey, userId);
  const scopedValue = readJsonStorage(scopedKey);

  if (scopedValue) {
    return normalizeTagOrder(scopedValue, presetTags);
  }

  const legacyValue = readJsonStorage(storageKey);

  if (legacyValue) {
    const migrated = normalizeTagOrder(legacyValue, presetTags);

    writePresetTagOrder(userId, migrated, presetTags, storageKey, normalizeTagOrder);
    removeStorageKey(storageKey);
    return migrated;
  }

  return fallbackOrder;
}

export function writeCloneTagOrder(userId, cloneTagOrder, presetTags) {
  writePresetTagOrder(userId, cloneTagOrder, presetTags, CLONE_TAG_ORDER_STORAGE_KEY, normalizeCloneTagOrder);
}

export function readCloneTagOrder(userId, presetTags) {
  return readPresetTagOrder(userId, presetTags, CLONE_TAG_ORDER_STORAGE_KEY, normalizeCloneTagOrder);
}

export function clearCloneTagOrder(userId) {
  removeStorageKey(getScopedStorageKey(CLONE_TAG_ORDER_STORAGE_KEY, userId));
}

export function writeWorkTagOrder(userId, workTagOrder, presetTags) {
  writePresetTagOrder(userId, workTagOrder, presetTags, WORK_TAG_ORDER_STORAGE_KEY, normalizeWorkTagOrder);
}

export function readWorkTagOrder(userId, presetTags) {
  return readPresetTagOrder(userId, presetTags, WORK_TAG_ORDER_STORAGE_KEY, normalizeWorkTagOrder);
}

export function clearWorkTagOrder(userId) {
  removeStorageKey(getScopedStorageKey(WORK_TAG_ORDER_STORAGE_KEY, userId));
}

function normalizeTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeDeviceIdentifier(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeDeviceLinkPeriod(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const deviceId = normalizeDeviceIdentifier(rawValue.deviceId);
  const deviceName = normalizeDeviceIdentifier(rawValue.deviceName);
  const linkedAt = normalizeTimestamp(rawValue.linkedAt);

  if (!linkedAt || (!deviceId && !deviceName)) {
    return null;
  }

  const rawUnlinkedAt = normalizeTimestamp(rawValue.unlinkedAt);
  const current = Boolean(rawValue.current) && !rawUnlinkedAt;
  const unlinkedAt = current
    ? null
    : rawUnlinkedAt && rawUnlinkedAt >= linkedAt
      ? rawUnlinkedAt
      : linkedAt;

  return {
    deviceId,
    deviceName,
    linkedAt,
    unlinkedAt,
    current,
  };
}

function normalizeDeviceLinkPeriods(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const periods = rawValue
    .map(normalizeDeviceLinkPeriod)
    .filter(Boolean)
    .sort((left, right) => left.linkedAt.localeCompare(right.linkedAt));

  let lastCurrentIndex = -1;
  periods.forEach((period, index) => {
    if (period.current) {
      lastCurrentIndex = index;
    }
  });

  const normalizedPeriods = periods.map((period, index) => {
    if (index === lastCurrentIndex) {
      return {
        ...period,
        current: true,
        unlinkedAt: null,
      };
    }

    return {
      ...period,
      current: false,
      unlinkedAt: period.unlinkedAt || period.linkedAt,
    };
  });

  const collapsedPeriods = normalizedPeriods.reduce((accumulator, period) => {
    const previousPeriod = accumulator[accumulator.length - 1];

    if (!previousPeriod) {
      accumulator.push(period);
      return accumulator;
    }

    const sameDevice = sameDevicePeriod(previousPeriod, period.deviceId, period.deviceName);

    if (sameDevice) {
      const previousUnlinkedAt = previousPeriod.current ? null : previousPeriod.unlinkedAt || previousPeriod.linkedAt;
      const nextUnlinkedAt = period.current ? null : period.unlinkedAt || period.linkedAt;
      const previousStartTime = getTimestampValue(previousPeriod.linkedAt);
      const previousEndTime = getTimestampValue(previousUnlinkedAt || previousPeriod.linkedAt);
      const nextStartTime = getTimestampValue(period.linkedAt);
      const nextEndTime = getTimestampValue(nextUnlinkedAt || period.linkedAt);
      const previousDurationMs = previousStartTime !== null && previousEndTime !== null
        ? Math.max(0, previousEndTime - previousStartTime)
        : Number.POSITIVE_INFINITY;
      const nextDurationMs = nextStartTime !== null && nextEndTime !== null
        ? Math.max(0, nextEndTime - nextStartTime)
        : Number.POSITIVE_INFINITY;
      const gapMs = previousEndTime !== null && nextStartTime !== null
        ? Math.abs(nextStartTime - previousEndTime)
        : Number.POSITIVE_INFINITY;
      const looksLikeNoise = (
        previousDurationMs <= DEVICE_LINK_NOISE_WINDOW_MS
        || nextDurationMs <= DEVICE_LINK_NOISE_WINDOW_MS
        || gapMs <= DEVICE_LINK_NOISE_WINDOW_MS
      );

      if (looksLikeNoise) {
        const mergedCurrent = Boolean(previousPeriod.current || period.current);
        accumulator[accumulator.length - 1] = {
          ...previousPeriod,
          linkedAt: previousPeriod.linkedAt <= period.linkedAt ? previousPeriod.linkedAt : period.linkedAt,
          unlinkedAt: mergedCurrent ? null : (nextUnlinkedAt || previousUnlinkedAt || previousPeriod.linkedAt),
          current: mergedCurrent,
        };
        return accumulator;
      }
    }

    accumulator.push(period);
    return accumulator;
  }, []);

  return collapsedPeriods.slice(-MAX_DEVICE_LINK_PERIODS);
}

function normalizeLicenseDeviceHistoryRecord(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const links = normalizeDeviceLinkPeriods(rawValue.links);

  if (!links.length) {
    return null;
  }

  return {
    links,
    lastChangedAt: normalizeTimestamp(rawValue.lastChangedAt) || links[links.length - 1].linkedAt,
    pendingUnboundObservedAt: normalizeTimestamp(rawValue.pendingUnboundObservedAt),
  };
}

export function normalizeLicenseDeviceHistory(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue).reduce((accumulator, [licenseId, record]) => {
    const normalizedLicenseId = normalizeDeviceIdentifier(licenseId);
    const normalizedRecord = normalizeLicenseDeviceHistoryRecord(record);

    if (normalizedLicenseId && normalizedRecord) {
      accumulator[normalizedLicenseId] = normalizedRecord;
    }

    return accumulator;
  }, {});
}

export function readLicenseDeviceHistory(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(DEVICE_HISTORY_STORAGE_KEY, userId);
  const scopedValue = readJsonStorage(scopedKey);

  if (scopedValue) {
    return normalizeLicenseDeviceHistory(scopedValue);
  }

  const legacyValue = readJsonStorage(DEVICE_HISTORY_STORAGE_KEY);

  if (legacyValue) {
    const migrated = normalizeLicenseDeviceHistory(legacyValue);

    if (Object.keys(migrated).length > 0) {
      writeJsonStorage(scopedKey, migrated);
      removeStorageKey(DEVICE_HISTORY_STORAGE_KEY);
      return migrated;
    }
  }

  return {};
}

export function writeLicenseDeviceHistory(userId, deviceHistory) {
  const normalized = normalizeLicenseDeviceHistory(deviceHistory);
  writeJsonStorage(getScopedStorageKey(DEVICE_HISTORY_STORAGE_KEY, userId), normalized);
  return normalized;
}

export function clearLicenseDeviceHistory(userId) {
  removeStorageKey(getScopedStorageKey(DEVICE_HISTORY_STORAGE_KEY, userId));
  removeStorageKey(DEVICE_HISTORY_STORAGE_KEY);
}

function sameDevicePeriod(period, deviceId, deviceName) {
  if (!period) {
    return false;
  }

  if (deviceId && period.deviceId) {
    return period.deviceId === deviceId;
  }

  return Boolean(deviceName) && period.deviceName === deviceName;
}

export function trackLicenseDeviceHistory(userId, licenses, observedAt = new Date().toISOString()) {
  if (!userId) {
    return { deviceHistory: {}, changed: false };
  }

  const normalizedObservedAt = normalizeTimestamp(observedAt) || new Date().toISOString();
  const currentHistory = readLicenseDeviceHistory(userId);
  const nextHistory = { ...currentHistory };
  let changed = false;

  (licenses || []).forEach((license) => {
    const licenseId = normalizeDeviceIdentifier(license?.id);

    if (!licenseId) {
      return;
    }

    const deviceId = normalizeDeviceIdentifier(license?.deviceId);
    const deviceName = normalizeDeviceIdentifier(getLicenseBackendName(license));
    const hasBoundDevice = Boolean(deviceId || deviceName);
    const record = currentHistory[licenseId] || { links: [], lastChangedAt: null, pendingUnboundObservedAt: null };
    const links = normalizeDeviceLinkPeriods(record.links).map((period) => ({ ...period }));
    const currentPeriodIndex = links.findIndex((period) => period.current);
    const lastLink = links[links.length - 1] || null;
    const pendingUnboundObservedAt = normalizeTimestamp(record.pendingUnboundObservedAt);

    if (!hasBoundDevice) {
      if (currentPeriodIndex === -1) {
        return;
      }

      if (!pendingUnboundObservedAt) {
        nextHistory[licenseId] = {
          links: normalizeDeviceLinkPeriods(links),
          lastChangedAt: record.lastChangedAt || lastLink?.linkedAt || null,
          pendingUnboundObservedAt: normalizedObservedAt,
        };
        changed = true;
        return;
      }

      links[currentPeriodIndex] = {
        ...links[currentPeriodIndex],
        current: false,
        unlinkedAt: pendingUnboundObservedAt,
      };

      nextHistory[licenseId] = {
        links: normalizeDeviceLinkPeriods(links),
        lastChangedAt: pendingUnboundObservedAt,
        pendingUnboundObservedAt: null,
      };
      changed = true;
      return;
    }

    if (currentPeriodIndex !== -1 && sameDevicePeriod(links[currentPeriodIndex], deviceId, deviceName)) {
      if (!pendingUnboundObservedAt) {
        return;
      }

      nextHistory[licenseId] = {
        links: normalizeDeviceLinkPeriods(links),
        lastChangedAt: record.lastChangedAt || lastLink?.linkedAt || null,
        pendingUnboundObservedAt: null,
      };
      changed = true;
      return;
    }

    if (currentPeriodIndex === -1 && lastLink && sameDevicePeriod(lastLink, deviceId, deviceName)) {
      links[links.length - 1] = {
        ...lastLink,
        current: true,
        unlinkedAt: null,
      };

      nextHistory[licenseId] = {
        links: normalizeDeviceLinkPeriods(links),
        lastChangedAt: record.lastChangedAt || normalizedObservedAt,
        pendingUnboundObservedAt: null,
      };
      changed = true;
      return;
    }

    if (currentPeriodIndex !== -1) {
      links[currentPeriodIndex] = {
        ...links[currentPeriodIndex],
        current: false,
        unlinkedAt: pendingUnboundObservedAt || normalizedObservedAt,
      };
    }

    links.push({
      deviceId,
      deviceName,
      linkedAt: normalizedObservedAt,
      unlinkedAt: null,
      current: true,
    });

    nextHistory[licenseId] = {
      links: normalizeDeviceLinkPeriods(links),
      lastChangedAt: normalizedObservedAt,
      pendingUnboundObservedAt: null,
    };
    changed = true;
  });

  if (!changed) {
    return { deviceHistory: currentHistory, changed: false };
  }

  return {
    deviceHistory: writeLicenseDeviceHistory(userId, nextHistory),
    changed: true,
  };
}
