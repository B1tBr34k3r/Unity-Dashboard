// Payout wallet configuration and on-chain balance fetching
// Uses CORS-friendly public endpoints with fallbacks

const WALLETS = {
  ethereum: {
    network: 'Ethereum',
    address: '0x0aeCF37A2118e179BAcEa59FBab4f52c7467626A',
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://rpc.ankr.com/eth',
    ],
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    tokens: [
      { symbol: 'USDT', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      { symbol: 'USDC', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'SHIB', contract: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18 },
    ],
  },
  bsc: {
    network: 'BSC',
    address: '0xf026ea9101557c82d4c772eeda030b8a7bf7bf9f',
    rpcs: [
      'https://bsc-dataseed1.binance.org',
      'https://bsc-rpc.publicnode.com',
      'https://rpc.ankr.com/bsc',
    ],
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    tokens: [
      { symbol: 'USDT', contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
      { symbol: 'USDC', contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    ],
  },
  solana: {
    network: 'Solana',
    address: 'BcSEuHLka4Vfu4oyfYSdYBYPjYL3cDh6hoXJvuixYV6i',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
  },
  xrp: {
    network: 'XRP',
    address: 'raE89sxxTmcL6AcZbFm9mgDDZUXaF4ZJJM',
    nativeSymbol: 'XRP',
    nativeDecimals: 6,
  },
};

// ── Helpers ──

async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Try multiple RPCs until one works and returns non-zero
async function tryRpcs(rpcs, buildBody) {
  for (const rpc of rpcs) {
    try {
      const res = await fetchWithTimeout(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const json = await res.json();
      if (json.result && json.result !== '0x' && json.result !== '0x0') {
        return json.result;
      }
      // Got a response but zero — try next RPC (might be rate-limited)
    } catch {
      // CORS or network error — try next
    }
  }
  // All RPCs returned zero or failed — return whatever last gave us
  return null;
}

function hexToDecimal(hex, decimals) {
  if (!hex || hex === '0x' || hex === '0x0') return 0;
  const big = BigInt(hex);
  const divisor = BigInt(10 ** decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6);
  return parseFloat(`${whole}.${fracStr}`);
}

// ── EVM balance fetching with RPC fallbacks ──

async function evmGetNativeBalance(rpcs, address) {
  const result = await tryRpcs(rpcs, () => ({
    jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
    params: [address, 'latest'],
  }));
  return hexToDecimal(result, 18);
}

async function evmGetTokenBalance(rpcs, tokenContract, walletAddress, decimals) {
  const paddedAddr = walletAddress.slice(2).toLowerCase().padStart(64, '0');
  const data = '0x70a08231' + paddedAddr;

  const result = await tryRpcs(rpcs, () => ({
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: tokenContract, data }, 'latest'],
  }));
  return hexToDecimal(result, decimals);
}

// ── Solana — try multiple endpoints ──

const SOLANA_RPCS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
];

async function getSolanaBalance(address) {
  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetchWithTimeout(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getBalance',
          params: [address],
        }),
      });
      const { result } = await res.json();
      const val = (result?.value ?? 0) / 1e9;
      if (val > 0) return val;
    } catch {
      // try next
    }
  }
  return 0;
}

// ── XRP (xrplcluster — works) ──

async function getXrpBalance(address) {
  const res = await fetchWithTimeout('https://xrplcluster.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_info',
      params: [{ account: address, ledger_index: 'validated' }],
    }),
  });
  const data = await res.json();
  const drops = data?.result?.account_data?.Balance ?? '0';
  return parseInt(drops, 10) / 1e6;
}

// ── Prices (CoinGecko free API) ──

async function fetchPrices() {
  const ids = 'ethereum,binancecoin,solana,ripple,tether,usd-coin,shiba-inu';
  try {
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    const data = await res.json();
    return {
      ETH: data.ethereum?.usd ?? 0,
      BNB: data.binancecoin?.usd ?? 0,
      SOL: data.solana?.usd ?? 0,
      XRP: data.ripple?.usd ?? 0,
      USDT: data.tether?.usd ?? 1,
      USDC: data['usd-coin']?.usd ?? 1,
      SHIB: data['shiba-inu']?.usd ?? 0,
    };
  } catch {
    // Fallback hardcoded approximate prices if CoinGecko fails
    return { ETH: 2000, BNB: 600, SOL: 80, XRP: 1.34, USDT: 1, USDC: 1, SHIB: 0.000006 };
  }
}

// ── Main fetch function ──

export async function fetchAllWalletBalances() {
  const prices = await fetchPrices();

  const results = await Promise.allSettled([
    fetchEvmWallet('ethereum', prices),
    fetchEvmWallet('bsc', prices),
    fetchSolanaWallet(prices),
    fetchXrpWallet(prices),
  ]);

  return results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason));
}

async function fetchEvmWallet(key, prices) {
  const w = WALLETS[key];
  const [nativeBal, ...tokenBals] = await Promise.all([
    evmGetNativeBalance(w.rpcs, w.address),
    ...w.tokens.map((t) => evmGetTokenBalance(w.rpcs, t.contract, w.address, t.decimals)),
  ]);

  const tokens = [
    {
      symbol: w.nativeSymbol,
      balance: nativeBal,
      usdValue: nativeBal * (prices[w.nativeSymbol] || 0),
      funded: nativeBal > 0,
    },
    ...w.tokens.map((t, i) => ({
      symbol: t.symbol,
      balance: tokenBals[i],
      usdValue: tokenBals[i] * (prices[t.symbol] || 0),
      funded: tokenBals[i] > 0,
    })),
  ];

  const totalUsd = tokens.reduce((s, t) => s + t.usdValue, 0);

  return {
    network: w.network,
    address: w.address,
    tokens,
    totalUsd,
    funded: totalUsd > 0,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchSolanaWallet(prices) {
  const w = WALLETS.solana;
  const balance = await getSolanaBalance(w.address);
  const usdValue = balance * (prices.SOL || 0);

  return {
    network: w.network,
    address: w.address,
    tokens: [{ symbol: 'SOL', balance, usdValue, funded: balance > 0 }],
    totalUsd: usdValue,
    funded: usdValue > 0,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchXrpWallet(prices) {
  const w = WALLETS.xrp;
  const balance = await getXrpBalance(w.address);
  const usdValue = balance * (prices.XRP || 0);

  return {
    network: w.network,
    address: w.address,
    tokens: [{ symbol: 'XRP', balance, usdValue, funded: balance > 0 }],
    totalUsd: usdValue,
    funded: usdValue > 0,
    lastUpdated: new Date().toISOString(),
  };
}

export { WALLETS };
