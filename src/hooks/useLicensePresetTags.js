import { useState, useCallback, useEffect } from 'react';
import {
  clearCloneTagOrder,
  clearPresetTags,
  normalizeCloneTagOrder,
  normalizePresetTag,
  normalizePresetTags,
  readCloneTagOrder,
  readPresetTags,
  writeCloneTagOrder,
  writePresetTags,
} from '../data/customDashboardDataStorage';
import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

function getPresetTagState(userId) {
  const presetTags = readPresetTags(userId);

  return {
    presetTags,
    cloneTagOrder: readCloneTagOrder(userId, presetTags),
  };
}

function getNextCloneTagOrder(currentCloneTagOrder, nextPresetTags, licenseId, previousTag, nextTag) {
  const normalizedOrder = normalizeCloneTagOrder(currentCloneTagOrder, nextPresetTags);
  const wasClone = previousTag?.toLowerCase() === 'clone';
  const isClone = nextTag?.toLowerCase() === 'clone';

  if (wasClone && isClone) {
    return normalizedOrder;
  }

  const withoutLicense = normalizedOrder.filter((currentId) => currentId !== licenseId);
  return isClone ? [...withoutLicense, licenseId] : withoutLicense;
}

export function useLicensePresetTags(userId) {
  const [{ presetTags, cloneTagOrder }, setPresetTagState] = useState(() => getPresetTagState(userId));

  useEffect(() => {
    setPresetTagState(getPresetTagState(userId));
  }, [userId]);

  const setPresetTag = useCallback((licenseId, tag) => {
    const normalizedTag = normalizePresetTag(tag);

    setPresetTagState((prevState) => {
      const previousTag = prevState.presetTags[licenseId] || '';
      const nextPresetTags = { ...prevState.presetTags };

      if (normalizedTag) {
        nextPresetTags[licenseId] = normalizedTag;
      } else {
        delete nextPresetTags[licenseId];
      }

      const nextCloneTagOrder = getNextCloneTagOrder(
        prevState.cloneTagOrder,
        nextPresetTags,
        licenseId,
        previousTag,
        normalizedTag
      );

      writePresetTags(userId, nextPresetTags);
      writeCloneTagOrder(userId, nextCloneTagOrder, nextPresetTags);

      return {
        presetTags: nextPresetTags,
        cloneTagOrder: nextCloneTagOrder,
      };
    });
  }, [userId]);

  const replacePresetTags = useCallback((nextPresetTags, nextCloneTagOrder) => {
    const normalizedPresetTags = normalizePresetTags(nextPresetTags);
    const normalizedCloneTagOrder = normalizeCloneTagOrder(nextCloneTagOrder, normalizedPresetTags);

    writePresetTags(userId, normalizedPresetTags);
    writeCloneTagOrder(userId, normalizedCloneTagOrder, normalizedPresetTags);
    setPresetTagState({
      presetTags: normalizedPresetTags,
      cloneTagOrder: normalizedCloneTagOrder,
    });
  }, [userId]);

  const getPresetTag = useCallback(
    (licenseId) => presetTags[licenseId] || '',
    [presetTags]
  );

  const resetPresetTags = useCallback(() => {
    clearPresetTags(userId);
    clearCloneTagOrder(userId);
    setPresetTagState({ presetTags: {}, cloneTagOrder: [] });
  }, [userId]);

  return {
    presetTags,
    cloneTagOrder,
    getPresetTag,
    setPresetTag,
    replacePresetTags,
    resetPresetTags,
    tagPresets: LICENSE_TAG_PRESETS,
  };
}