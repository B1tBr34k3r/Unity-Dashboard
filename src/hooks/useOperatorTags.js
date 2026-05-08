import { useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'unity_license_operators';

function readOperators() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function useOperatorTags() {
  const [operators, setOperators] = useState(readOperators);

  const setOperator = useCallback((licenseId, name) => {
    const trimmed = name ? name.trim() : '';
    setOperators((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[licenseId] = trimmed;
      } else {
        delete next[licenseId];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getOperator = useCallback(
    (licenseId) => operators[licenseId] || '',
    [operators]
  );

  const resetOperators = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setOperators({});
  }, []);

  // All unique operator names (sorted)
  const allOperators = useMemo(() => {
    return [...new Set(Object.values(operators))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [operators]);

  return { operators, getOperator, setOperator, resetOperators, allOperators };
}
