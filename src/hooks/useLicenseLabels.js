import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'unity_license_labels';
const LEGACY_LICENSES_KEY = 'unity_nodes_licenses';

function readLabels() {
  // Primary label store from current version
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) || {};
    }
  } catch {
    // fallback to legacy data
  }

  // Fallback and migration from old legacy license store
  try {
    const legacyRaw = localStorage.getItem(LEGACY_LICENSES_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        const migrated = legacy.reduce((acc, item) => {
          if (item?.id && item?.name) {
            acc[item.id] = item.name;
          }
          return acc;
        }, {});
        if (Object.keys(migrated).length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }
    }
  } catch {
    // ignore if migration fails
  }

  return {};
}

export function useLicenseLabels() {
  const [labels, setLabels] = useState(readLabels);

  const setLabel = useCallback((licenseId, name) => {
    const trimmed = name ? name.trim() : '';

    if (trimmed) {
      const current = readLabels();
      const duplicate = Object.entries(current).find(
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return true;
  }, []);

  const getLabel = useCallback((licenseId) => {
    return labels[licenseId] || '';
  }, [labels]);

  const resetLabels = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_LICENSES_KEY);
    setLabels({});
  }, []);

  return { labels, getLabel, setLabel, resetLabels };
}
