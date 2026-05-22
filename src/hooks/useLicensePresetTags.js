import { useState, useCallback, useEffect } from 'react';
import {
  clearCloneTagOrder,
  clearPresetTags,
  clearWorkTagOrder,
  normalizeCloneTagOrder,
  normalizePresetTag,
  normalizePresetTags,
  normalizeWorkTagOrder,
  readCloneTagOrder,
  readPresetTags,
  readWorkTagOrder,
  writeCloneTagOrder,
  writeWorkTagOrder,
  writePresetTags,
} from '../data/customDashboardDataStorage';
import { LICENSE_TAG_PRESETS } from '../utils/licenseDisplay';

function getPresetTagState(userId) {
  const presetTags = readPresetTags(userId);

  return {
    presetTags,
    cloneTagOrder: readCloneTagOrder(userId, presetTags),
    workTagOrder: readWorkTagOrder(userId, presetTags),
  };
}

function getNextPresetTagOrder(currentTagOrder, nextPresetTags, licenseId, previousTag, nextTag, targetTag, normalizeTagOrder) {
  const normalizedOrder = normalizeTagOrder(currentTagOrder, nextPresetTags);
  const wasTargetTag = previousTag?.toLowerCase() === targetTag;
  const isTargetTag = nextTag?.toLowerCase() === targetTag;

  if (wasTargetTag && isTargetTag) {
    return normalizedOrder;
  }

  const withoutLicense = normalizedOrder.filter((currentId) => currentId !== licenseId);
  return isTargetTag ? [...withoutLicense, licenseId] : withoutLicense;
}

export function useLicensePresetTags(userId) {
  const [{ presetTags, cloneTagOrder, workTagOrder }, setPresetTagState] = useState(() => getPresetTagState(userId));

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

      const nextCloneTagOrder = getNextPresetTagOrder(
        prevState.cloneTagOrder,
        nextPresetTags,
        licenseId,
        previousTag,
        normalizedTag,
        'clone',
        normalizeCloneTagOrder
      );
      const nextWorkTagOrder = getNextPresetTagOrder(
        prevState.workTagOrder,
        nextPresetTags,
        licenseId,
        previousTag,
        normalizedTag,
        'work',
        normalizeWorkTagOrder
      );

      writePresetTags(userId, nextPresetTags);
      writeCloneTagOrder(userId, nextCloneTagOrder, nextPresetTags);
      writeWorkTagOrder(userId, nextWorkTagOrder, nextPresetTags);

      return {
        presetTags: nextPresetTags,
        cloneTagOrder: nextCloneTagOrder,
        workTagOrder: nextWorkTagOrder,
      };
    });
  }, [userId]);

  const replacePresetTags = useCallback((nextPresetTags, nextTagOrders) => {
    const normalizedPresetTags = normalizePresetTags(nextPresetTags);
    const normalizedCloneTagOrder = normalizeCloneTagOrder(
      Array.isArray(nextTagOrders) ? nextTagOrders : nextTagOrders?.cloneTagOrder ?? nextTagOrders?.clone,
      normalizedPresetTags
    );
    const normalizedWorkTagOrder = normalizeWorkTagOrder(
      Array.isArray(nextTagOrders) ? [] : nextTagOrders?.workTagOrder ?? nextTagOrders?.work,
      normalizedPresetTags
    );

    writePresetTags(userId, normalizedPresetTags);
    writeCloneTagOrder(userId, normalizedCloneTagOrder, normalizedPresetTags);
    writeWorkTagOrder(userId, normalizedWorkTagOrder, normalizedPresetTags);
    setPresetTagState({
      presetTags: normalizedPresetTags,
      cloneTagOrder: normalizedCloneTagOrder,
      workTagOrder: normalizedWorkTagOrder,
    });
  }, [userId]);

  const getPresetTag = useCallback(
    (licenseId) => presetTags[licenseId] || '',
    [presetTags]
  );

  const resetPresetTags = useCallback(() => {
    clearPresetTags(userId);
    clearCloneTagOrder(userId);
    clearWorkTagOrder(userId);
    setPresetTagState({ presetTags: {}, cloneTagOrder: [], workTagOrder: [] });
  }, [userId]);

  return {
    presetTags,
    cloneTagOrder,
    workTagOrder,
    getPresetTag,
    setPresetTag,
    replacePresetTags,
    resetPresetTags,
    tagPresets: LICENSE_TAG_PRESETS,
  };
}