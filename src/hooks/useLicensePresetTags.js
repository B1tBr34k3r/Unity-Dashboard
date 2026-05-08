import { useState, useCallback, useEffect } from 'react';
import { pushLocalCustomDashboardDataToProfile } from '../data/apiAdapter';
import {
  clearPresetTags,
  normalizePresetTag,
  normalizePresetTags,
  readPresetTags,
  writePresetTags,
} from '../data/customDashboardDataStorage';
import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

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
      writePresetTags(userId, next);
      void pushLocalCustomDashboardDataToProfile(userId);
      return next;
    });
  }, [userId]);

  const replacePresetTags = useCallback((nextPresetTags) => {
    const normalized = normalizePresetTags(nextPresetTags);
    writePresetTags(userId, normalized);
    setPresetTags(normalized);
    void pushLocalCustomDashboardDataToProfile(userId);
  }, [userId]);

  const getPresetTag = useCallback(
    (licenseId) => presetTags[licenseId] || '',
    [presetTags]
  );

  const resetPresetTags = useCallback(() => {
    clearPresetTags(userId);
    setPresetTags({});
    void pushLocalCustomDashboardDataToProfile(userId);
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