import { useState, useCallback, useEffect } from 'react';
import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

const STORAGE_KEY = 'unity_license_preset_tags';

function getScopedStorageKey(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : null;
}

function persistPresetTags(userId, presetTags) {
  const storageKey = getScopedStorageKey(userId);

  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(presetTags));
}

function readPresetTags(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(userId);

  try {
    const raw = scopedKey ? localStorage.getItem(scopedKey) : null;
    if (raw) {
      return JSON.parse(raw) || {};
    }
  } catch {
    return {};
  }

  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const migrated = JSON.parse(legacyRaw) || {};

      if (migrated && typeof migrated === 'object' && !Array.isArray(migrated) && Object.keys(migrated).length > 0) {
        persistPresetTags(userId, migrated);
        localStorage.removeItem(STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    return {};
  }

  return {};
}

function normalizePresetTag(tag) {
  const trimmedTag = tag ? tag.trim() : '';
  if (!trimmedTag) return '';

  return LICENSE_TAG_PRESETS.find(
    (preset) => preset.toLowerCase() === trimmedTag.toLowerCase()
  ) || '';
}

export function useLicensePresetTags(userId) {
  const [presetTags, setPresetTags] = useState(() => readPresetTags(userId));

  useEffect(() => {
    setPresetTags(readPresetTags(userId));
  }, [userId]);

  const setPresetTag = useCallback((licenseId, tag) => {
    const normalizedTag = normalizePresetTag(tag);

    setPresetTags((prev) => {
      const next = { ...prev };
      if (normalizedTag) {
        next[licenseId] = normalizedTag;
      } else {
        delete next[licenseId];
      }
      persistPresetTags(userId, next);
      return next;
    });
  }, [userId]);

  const replacePresetTags = useCallback((nextPresetTags) => {
    const normalized = Object.entries(nextPresetTags || {}).reduce((accumulator, [licenseId, tag]) => {
      const normalizedTag = normalizePresetTag(tag);

      if (licenseId && normalizedTag) {
        accumulator[licenseId] = normalizedTag;
      }

      return accumulator;
    }, {});

    persistPresetTags(userId, normalized);
    setPresetTags(normalized);
  }, [userId]);

  const getPresetTag = useCallback(
    (licenseId) => presetTags[licenseId] || '',
    [presetTags]
  );

  const resetPresetTags = useCallback(() => {
    const scopedKey = getScopedStorageKey(userId);
    if (scopedKey) {
      localStorage.removeItem(scopedKey);
    }
    setPresetTags({});
  }, [userId]);

  return {
    presetTags,
    getPresetTag,
    setPresetTag,
    replacePresetTags,
    resetPresetTags,
    tagPresets: LICENSE_TAG_PRESETS,
  };
}