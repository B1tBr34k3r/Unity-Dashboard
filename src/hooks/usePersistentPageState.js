import { useCallback, useEffect, useState } from 'react';

const PAGE_STATE_PREFIX = 'page-state:';

function resolveInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

function readStoredValue(storageKey, initialValue) {
  const fallbackValue = resolveInitialValue(initialValue);
  if (!storageKey || typeof window === 'undefined') {
    return fallbackValue;
  }

  try {
    const storedValue = window.sessionStorage.getItem(storageKey);
    return storedValue !== null ? JSON.parse(storedValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function clearPersistentPageState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    Object.keys(window.sessionStorage).forEach((storageKey) => {
      if (storageKey.startsWith(PAGE_STATE_PREFIX)) {
        window.sessionStorage.removeItem(storageKey);
      }
    });
  } catch {
    // Ignore session storage access failures and keep logout/login working.
  }
}

export function usePersistentPageState(storageKey, initialValue) {
  const [value, setValueState] = useState(() => readStoredValue(storageKey, initialValue));

  useEffect(() => {
    setValueState(readStoredValue(storageKey, initialValue));
  }, [storageKey, initialValue]);

  const setValue = useCallback((nextValue) => {
    setValueState((prevValue) => (
      typeof nextValue === 'function' ? nextValue(prevValue) : nextValue
    ));
  }, []);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore session storage write failures and keep in-memory state working.
    }
  }, [storageKey, value]);

  return [value, setValue];
}