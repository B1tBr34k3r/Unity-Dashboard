// Unity Edge API Adapter (Supabase-based)
// Base: https://api.unityedge.io
// Auth: Supabase JWT via email login
// Anon key required as `apikey` header on all requests

const BASE_URL = 'https://api.unityedge.io';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TOKEN_STORAGE_KEY = 'unity_edge_token';
const REFRESH_TOKEN_STORAGE_KEY = 'unity_edge_refresh_token';
const USER_STORAGE_KEY = 'unity_edge_user';
const CUSTOM_DASHBOARD_DATA_METADATA_KEY = 'unity_dashboard_custom_data';
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
    throw new Error('Missing VITE_SUPABASE_ANON_KEY. Add it to your local .env file before running the app.');
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

export async function clearLegacyCustomDashboardMetadata() {
  if (!isAuthenticated()) {
    throw new Error('Session expired. Please log in again.');
  }

  const currentUser = readStoredUser() || await getUser();
  const currentMetadata = currentUser?.user_metadata && typeof currentUser.user_metadata === 'object' && !Array.isArray(currentUser.user_metadata)
    ? currentUser.user_metadata
    : {};
  const hasLegacyMetadata = Object.prototype.hasOwnProperty.call(currentMetadata, CUSTOM_DASHBOARD_DATA_METADATA_KEY)
    && currentMetadata[CUSTOM_DASHBOARD_DATA_METADATA_KEY] !== null;

  if (!hasLegacyMetadata) {
    return { changed: false, user: currentUser };
  }

  const nextUser = await request('/auth/v1/user', {
    method: 'PUT',
    body: {
      data: {
        ...currentMetadata,
        [CUSTOM_DASHBOARD_DATA_METADATA_KEY]: null,
      },
    },
  });

  writeStoredUser(nextUser);

  return { changed: true, user: nextUser };
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
