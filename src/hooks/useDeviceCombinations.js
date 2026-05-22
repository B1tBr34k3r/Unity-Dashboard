import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearDeviceCombinations,
  normalizeDeviceCombinations,
  readDeviceCombinations,
  writeDeviceCombinations,
} from '../data/customDashboardDataStorage';
import { buildDeviceAliasLookup, normalizeDeviceAliasKey } from '../utils/licenseDisplay';

export function useDeviceCombinations(userId) {
  const [deviceCombinations, setDeviceCombinations] = useState(() => readDeviceCombinations(userId));

  useEffect(() => {
    setDeviceCombinations(readDeviceCombinations(userId));
  }, [userId]);

  const replaceDeviceCombinations = useCallback((nextDeviceCombinations) => {
    const normalized = normalizeDeviceCombinations(nextDeviceCombinations);
    writeDeviceCombinations(userId, normalized);
    setDeviceCombinations(normalized);
  }, [userId]);

  const upsertDeviceCombination = useCallback((nextDeviceCombination, previousLabel = '') => {
    const normalizedNext = normalizeDeviceCombinations([nextDeviceCombination])[0] || null;

    if (!normalizedNext) {
      return false;
    }

    const previousLabelKey = normalizeDeviceAliasKey(previousLabel);
    const filtered = deviceCombinations.filter(
      (entry) => normalizeDeviceAliasKey(entry.label) !== previousLabelKey
    );
    const next = normalizeDeviceCombinations([...filtered, normalizedNext]);
    const hasSavedEntry = next.some(
      (entry) => normalizeDeviceAliasKey(entry.label) === normalizeDeviceAliasKey(normalizedNext.label)
    );

    if (!hasSavedEntry) {
      return false;
    }

    writeDeviceCombinations(userId, next);
    setDeviceCombinations(next);
    return true;
  }, [userId, deviceCombinations]);

  const removeDeviceCombination = useCallback((label) => {
    const labelKey = normalizeDeviceAliasKey(label);
    const next = deviceCombinations.filter((entry) => normalizeDeviceAliasKey(entry.label) !== labelKey);

    writeDeviceCombinations(userId, next);
    setDeviceCombinations(next);
  }, [userId, deviceCombinations]);

  const resetDeviceCombinations = useCallback(() => {
    clearDeviceCombinations(userId);
    setDeviceCombinations([]);
  }, [userId]);

  const deviceAliasLookup = useMemo(
    () => buildDeviceAliasLookup(deviceCombinations),
    [deviceCombinations]
  );

  return {
    deviceCombinations,
    deviceAliasLookup,
    replaceDeviceCombinations,
    upsertDeviceCombination,
    removeDeviceCombination,
    resetDeviceCombinations,
  };
}