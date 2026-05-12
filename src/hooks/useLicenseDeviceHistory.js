import { useState, useCallback, useEffect } from 'react';
import {
  clearLicenseDeviceHistory,
  normalizeLicenseDeviceHistory,
  readLicenseDeviceHistory,
  writeLicenseDeviceHistory,
} from '../data/customDashboardDataStorage';

export function useLicenseDeviceHistory(userId, refreshKey = null) {
  const [deviceHistory, setDeviceHistory] = useState(() => readLicenseDeviceHistory(userId));

  useEffect(() => {
    setDeviceHistory(readLicenseDeviceHistory(userId));
  }, [userId, refreshKey]);

  const replaceDeviceHistory = useCallback((nextHistory) => {
    const normalized = normalizeLicenseDeviceHistory(nextHistory);
    writeLicenseDeviceHistory(userId, normalized);
    setDeviceHistory(normalized);
  }, [userId]);

  const resetDeviceHistory = useCallback(() => {
    clearLicenseDeviceHistory(userId);
    setDeviceHistory({});
  }, [userId]);

  return {
    deviceHistory,
    replaceDeviceHistory,
    resetDeviceHistory,
  };
}