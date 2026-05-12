import { useEffect, useState } from 'react';
import { readLicenseSnapshotHistory } from '../data/licenseSnapshotHistory';

export function useLicenseSnapshotHistory(userId, refreshKey = null) {
  const [snapshotHistory, setSnapshotHistory] = useState(() => readLicenseSnapshotHistory(userId));

  useEffect(() => {
    setSnapshotHistory(readLicenseSnapshotHistory(userId));
  }, [userId, refreshKey]);

  return snapshotHistory;
}