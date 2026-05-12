import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { clearLabels, normalizeLabels, readLabels, writeLabels } from '../data/customDashboardDataStorage';

export function useLicenseLabels(userId) {
  const [labels, setLabels] = useState(() => readLabels(userId));

  useEffect(() => {
    setLabels(readLabels(userId));
  }, [userId]);

  const setLabel = useCallback((licenseId, name) => {
    const trimmed = name ? name.trim() : '';
    const currentLabels = readLabels(userId);

    if (trimmed) {
      const duplicate = Object.entries(currentLabels).find(
        ([id, existing]) =>
          id !== licenseId && existing.toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) {
        toast.error(`Name "${trimmed}" is already used by another license`);
        return false;
      }
    }

    setLabels((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[licenseId] = trimmed;
      } else {
        delete next[licenseId];
      }
      writeLabels(userId, next);
      return next;
    });
    return true;
  }, [userId]);

  const replaceLabels = useCallback((nextLabels) => {
    const normalized = normalizeLabels(nextLabels);
    writeLabels(userId, normalized);
    setLabels(normalized);
  }, [userId]);

  const getLabel = useCallback((licenseId) => {
    return labels[licenseId] || '';
  }, [labels]);

  const resetLabels = useCallback(() => {
    clearLabels(userId);
    setLabels({});
  }, [userId]);

  return { labels, getLabel, setLabel, replaceLabels, resetLabels };
}
