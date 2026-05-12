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
  clearRefreshToken,
} from '../data/apiAdapter';
import { readAccountOverviewCache, writeAccountOverviewCache } from '../data/accountOverviewCache';
import { trackLicenseDeviceHistory } from '../data/customDashboardDataStorage';
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
import { writeDailyLicenseSnapshot } from '../data/licenseSnapshotHistory';
import { clearPersistentPageState } from './usePersistentPageState';

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

  const rememberLicenseDeviceHistory = useCallback((userData, nextLicenses) => {
    if (!userData?.id || !Array.isArray(nextLicenses) || nextLicenses.length === 0) {
      return;
    }

    trackLicenseDeviceHistory(userData.id, nextLicenses);
  }, []);

  const rememberDailyLicenseSnapshots = useCallback((userData, nextLicenses) => {
    if (!userData?.id || !Array.isArray(nextLicenses) || nextLicenses.length === 0) {
      return;
    }

    writeDailyLicenseSnapshot(userData.id, nextLicenses);
  }, []);

  const hydrateCachedOverview = useCallback((userData, cachedOverview) => {
    if (!userData?.id || !cachedOverview) {
      return false;
    }

    setBalance(cachedOverview.balance);
    setLicenses(cachedOverview.licenses);
    setSummary(cachedOverview.summary);

    if (cachedOverview.recentAllocations.length > 0) {
      applyAllocationHistory(userData, cachedOverview.recentAllocations, { persist: false });
    } else {
      applyArchivedHistoryOnly(userData);
    }

    return true;
  }, [applyAllocationHistory, applyArchivedHistoryOnly]);

  const persistOverviewCache = useCallback((userData, snapshot) => {
    if (!userData?.id) {
      return null;
    }

    return writeAccountOverviewCache(userData.id, snapshot);
  }, []);

  const fetchCoreDashboardData = useCallback(() => Promise.allSettled([
    getRewardsBalance(),
    getLicenses(),
    getRewardsAllocations(),
    getRewardsAllocationsSummary(30),
  ]), []);

  const resolveUser = useCallback(async () => {
    try {
      return await getUser();
    } catch {
      await refreshSession();
      return getUser();
    }
  }, []);

  const fetchAll = useCallback(async ({ manual = false } = {}) => {
    if (!isAuthenticated()) {
      setAuthed(false);
      return;
    }

    const runId = fetchRunRef.current + 1;
    fetchRunRef.current = runId;

    setIsLoading(true);
    setError(null);

    try {
      const resolvedUser = await resolveUser();

      setUser(resolvedUser);

      const cachedOverview = readAccountOverviewCache(resolvedUser.id);

      if (!manual && hydrateCachedOverview(resolvedUser, cachedOverview)) {
        return;
      }

      const [balanceData, licensesData, allocData, summaryData] = await fetchCoreDashboardData();
      const nextBalance = balanceData.status === 'fulfilled'
        ? balanceData.value
        : cachedOverview?.balance ?? null;
      const nextLicenses = licensesData.status === 'fulfilled' && Array.isArray(licensesData.value)
        ? licensesData.value
        : cachedOverview?.licenses ?? [];
      const nextRecentAllocations = allocData.status === 'fulfilled' && Array.isArray(allocData.value)
        ? allocData.value
        : cachedOverview?.recentAllocations ?? [];
      const nextSummary = summaryData.status === 'fulfilled'
        ? (Array.isArray(summaryData.value) ? summaryData.value : [summaryData.value])
        : cachedOverview?.summary ?? [];
      const hasFreshCoreData = [balanceData, licensesData, allocData, summaryData].some((result) => result.status === 'fulfilled');

      setBalance(nextBalance);
      setLicenses(nextLicenses);
      setSummary(nextSummary);

      if (licensesData.status === 'fulfilled') {
        rememberDailyLicenseSnapshots(resolvedUser, nextLicenses);
        rememberLicenseDeviceHistory(resolvedUser, nextLicenses);
      }

      if (allocData.status === 'fulfilled' || nextRecentAllocations.length > 0) {
        const { mergedAllocations, historyMeta } = applyAllocationHistory(
          resolvedUser,
          nextRecentAllocations,
          { persist: allocData.status === 'fulfilled' }
        );

        if (manual && allocData.status === 'fulfilled' && shouldAttemptRewardBackfill(historyMeta)) {
          void backfillRewardHistory(resolvedUser, mergedAllocations, runId);
        }
      } else {
        applyArchivedHistoryOnly(resolvedUser);
      }

      if (hasFreshCoreData || cachedOverview) {
        persistOverviewCache(resolvedUser, {
          balance: nextBalance,
          licenses: nextLicenses,
          summary: nextSummary,
          recentAllocations: nextRecentAllocations,
        });
      }

      if (!hasFreshCoreData && !cachedOverview) {
        setError('Unable to load dashboard data right now.');
      }
    } catch (err) {
      setError(err.message || 'Session expired. Please log in again.');
      setAuthed(false);
    } finally {
      setIsLoading(false);
    }
  }, [applyAllocationHistory, applyArchivedHistoryOnly, backfillRewardHistory, fetchCoreDashboardData, hydrateCachedOverview, persistOverviewCache, rememberDailyLicenseSnapshots, rememberLicenseDeviceHistory, resolveUser]);

  useEffect(() => {
    if (authed) fetchAll({ manual: false });
  }, [authed, fetchAll]);

  const refetch = useCallback(() => fetchAll({ manual: false }), [fetchAll]);
  const manualRefresh = useCallback(() => fetchAll({ manual: true }), [fetchAll]);

  const logout = () => {
    clearToken();
    clearRefreshToken();
    clearPersistentPageState();
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
    clearPersistentPageState();
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
    refetch,
    manualRefresh,
    resetRewardHistoryCache,
    logout,
    onLogin,
  };
}
