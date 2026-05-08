import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

const LABELS_STORAGE_KEY = 'unity_license_labels';
const LEGACY_LICENSES_KEY = 'unity_nodes_licenses';
const OPERATORS_STORAGE_KEY = 'unity_license_operators';
const PRESET_TAGS_STORAGE_KEY = 'unity_license_preset_tags';

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

export function readCustomDashboardData(userId) {
  return {
    labels: readLabels(userId),
    presetTags: readPresetTags(userId),
    operators: readOperators(userId),
  };
}

export function writeCustomDashboardData(userId, customData) {
  const normalized = {
    labels: normalizeLabels(customData?.labels),
    presetTags: normalizePresetTags(customData?.presetTags),
    operators: normalizeOperators(customData?.operators),
  };

  writeLabels(userId, normalized.labels);
  writePresetTags(userId, normalized.presetTags);
  writeOperators(userId, normalized.operators);

  return normalized;
}