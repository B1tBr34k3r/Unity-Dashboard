import { useState, useCallback, useMemo, useEffect } from 'react';
import { pushLocalCustomDashboardDataToProfile } from '../data/apiAdapter';
import { clearOperators, normalizeOperators, readOperators, writeOperators } from '../data/customDashboardDataStorage';

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
      writeOperators(userId, next);
      void pushLocalCustomDashboardDataToProfile(userId);
      return next;
    });
  }, [userId]);

  const replaceOperators = useCallback((nextOperators) => {
    const normalized = normalizeOperators(nextOperators);
    writeOperators(userId, normalized);
    setOperators(normalized);
    void pushLocalCustomDashboardDataToProfile(userId);
  }, [userId]);

  const getOperator = useCallback(
    (licenseId) => operators[licenseId] || '',
    [operators]
  );

  const resetOperators = useCallback(() => {
    clearOperators(userId);
    setOperators({});
    void pushLocalCustomDashboardDataToProfile(userId);
  }, [userId]);

  // All unique operator names (sorted)
  const allOperators = useMemo(() => {
    return [...new Set(Object.values(operators))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [operators]);

  return { operators, getOperator, setOperator, replaceOperators, resetOperators, allOperators };
}
