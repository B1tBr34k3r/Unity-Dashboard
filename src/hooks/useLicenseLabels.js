import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'unity_license_labels';
const LEGACY_LICENSES_KEY = 'unity_nodes_licenses';

function getScopedStorageKey(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : null;
}

function normalizeLabels(rawValue) {
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

function persistLabels(userId, labels) {
  const storageKey = getScopedStorageKey(userId);

  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(labels));
}

function readLabels(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(userId);

  try {
    const raw = scopedKey ? localStorage.getItem(scopedKey) : null;
    if (raw) {
      return normalizeLabels(JSON.parse(raw));
    }
  } catch {
    return {};
  }

  try {
    const legacyScopedValue = localStorage.getItem(STORAGE_KEY);
    if (legacyScopedValue) {
      const migrated = normalizeLabels(JSON.parse(legacyScopedValue));

      if (Object.keys(migrated).length > 0) {
        persistLabels(userId, migrated);
        localStorage.removeItem(STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    return {};
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_LICENSES_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        const migrated = legacy.reduce((accumulator, item) => {
          const trimmedName = typeof item?.name === 'string' ? item.name.trim() : '';
          if (item?.id && trimmedName) {
            accumulator[item.id] = trimmedName;
          }
          return accumulator;
        }, {});

        if (Object.keys(migrated).length > 0) {
          persistLabels(userId, migrated);
          localStorage.removeItem(LEGACY_LICENSES_KEY);
          return migrated;
        }
      }
    }
  } catch {
    return {};
  }

  return {};
}

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
      persistLabels(userId, next);
      return next;
    });
    return true;
  }, [userId]);

  const replaceLabels = useCallback((nextLabels) => {
    const normalized = normalizeLabels(nextLabels);
    persistLabels(userId, normalized);
    setLabels(normalized);
  }, [userId]);

  const getLabel = useCallback((licenseId) => {
    return labels[licenseId] || '';
  }, [labels]);

  const resetLabels = useCallback(() => {
    const scopedKey = getScopedStorageKey(userId);
    if (scopedKey) {
      localStorage.removeItem(scopedKey);
    }
    localStorage.removeItem(LEGACY_LICENSES_KEY);
    setLabels({});
  }, [userId]);

  return { labels, getLabel, setLabel, replaceLabels, resetLabels };
}
