import { useState, useCallback } from 'react';
import { Wallet, Copy, Check, RefreshCw, CircleDot, AlertCircle } from 'lucide-react';
import { fetchAllWalletBalances } from '../data/payoutWallets';
import toast from 'react-hot-toast';

function formatBalance(value, symbol) {
  if (value === 0) return '0';
  if (symbol === 'USDT' || symbol === 'USDC') return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (symbol === 'SHIB') return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function formatUsd(value) {
  return '$' + Math.round(value).toLocaleString('en-US');
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Address copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function FundedBadge({ funded }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
      funded
        ? 'border-success/25 bg-success/10 text-success'
        : 'border-white/[0.08] bg-white/[0.04] text-white/30'
    }`}>
      {funded ? 'Funded' : 'Empty'}
    </span>
  );
}

function WalletCard({ wallet, index = 0 }) {
  const updated = new Date(wallet.lastUpdated);

  return (
    <article className="glass p-4 sm:p-5 stagger-item" style={{ animationDelay: `${index * 80}ms` }}>
      {/* Header: Network name + Funded badge */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base sm:text-lg font-semibold text-white">{wallet.network}</h3>
        <FundedBadge funded={wallet.funded} />
      </div>

      {/* Wallet address box */}
      <div className="mt-3 sm:mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/30">Wallet address</p>
          <CopyButton text={wallet.address} />
        </div>
        <p className="mt-1.5 sm:mt-2 break-all text-xs sm:text-sm text-white/60 font-mono leading-relaxed">{wallet.address}</p>
      </div>

      {/* Token rows */}
      <div className="mt-3 sm:mt-4 space-y-2">
        {wallet.tokens.map((token) => (
          <div
            key={token.symbol}
            className={`flex items-center justify-between rounded-xl border px-2.5 sm:px-3 py-2.5 sm:py-3 ${
              token.funded
                ? 'border-success/15 bg-success/[0.04]'
                : 'border-white/[0.06] bg-white/[0.02]'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/90">{token.symbol}</p>
              <p className="mt-0.5 text-[11px] sm:text-xs text-white/35 truncate max-w-[140px] sm:max-w-none">
                {formatBalance(token.balance, token.symbol)} {token.symbol}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-white/80">{formatUsd(token.usdValue)}</p>
              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-medium ${
                token.funded
                  ? 'border-success/20 bg-success/10 text-success'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/25'
              }`}>
                {token.funded ? 'Funded' : 'Empty'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Last updated */}
      <p className="mt-4 text-xs text-white/20">
        Last updated: {updated.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
    </article>
  );
}

function ErrorCard({ network, error, index = 0 }) {
  return (
    <article className="glass p-4 sm:p-5 opacity-60 stagger-item" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{network}</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/25 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger/80">
          <AlertCircle size={12} /> Failed
        </span>
      </div>
      <p className="mt-3 text-xs text-white/30">{error?.message || 'Could not fetch balance'}</p>
    </article>
  );
}

export default function PayoutWalletsPage() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadWallets = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchAllWalletBalances();
      setWallets(data);
      setHasLoaded(true);
    } catch (err) {
      toast.error('Failed to fetch wallet balances');
    } finally {
      setLoading(false);
    }
  }, []);

  const totalFunded = wallets.filter((w) => w?.funded).length;
  const totalUsd = wallets.reduce((s, w) => s + (w?.totalUsd || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header card */}
      <div className="glass p-4 sm:p-6 fade-slide-up">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <span className="inline-flex rounded-full border border-success/25 bg-success/10 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold text-success">
              Live Payout Wallets
            </span>
            <h1 className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-white">Live Payout Wallet Balances</h1>
            <p className="mt-1.5 sm:mt-2 max-w-2xl text-xs sm:text-sm text-white/40">
              Wallet balances stay unchanged until you press Refresh, so this page never refetches on its own.
            </p>
          </div>
          <button
            onClick={() => void loadWallets()}
            disabled={loading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl glass-subtle text-xs sm:text-sm text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all self-start shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Summary bar */}
        {hasLoaded ? (
          <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-6">
            {wallets.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <CircleDot size={14} className="text-success" />
                  <span className="text-xs sm:text-sm text-white/50">
                    <span className="text-white/80 font-medium">{totalFunded}</span> / {wallets.length} networks funded
                  </span>
                </div>
                <div className="text-xs sm:text-sm text-white/50">
                  Total across all wallets: <span className="text-white/80 font-semibold">{formatUsd(totalUsd)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs sm:text-sm text-white/40">
                No payout wallet data was returned on the last refresh.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-white/[0.06]">
            <p className="text-xs sm:text-sm text-white/40">
              Press Refresh to load the latest payout wallet balances. Until then, this page makes no balance requests.
            </p>
          </div>
        )}
      </div>

      {/* Wallet cards — responsive grid */}
      {hasLoaded ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {wallets.map((wallet, i) =>
            wallet?.network ? (
              <WalletCard key={wallet.network} wallet={wallet} index={i} />
            ) : (
              <ErrorCard key={i} network={['Ethereum', 'BSC', 'Solana', 'XRP'][i]} error={wallet} index={i} />
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
