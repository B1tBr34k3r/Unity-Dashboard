// Unity Edge API Adapter (Supabase-based)
// Base: https://api.unityedge.io
// Auth: Supabase JWT via email login
// Anon key required as `apikey` header on all requests

import { readCustomDashboardData, writeCustomDashboardData } from './customDashboardDataStorage';

const BASE_URL = 'https://api.unityedge.io';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TOKEN_STORAGE_KEY = 'unity_edge_token';
const REFRESH_TOKEN_STORAGE_KEY = 'unity_edge_refresh_token';
const USER_STORAGE_KEY = 'unity_edge_user';
const CUSTOM_DASHBOARD_DATA_METADATA_KEY = 'unity_dashboard_custom_data';
const CUSTOM_DASHBOARD_SYNC_DEBOUNCE_MS = 150;
const pendingCustomDashboardSyncs = new Map();
let refreshSessionPromise = null;

function readStoredValue(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const persistedValue = window.localStorage.getItem(storageKey);

    if (persistedValue !== null) {
      return persistedValue;
    }
  } catch {
    // Ignore local storage read failures and fall back to session storage.
  }

  try {
    const sessionValue = window.sessionStorage.getItem(storageKey);

    if (sessionValue !== null) {
      try {
        window.localStorage.setItem(storageKey, sessionValue);
      } catch {
        // Ignore migration failures and keep the current session alive.
      }

      return sessionValue;
    }
  } catch {
    return null;
  }

  return null;
}

function writeStoredValue(storageKey, value) {
  if (typeof window === 'undefined') {
    return;
  }

  let wrotePersistentValue = false;

  try {
    window.localStorage.setItem(storageKey, value);
    wrotePersistentValue = true;
  } catch {
    // Ignore persistent storage failures and fall back to session storage.
  }

  try {
    if (wrotePersistentValue) {
      window.sessionStorage.removeItem(storageKey);
    } else {
      window.sessionStorage.setItem(storageKey, value);
    }
  } catch {
    // Ignore storage sync failures and let auth requests fail naturally.
  }
}

function removeStoredValue(storageKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore local storage cleanup failures.
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore session storage cleanup failures.
  }
}

function readStoredUser() {
  const rawUser = readStoredValue(USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

function writeStoredUser(user) {
  if (!user || typeof user !== 'object') {
    removeStoredValue(USER_STORAGE_KEY);
    return;
  }

  writeStoredValue(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  removeStoredValue(USER_STORAGE_KEY);
}

function getAnonKey() {
  if (!ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY. Add it in Vercel Project Settings -> Environment Variables, then redeploy.');
  }

  return ANON_KEY;
}

function getApiErrorMessage(errorPayload, fallbackMessage) {
  if (!errorPayload || typeof errorPayload !== 'object') {
    return fallbackMessage;
  }

  const primaryMessage = errorPayload.error_description || errorPayload.msg || errorPayload.message;

  if (primaryMessage && errorPayload.hint) {
    return `${primaryMessage} ${errorPayload.hint}`;
  }

  return primaryMessage || errorPayload.hint || fallbackMessage;
}

// --- Auth helpers ---

function getToken() {
  return readStoredValue(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  writeStoredValue(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  removeStoredValue(TOKEN_STORAGE_KEY);
  clearStoredUser();
}

function getRefreshToken() {
  return readStoredValue(REFRESH_TOKEN_STORAGE_KEY);
}

function setRefreshToken(refreshToken) {
  writeStoredValue(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
}

export function clearRefreshToken() {
  removeStoredValue(REFRESH_TOKEN_STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

// --- Core request ---

async function request(path, { method = 'GET', body, params, headers: extraHeaders } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetchWithAuth(url.toString(), {
    method,
    headers: extraHeaders,
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${err}`);
  }

  return res.json();
}

// --- Auth endpoints ---

// OTP: send magic link to email
export async function sendOtp(email) {
  const anonKey = getAnonKey();
  const res = await fetch(`${BASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(err, 'Failed to send OTP'));
  }
  return true;
}

// OTP: verify code from email
export async function verifyOtp(email, otpCode) {
  const anonKey = getAnonKey();
  const res = await fetch(`${BASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ email, token: otpCode, type: 'email' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(err, 'Invalid OTP code'));
  }

  const data = await res.json();
  setToken(data.access_token);
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token);
  }
  return data;
}

// Direct token login (paste Bearer token from browser)
export function loginWithToken(token) {
  setToken(token);
}

export async function getUser() {
  const user = await request('/auth/v1/user');
  writeStoredUser(user);
  return user;
}

async function refreshSessionInternal() {
  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearToken();
    clearRefreshToken();
    throw new Error('No refresh token');
  }

  refreshSessionPromise = (async () => {
    const anonKey = getAnonKey();
    const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      clearToken();
      clearRefreshToken();
      throw new Error(getApiErrorMessage(err, 'Session refresh failed'));
    }

    const data = await res.json();
    setToken(data.access_token);
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token);
    }
    if (data.user) {
      writeStoredUser(data.user);
    }

    return data;
  })();

  try {
    return await refreshSessionPromise;
  } finally {
    refreshSessionPromise = null;
  }
}

export async function refreshSession() {
  return refreshSessionInternal();
}

function buildAuthHeaders(extraHeaders = {}) {
  const token = getToken();
  const anonKey = getAnonKey();

  return {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extraHeaders,
  };
}

function buildRequestBody(body) {
  if (body === undefined || body === null) {
    return undefined;
  }

  return JSON.stringify(body);
}

async function fetchWithAuth(url, { method = 'GET', body, headers: extraHeaders } = {}) {
  const makeRequest = () => fetch(url, {
    method,
    headers: buildAuthHeaders(extraHeaders),
    ...(body !== undefined && body !== null ? { body: buildRequestBody(body) } : {}),
  });

  let res = await makeRequest();

  if (res.status === 401 && getRefreshToken()) {
    try {
      await refreshSessionInternal();
      res = await makeRequest();
    } catch {
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (res.status === 401) {
    clearToken();
    clearRefreshToken();
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}

export function getCustomDashboardDataFromUser(user) {
  const rawCustomData = user?.user_metadata?.[CUSTOM_DASHBOARD_DATA_METADATA_KEY];

  if (!rawCustomData || typeof rawCustomData !== 'object' || Array.isArray(rawCustomData)) {
    return null;
  }

  return rawCustomData;
}

function getCustomDashboardDataCounts(customData) {
  return {
    labelCount: Object.keys(customData?.labels || {}).length,
    presetTagCount: Object.keys(customData?.presetTags || {}).length,
    operatorCount: Object.keys(customData?.operators || {}).length,
  };
}

export function hydrateLocalCustomDashboardDataFromUser(user) {
  if (!user?.id) {
    return null;
  }

  const remoteCustomData = getCustomDashboardDataFromUser(user);

  if (!remoteCustomData) {
    return null;
  }

  const normalizedCustomData = writeCustomDashboardData(user.id, remoteCustomData);
  const counts = getCustomDashboardDataCounts(normalizedCustomData);

  if (counts.labelCount + counts.presetTagCount + counts.operatorCount === 0) {
    return null;
  }

  return {
    source: 'account',
    userId: user.id,
    syncedAt: new Date().toISOString(),
    counts,
  };
}

async function syncLocalCustomDashboardDataToProfile(userId) {
  if (!userId || !isAuthenticated()) {
    return false;
  }

  try {
    const currentUser = readStoredUser();
    const baseUser = currentUser?.id === userId ? currentUser : await getUser();
    const currentMetadata = baseUser?.user_metadata && typeof baseUser.user_metadata === 'object' && !Array.isArray(baseUser.user_metadata)
      ? baseUser.user_metadata
      : {};
    const nextUser = await request('/auth/v1/user', {
      method: 'PUT',
      body: {
        data: {
          ...currentMetadata,
          [CUSTOM_DASHBOARD_DATA_METADATA_KEY]: readCustomDashboardData(userId),
        },
      },
    });

    writeStoredUser(nextUser);
    return true;
  } catch (error) {
    console.warn('Failed to sync custom dashboard data for the current Unity account.', error);
    return false;
  }
}

export function pushLocalCustomDashboardDataToProfile(userId) {
  if (!userId || !isAuthenticated()) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const pendingSync = pendingCustomDashboardSyncs.get(userId);

    if (pendingSync) {
      clearTimeout(pendingSync.timerId);
      pendingSync.resolvers.push(resolve);
      pendingSync.timerId = setTimeout(async () => {
        pendingCustomDashboardSyncs.delete(userId);
        const result = await syncLocalCustomDashboardDataToProfile(userId);
        pendingSync.resolvers.forEach((callback) => callback(result));
      }, CUSTOM_DASHBOARD_SYNC_DEBOUNCE_MS);
      return;
    }

    const nextPendingSync = {
      resolvers: [resolve],
      timerId: setTimeout(async () => {
        pendingCustomDashboardSyncs.delete(userId);
        const result = await syncLocalCustomDashboardDataToProfile(userId);
        nextPendingSync.resolvers.forEach((callback) => callback(result));
      }, CUSTOM_DASHBOARD_SYNC_DEBOUNCE_MS),
    };

    pendingCustomDashboardSyncs.set(userId, nextPendingSync);
  });
}

// --- Rewards endpoints ---

export async function getRewardsBalance() {
  return request('/rest/v1/rpc/rewards_get_balance', { method: 'POST' });
}

export async function getRewardsAllocations({ skip = null, take = null } = {}) {
  return request('/rest/v1/rpc/rewards_get_allocations', {
    method: 'POST',
    body: { skip, take },
  });
}

export async function getRewardsAllocationsSummary(limit = 30) {
  return request('/rest/v1/rpc/rewards_get_allocations_summary', {
    method: 'POST',
    params: { limit: String(limit) },
  });
}

export async function getLicenses({ role = 'ulo', pageSize = 100 } = {}) {
  const licenses = [];

  for (let page = 1; page <= 50; page += 1) {
    const res = await fetchWithAuth(`${BASE_URL}/functions/v1/licenses_get_licenses`, {
      method: 'POST',
      body: {
        role,
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to load licenses (${res.status})`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    licenses.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return licenses;
}

// --- Withdrawal endpoints ---

export async function getWithdrawals() {
  return request('/rest/v1/rpc/rewards_get_withdrawals', { method: 'POST' });
}

export async function requestWithdrawalQuote({ amountMicros, walletAddress, chain, asset }) {
  const res = await fetchWithAuth(`${BASE_URL}/functions/v1/rewards_request_withdrawal_quote`, {
    method: 'POST',
    body: { amountMicros, walletAddress, chain, asset, timestamp: Date.now() },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Quote request failed (${res.status})`);
  }

  return res.json();
}

export async function submitWithdrawal({ quote, walletAddress, chain }) {
  const res = await fetchWithAuth(`${BASE_URL}/functions/v1/rewards_request_withdrawal`, {
    method: 'POST',
    body: {
      type: 'crypto',
      chain,
      asset: quote.asset,
      assetAmount: quote.assetAmount,
      quote,
      walletAddress,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Withdrawal failed (${res.status})`);
  }

  return res.json();
}
