import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  buildRewardHistoryMeta,
  clearRewardHistory,
  MAX_REWARD_HISTORY_PAGES,
  mergeRewardAllocations,
  readRewardHistory,
  REWARD_HISTORY_PAGE_SIZE,
  shouldAttemptRewardBackfill,
  writeRewardHistory,
} from '../data/rewardHistory';

export function useApi() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [summary, setSummary] = useState([]);
  const [historyInfo, setHistoryInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authed, setAuthed] = useState(isAuthenticated());
  const latestAllocationsRef = useRef([]);
  const currentUserIdRef = useRef(null);
  const fetchRunRef = useRef(0);

  const applyAllocationHistory = useCallback((userData, liveAllocations, { persist = true } = {}) => {
    const normalizedLiveAllocations = mergeRewardAllocations(liveAllocations);
    latestAllocationsRef.current = normalizedLiveAllocations;

    if (!userData?.id) {
      currentUserIdRef.current = null;
      setAllocations(normalizedLiveAllocations);
      setHistoryInfo(null);
      return { mergedAllocations: normalizedLiveAllocations, historyMeta: null };
    }

    currentUserIdRef.current = userData.id;

    const archivedHistory = readRewardHistory(userData.id);
    const mergedAllocations = mergeRewardAllocations(normalizedLiveAllocations, archivedHistory.allocations);
    const historyMeta = buildRewardHistoryMeta(mergedAllocations, archivedHistory.meta || {});

    setAllocations(mergedAllocations);
    setHistoryInfo(historyMeta);

    if (persist) {
      writeRewardHistory(userData.id, mergedAllocations, historyMeta);
    }

    return { mergedAllocations, historyMeta };
  }, []);

  const applyArchivedHistoryOnly = useCallback((userData) => {
    latestAllocationsRef.current = [];

    if (!userData?.id) {
      currentUserIdRef.current = null;
      setAllocations([]);
      setHistoryInfo(null);
      return;
    }

    currentUserIdRef.current = userData.id;

    const archivedHistory = readRewardHistory(userData.id);
    setAllocations(archivedHistory.allocations);
    setHistoryInfo(archivedHistory.meta);
  }, []);

  const backfillRewardHistory = useCallback(async (userData, seedAllocations, runId) => {
    if (!userData?.id || !seedAllocations?.length) {
      return;
    }

    const archivedHistory = readRewardHistory(userData.id);

    if (!shouldAttemptRewardBackfill(archivedHistory.meta)) {
      return;
    }

    let mergedAllocations = mergeRewardAllocations(seedAllocations, archivedHistory.allocations);
    let paginationSupported = null;
    let backfillPagesFetched = 0;
    let stopReason = 'partial';
    let previousPageSignature = null;
    const attemptStartedAt = new Date().toISOString();

    for (let pageIndex = 0; pageIndex < MAX_REWARD_HISTORY_PAGES; pageIndex += 1) {
      let pageAllocations;

      try {
        pageAllocations = await getRewardsAllocations({
          skip: pageIndex * REWARD_HISTORY_PAGE_SIZE,
          take: REWARD_HISTORY_PAGE_SIZE,
        });
      } catch {
        paginationSupported = pageIndex === 0 ? false : true;
        stopReason = pageIndex === 0 ? 'unsupported' : 'partial';
        break;
      }

      paginationSupported = true;
      backfillPagesFetched = pageIndex + 1;

      const normalizedPage = mergeRewardAllocations(pageAllocations);

      if (!normalizedPage.length) {
        stopReason = 'complete';
        break;
      }

      const pageSignature = normalizedPage.map((allocation) => allocation.id).join('|');

      if (previousPageSignature && pageSignature === previousPageSignature) {
        paginationSupported = false;
        stopReason = 'unsupported';
        break;
      }

      previousPageSignature = pageSignature;
      mergedAllocations = mergeRewardAllocations(mergedAllocations, normalizedPage);

      if (runId !== fetchRunRef.current || !isAuthenticated()) {
        return;
      }

      const pageLooksComplete = normalizedPage.length < REWARD_HISTORY_PAGE_SIZE;
      const inProgressHistory = writeRewardHistory(userData.id, mergedAllocations, {
        ...(readRewardHistory(userData.id).meta || {}),
        paginationSupported,
        backfillPagesFetched,
        backfillComplete: pageLooksComplete,
        backfillStatus: pageLooksComplete ? 'complete' : 'backfilling',
        lastBackfillAttemptAt: attemptStartedAt,
        lastBackfillAt: new Date().toISOString(),
      });

      setAllocations(inProgressHistory.allocations);
      setHistoryInfo(inProgressHistory.meta);

      if (pageLooksComplete) {
        stopReason = 'complete';
        break;
      }
    }

    if (runId !== fetchRunRef.current || !isAuthenticated()) {
      return;
    }

    const finalHistory = writeRewardHistory(userData.id, mergedAllocations, {
      ...(readRewardHistory(userData.id).meta || {}),
      paginationSupported,
      backfillPagesFetched,
      backfillComplete: stopReason === 'complete',
      backfillStatus: stopReason === 'complete' ? 'complete' : stopReason,
      lastBackfillAttemptAt: attemptStartedAt,
      lastBackfillAt: new Date().toISOString(),
    });

    setAllocations(finalHistory.allocations);
    setHistoryInfo(finalHistory.meta);
  }, []);

  const resetRewardHistoryCache = useCallback(() => {
    const userId = currentUserIdRef.current || user?.id;

    if (!userId) {
      return false;
    }

    clearRewardHistory(userId);
    setAllocations(latestAllocationsRef.current);
    setHistoryInfo(null);
    return true;
  }, [user]);

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated()) {
      setAuthed(false);
      return;
    }

    const runId = fetchRunRef.current + 1;
    fetchRunRef.current = runId;

    setIsLoading(true);
    setError(null);

    // Clear previous data before fetching new account's data
    currentUserIdRef.current = null;
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);
    setHistoryInfo(null);

    try {
      const [userData, balanceData, licensesData, allocData, summaryData] = await Promise.allSettled([
        getUser(),
        getRewardsBalance(),
        getLicenses(),
        getRewardsAllocations(),
        getRewardsAllocationsSummary(30),
      ]);

      const resolvedUser = userData.status === 'fulfilled' ? userData.value : null;

      if (resolvedUser) {
        setUser(resolvedUser);
      }

      if (balanceData.status === 'fulfilled') setBalance(balanceData.value);
      if (licensesData.status === 'fulfilled') {
        setLicenses(Array.isArray(licensesData.value) ? licensesData.value : []);
      }
      if (allocData.status === 'fulfilled') {
        const { mergedAllocations, historyMeta } = applyAllocationHistory(
          resolvedUser,
          Array.isArray(allocData.value) ? allocData.value : []
        );

        if (resolvedUser?.id && shouldAttemptRewardBackfill(historyMeta)) {
          void backfillRewardHistory(resolvedUser, mergedAllocations, runId);
        }
      } else if (resolvedUser?.id) {
        applyArchivedHistoryOnly(resolvedUser);
      } else {
        latestAllocationsRef.current = [];
        setAllocations([]);
        setHistoryInfo(null);
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

          const { mergedAllocations, historyMeta } = applyAllocationHistory(u2, Array.isArray(a2) ? a2 : []);

          if (u2?.id && shouldAttemptRewardBackfill(historyMeta)) {
            void backfillRewardHistory(u2, mergedAllocations, runId);
          }

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
    latestAllocationsRef.current = [];
    currentUserIdRef.current = null;
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);
    setHistoryInfo(null);
    setError(null);
    setAuthed(false);
  };

  const onLogin = () => {
    // Clear any stale data from previous account
    latestAllocationsRef.current = [];
    currentUserIdRef.current = null;
    setUser(null);
    setBalance(null);
    setLicenses([]);
    setAllocations([]);
    setSummary([]);
    setHistoryInfo(null);
    setError(null);
    setAuthed(true);
  };

  return {
    user,
    balance,
    licenses,
    allocations,
    summary,
    historyInfo,
    isLoading,
    error,
    isAuthenticated: authed,
    refetch: fetchAll,
    resetRewardHistoryCache,
    logout,
    onLogin,
  };
}
