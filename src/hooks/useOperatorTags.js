import { useState, useCallback, useMemo, useEffect } from 'react';

const STORAGE_KEY = 'unity_license_operators';

function getScopedStorageKey(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : null;
}

function normalizeOperators(rawValue) {
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

function persistOperators(userId, operators) {
  const storageKey = getScopedStorageKey(userId);

  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(operators));
}

function readOperators(userId) {
  if (!userId) {
    return {};
  }

  const scopedKey = getScopedStorageKey(userId);

  try {
    const raw = scopedKey ? localStorage.getItem(scopedKey) : null;
    if (raw) {
      return normalizeOperators(JSON.parse(raw));
    }
  } catch {
    return {};
  }

  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const migrated = normalizeOperators(JSON.parse(legacyRaw));

      if (Object.keys(migrated).length > 0) {
        persistOperators(userId, migrated);
        localStorage.removeItem(STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    return {};
  }

  return {};
}

export function useOperatorTags(userId) {
  const [operators, setOperators] = useState(() => readOperators(userId));

  useEffect(() => {
    setOperators(readOperators(userId));
  }, [userId]);

  const setOperator = useCallback((licenseId, name) => {
    const trimmed = name ? name.trim() : '';
    setOperators((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[licenseId] = trimmed;
      } else {
        delete next[licenseId];
      }
      persistOperators(userId, next);
      return next;
    });
  }, [userId]);

  const replaceOperators = useCallback((nextOperators) => {
    const normalized = normalizeOperators(nextOperators);
    persistOperators(userId, normalized);
    setOperators(normalized);
  }, [userId]);

  const getOperator = useCallback(
    (licenseId) => operators[licenseId] || '',
    [operators]
  );

  const resetOperators = useCallback(() => {
    const scopedKey = getScopedStorageKey(userId);
    if (scopedKey) {
      localStorage.removeItem(scopedKey);
    }
    setOperators({});
  }, [userId]);

  // All unique operator names (sorted)
  const allOperators = useMemo(() => {
    return [...new Set(Object.values(operators))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [operators]);

  return { operators, getOperator, setOperator, replaceOperators, resetOperators, allOperators };
}
