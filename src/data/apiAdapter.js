// Unity Edge API Adapter (Supabase-based)
// Base: https://api.unityedge.io
// Auth: Supabase JWT via email login
// Anon key required as `apikey` header on all requests

const BASE_URL = 'https://api.unityedge.io';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TOKEN_STORAGE_KEY = 'unity_edge_token';
const REFRESH_TOKEN_STORAGE_KEY = 'unity_edge_refresh_token';

function readSessionValue(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeSessionValue(storageKey, value) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage write failures and let auth requests fail naturally.
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failures for old persistent auth keys.
  }
}

function removeSessionValue(storageKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore session storage failures.
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failures for old persistent auth keys.
  }
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
  return readSessionValue(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  writeSessionValue(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  removeSessionValue(TOKEN_STORAGE_KEY);
}

function getRefreshToken() {
  return readSessionValue(REFRESH_TOKEN_STORAGE_KEY);
}

function setRefreshToken(refreshToken) {
  writeSessionValue(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
}

export function clearRefreshToken() {
  removeSessionValue(REFRESH_TOKEN_STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

// --- Core request ---

async function request(path, { method = 'GET', body, params, headers: extraHeaders } = {}) {
  const token = getToken();
  const anonKey = getAnonKey();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...extraHeaders,
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired. Please log in again.');
  }
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
  return request('/auth/v1/user');
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
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
    throw new Error(getApiErrorMessage(err, 'Session refresh failed'));
  }

  const data = await res.json();
  setToken(data.access_token);
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token);
  }
  return data;
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
  const token = getToken();
  const anonKey = getAnonKey();
  const licenses = [];

  for (let page = 1; page <= 50; page += 1) {
    const res = await fetch(`${BASE_URL}/functions/v1/licenses_get_licenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        role,
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    });

    if (res.status === 401) {
      clearToken();
      throw new Error('Session expired. Please log in again.');
    }

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
  const token = getToken();
  const anonKey = getAnonKey();
  const res = await fetch(`${BASE_URL}/functions/v1/rewards_request_withdrawal_quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ amountMicros, walletAddress, chain, asset, timestamp: Date.now() }),
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Quote request failed (${res.status})`);
  }

  return res.json();
}

export async function submitWithdrawal({ quote, walletAddress, chain }) {
  const token = getToken();
  const anonKey = getAnonKey();
  const res = await fetch(`${BASE_URL}/functions/v1/rewards_request_withdrawal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      type: 'crypto',
      chain,
      asset: quote.asset,
      assetAmount: quote.assetAmount,
      quote,
      walletAddress,
    }),
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Withdrawal failed (${res.status})`);
  }

  return res.json();
}
