import { useState, useEffect, useCallback } from 'react';
import {
  isAuthenticated,
  getUser,
  getLicenses,
  getRewardsBalance,
  getRewardsAllocations,
  getRewardsAllocationsSummary,
  refreshSession,
  clearToken,
} from '../data/apiAdapter';

function clearState() {
  return {
    user: null,
    balance: null,
    allocations: [],
    summary: [],
  };
}

export function useApi() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [summary, setSummary] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authed, setAuthed] = useState(isAuthenticated());

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated()) {
      setAuthed(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Clear previous data before fetching new account's data
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);

    try {
      const [userData, balanceData, licensesData, allocData, summaryData] = await Promise.allSettled([
        getUser(),
        getRewardsBalance(),
        getLicenses(),
        getRewardsAllocations(),
        getRewardsAllocationsSummary(30),
      ]);

      if (userData.status === 'fulfilled') setUser(userData.value);
      if (balanceData.status === 'fulfilled') setBalance(balanceData.value);
      if (licensesData.status === 'fulfilled') {
        setLicenses(Array.isArray(licensesData.value) ? licensesData.value : []);
      }
      if (allocData.status === 'fulfilled') {
        // Deduplicate by allocation id
        const data = Array.isArray(allocData.value) ? allocData.value : [];
        const seen = new Set();
        const unique = data.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        setAllocations(unique);
      }
      if (summaryData.status === 'fulfilled') {
        setSummary(Array.isArray(summaryData.value) ? summaryData.value : [summaryData.value]);
      }

      // Check if all failed — try refresh
      const allFailed = [userData, balanceData, licensesData, allocData, summaryData].every(
        (r) => r.status === 'rejected'
      );
      if (allFailed) {
        try {
          await refreshSession();
          const [u2, b2, l2, a2, s2] = await Promise.all([
            getUser(),
            getRewardsBalance(),
            getLicenses(),
            getRewardsAllocations(),
            getRewardsAllocationsSummary(30),
          ]);
          setUser(u2);
          setBalance(b2);
          setLicenses(Array.isArray(l2) ? l2 : []);
          const retryData = Array.isArray(a2) ? a2 : [];
          const seen2 = new Set();
          setAllocations(retryData.filter((a) => {
            if (seen2.has(a.id)) return false;
            seen2.add(a.id);
            return true;
          }));
          setSummary(Array.isArray(s2) ? s2 : [s2]);
        } catch {
          setError('Session expired. Please log in again.');
          setAuthed(false);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) fetchAll();
  }, [authed, fetchAll]);

  const logout = () => {
    clearToken();
    localStorage.removeItem('unity_edge_refresh_token');
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);
    setError(null);
    setAuthed(false);
  };

  const onLogin = () => {
    // Clear any stale data from previous account
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);
    setError(null);
    setAuthed(true);
  };

  return {
    user,
    balance,
    licenses,
    allocations,
    summary,
    isLoading,
    error,
    isAuthenticated: authed,
    refetch: fetchAll,
    logout,
    onLogin,
  };
}
