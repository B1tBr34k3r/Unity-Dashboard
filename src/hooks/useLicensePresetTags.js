import { useState, useCallback } from 'react';
import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

const STORAGE_KEY = 'unity_license_preset_tags';

function readPresetTags() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function normalizePresetTag(tag) {
  const trimmedTag = tag ? tag.trim() : '';
  if (!trimmedTag) return '';

  return LICENSE_TAG_PRESETS.find(
    (preset) => preset.toLowerCase() === trimmedTag.toLowerCase()
  ) || '';
}

export function useLicensePresetTags() {
  const [presetTags, setPresetTags] = useState(readPresetTags);

  const setPresetTag = useCallback((licenseId, tag) => {
    const normalizedTag = normalizePresetTag(tag);

    setPresetTags((prev) => {
      const next = { ...prev };
      if (normalizedTag) {
        next[licenseId] = normalizedTag;
      } else {
        delete next[licenseId];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getPresetTag = useCallback(
    (licenseId) => presetTags[licenseId] || '',
    [presetTags]
  );

  const resetPresetTags = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPresetTags({});
  }, []);

  return {
    presetTags,
    getPresetTag,
    setPresetTag,
    resetPresetTags,
    tagPresets: LICENSE_TAG_PRESETS,
  };
}