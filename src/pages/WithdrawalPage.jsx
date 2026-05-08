import { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, AlertCircle, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2, Copy } from 'lucide-react';
import { requestWithdrawalQuote, submitWithdrawal, getWithdrawals } from '../data/apiAdapter';
import { WithdrawalSkeleton } from '../components/common/Skeleton';
import { microsToUsd, formatUsd, formatDateShort, truncateHex } from '../utils/formatters';
import toast from 'react-hot-toast';

const CHAINS = [
  { id: 'eth', label: 'Ethereum', color: '#627EEA', assets: ['eth', 'usdt', 'usdc', 'shib'] },
  { id: 'bsc', label: 'Binance Chain', color: '#F3BA2F', assets: ['bnb', 'usdt', 'usdc'] },
  { id: 'sol', label: 'Solana', color: '#00FFA3', assets: ['sol', 'usdt', 'usdc'] },
  { id: 'xrp', label: 'Ripple XRP', color: '#4A5568', assets: ['xrp'] },
  { id: 'ada', label: 'Cardano', color: '#0033AD', assets: ['ada'] },
];

const ADDRESS_RULES = {
  eth: { regex: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
  bsc: { regex: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
  sol: { regex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, hint: 'Must be a valid Base58 Solana address' },
  xrp: { regex: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, hint: 'Must start with r (25–35 characters)' },
  ada: { regex: /^addr1[a-z0-9]{50,}$/, hint: 'Must start with addr1' },
};

function validateAddress(chain, address) {
  if (!chain || !address) return null;
  const rule = ADDRESS_RULES[chain];
  if (!rule) return null;
  return rule.regex.test(address.trim()) ? null : rule.hint;
}

function QuoteCountdown({ expiresAt, onExpire }) {
  const [seconds, setSeconds] = useState(() => {
    const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSeconds(diff);
      if (diff <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <span className={`text-sm font-bold ${seconds <= 10 ? 'text-danger' : 'text-white'}`}>
      {mins}:{secs}
    </span>
  );
}

function getWithdrawalStatus(w) {
  if (w.completedAt) return 'completed';
  if (w.failedAt) return 'failed';
  if (w.settlement?.status) return w.settlement.status;
  return 'pending';
}

// USDT icon matching the official UI
function UsdtIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 17 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M0.512 7.094L3.43 0.93C3.439 0.91 3.454 0.892 3.474 0.88C3.493 0.867 3.515 0.861 3.538 0.861H13.463C13.486 0.861 13.508 0.868 13.527 0.88C13.546 0.892 13.561 0.91 13.571 0.931L16.488 7.094C16.499 7.117 16.503 7.143 16.498 7.168C16.494 7.193 16.481 7.216 16.463 7.234L8.583 14.828C8.561 14.849 8.531 14.861 8.5 14.861C8.469 14.861 8.439 14.849 8.417 14.828L0.537 7.233C0.519 7.216 0.507 7.193 0.502 7.168C0.497 7.143 0.501 7.117 0.512 7.094ZM13.477 6.963C13.477 6.422 11.776 5.971 9.512 5.865V4.639H12.303V2.769H4.705V4.639H7.495V5.865C5.227 5.97 3.522 6.422 3.522 6.964C3.522 7.505 5.227 7.956 7.495 8.062V11.992H9.512V8.06C11.775 7.955 13.477 7.504 13.477 6.963ZM8.512 7.749C9.163 7.749 9.456 7.731 9.512 7.727L9.51 7.726C11.511 7.637 13.003 7.286 13.003 6.867C13.003 6.448 11.51 6.097 9.51 6.008V7.378C9.454 7.383 9.143 7.409 8.521 7.409C8.002 7.409 7.627 7.387 7.496 7.377V6.007C5.492 6.097 3.996 6.447 3.996 6.867C3.996 7.287 5.492 7.638 7.496 7.727C7.625 7.733 7.993 7.749 8.512 7.749Z" fill="#26A17B" />
    </svg>
  );
}

function WithdrawalHistory({ withdrawals, expanded, setExpanded }) {
  if (!withdrawals.length) return null;

  const displayed = expanded ? withdrawals : withdrawals.slice(0, 5);

  const handleCopy = (addr) => {
    navigator.clipboard.writeText(addr);
    toast.success('Address copied');
  };

  return (
    <div className="glass p-4 sm:p-6 fade-slide-up" style={{ animationDelay: '150ms' }}>
      <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Withdrawals</h2>
      <div className="space-y-3">
        {displayed.map((w, i) => {
          const req = w.request || {};
          const quote = req.quote || {};
          const walletAddr = req.walletAddress;
          const status = getWithdrawalStatus(w);

          return (
            <div
              key={w.id || i}
              className="rounded-[9px] bg-[#1e293b] p-4 space-y-1.5 stagger-item"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UsdtIcon />
                  <span className="text-sm text-white">{truncateHex(walletAddr, 4, 4)}</span>
                  {walletAddr && (
                    <button onClick={() => handleCopy(walletAddr)} className="text-white/30 hover:text-white/60">
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <span className="text-sm text-white">- {formatUsd(microsToUsd(w.amountMicros))}</span>
              </div>
              <div className="text-sm">
                {status === 'completed' || status === 'success' ? (
                  <span>
                    <span className="text-emerald-500">completed</span>
                    {w.createdAt && <span className="text-white/40"> / {formatDateShort(w.createdAt)}</span>}
                  </span>
                ) : status === 'failed' ? (
                  <span>
                    <span className="text-red-400">failed</span>
                    {w.createdAt && <span className="text-white/40"> / {formatDateShort(w.createdAt)}</span>}
                  </span>
                ) : (
                  <span>
                    <span className="text-amber-400">{status}</span>
                    {w.createdAt && <span className="text-white/40"> / {formatDateShort(w.createdAt)}</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {withdrawals.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mx-auto mt-3 text-xs text-white/30 hover:text-white/60"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Show less' : `Show all ${withdrawals.length}`}
        </button>
      )}
    </div>
  );
}

export default function WithdrawalPage({ api }) {
  const { balance, isLoading: apiLoading, refetch } = api;
  const availableUsd = balance !== null ? microsToUsd(balance) : '0.00';

  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [chain, setChain] = useState('');
  const [asset, setAsset] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteExpiry, setQuoteExpiry] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Withdrawal history
  const [withdrawals, setWithdrawals] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getWithdrawals();
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setWithdrawals(list);
        }
      } catch {
        // silently fail - history is non-critical
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedChain = CHAINS.find((c) => c.id === chain);
  const availableAssets = selectedChain?.assets || [];
  const addressError = validateAddress(chain, walletAddress);

  const canSubmit = amount && Number(amount) > 0 && Number(amount) <= Number(availableUsd) && walletAddress.trim() && chain && asset && !addressError && !submitting;

  const handleMax = () => {
    setAmount(availableUsd);
  };

  const handleRequestQuote = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const amountMicros = Math.round(Number(amount) * 1_000_000);
      const data = await requestWithdrawalQuote({
        amountMicros,
        walletAddress: walletAddress.trim(),
        chain,
        asset,
      });
      setQuote(data);
      setQuoteExpiry(data.expiresAt || Date.now() + 30_000);
      setShowConfirm(true);
    } catch (err) {
      toast.error(err.message || 'Failed to get withdrawal quote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!quote) return;

    setConfirming(true);
    try {
      await submitWithdrawal({
        quote,
        walletAddress: walletAddress.trim(),
        chain,
      });
      toast.success('Withdrawal request submitted successfully');
      setShowConfirm(false);
      setQuote(null);
      setAmount('');
      setWalletAddress('');
      setChain('');
      setAsset('');
      // Refresh balance and history
      refetch();
      const data = await getWithdrawals();
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setWithdrawals(list);
    } catch (err) {
      toast.error(err.message || 'Withdrawal failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleQuoteExpire = useCallback(() => {
    setShowConfirm(false);
    setQuote(null);
    toast.error('Quote expired. Please request a new one.');
  }, []);

  if (apiLoading) return <WithdrawalSkeleton />;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="fade-slide-up">
        <h1 className="text-lg sm:text-2xl font-bold text-white">Withdraw</h1>
        <p className="text-xs sm:text-sm text-white/40 mt-1">
          Withdraw your rewards to a crypto wallet
        </p>
      </div>

      {/* Withdrawal form */}
      <div className="glass p-4 sm:p-6 space-y-5 sm:space-y-6 fade-slide-up" style={{ animationDelay: '50ms' }}>
        {/* Amount */}
        <div className="space-y-2">
          <label className="text-sm sm:text-base font-bold text-white">Withdraw Details</label>
          <p className="text-xs sm:text-sm text-white/50">
            Available to redeem: <span className="font-bold">{formatUsd(availableUsd)}</span>
          </p>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              max={availableUsd}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount to redeem"
              className="w-full px-4 py-3 sm:py-3.5 pr-16 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-accent/50 focus:bg-white/[0.06]"
            />
            <button
              onClick={handleMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-medium text-accent-light hover:text-accent"
            >
              Max
            </button>
          </div>
          {amount && Number(amount) > Number(availableUsd) && (
            <p className="text-xs text-danger flex items-center gap-1">
              <AlertCircle size={12} /> Exceeds available balance
            </p>
          )}
        </div>

        {/* Wallet Address */}
        <div className="space-y-2">
          <label className="text-sm sm:text-base font-bold text-white">Wallet Address</label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Enter destination address"
            className="w-full px-4 py-3 sm:py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] font-mono"
          />
          {walletAddress && addressError ? (
            <p className="text-xs text-danger flex items-center gap-1">
              <AlertCircle size={12} /> {addressError}
            </p>
          ) : (
            <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed">
              <span className="font-bold text-white/50">Enter a valid crypto address.</span>{' '}
              Crypto sent to the wrong address cannot be recovered. Ensure you are using the correct network and a secure wallet.
            </p>
          )}
        </div>

        {/* Chain selection */}
        <div className="space-y-2">
          <label className="text-sm sm:text-base font-bold text-white">Select Chain</label>
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setChain(c.id);
                  // Auto-select asset if chain has only one, otherwise reset
                  setAsset(c.assets.length === 1 ? c.assets[0] : '');
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm transition-all ${
                  chain === c.id
                    ? 'border-accent/50 bg-accent/10 text-white'
                    : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Asset selection (shown when chain has multiple assets) */}
        {chain && availableAssets.length > 1 && (
          <div className="space-y-2">
            <label className="text-sm sm:text-base font-bold text-white">Select Asset</label>
            <div className="flex flex-wrap gap-2">
              {availableAssets.map((a) => (
                <button
                  key={a}
                  onClick={() => setAsset(a)}
                  className={`px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                    asset === a
                      ? 'border-accent/50 bg-accent/10 text-white'
                      : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                  }`}
                >
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleRequestQuote}
          disabled={!canSubmit}
          className="w-full h-12 flex items-center justify-between px-5 font-semibold text-sm sm:text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-white text-black border border-white hover:bg-white/90"
          style={{ clipPath: 'polygon(100% 0, 100% calc(100% - 1rem), calc(100% - 1rem) 100%, 0 100%, 0 0)' }}
        >
          <span>Withdraw Rewards</span>
          {submitting ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <ArrowUpRight size={20} />
          )}
        </button>
      </div>

      {/* Withdrawal History */}
      {!historyLoading && (
        <WithdrawalHistory
          withdrawals={withdrawals}
          expanded={historyExpanded}
          setExpanded={setHistoryExpanded}
        />
      )}

      {/* Confirmation Modal */}
      {showConfirm && quote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div
            className="relative w-full max-w-md glass-strong p-5 sm:p-6 space-y-5 fade-slide-up"
            style={{ background: 'rgba(14, 23, 42, 0.95)' }}
          >
            {/* Close */}
            <button
              onClick={() => setShowConfirm(false)}
              className="absolute top-4 right-4 text-white/30 hover:text-white/60 text-lg"
            >
              &times;
            </button>

            <h3 className="text-lg font-bold text-white">Confirm Withdrawal</h3>

            {/* Countdown */}
            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.06]">
              <span className="text-sm text-white/50">Quote expires in:</span>
              <QuoteCountdown expiresAt={quoteExpiry} onExpire={handleQuoteExpire} />
            </div>

            {/* Quote details */}
            <div className="space-y-0">
              <QuoteRow label="Amount" value={formatUsd(microsToUsd(quote.originalAmountMicros))} />
              <QuoteRow label="Fee" value={formatUsd(microsToUsd(quote.exchangeFeeMicros))} />
              <QuoteRow label="Asset" value={(quote.asset || asset || '').toUpperCase()} />
              <QuoteRow label="Asset Amount" value={quote.assetAmount} last />
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 rounded-xl font-semibold text-sm sm:text-base transition-all disabled:opacity-50 bg-white text-black hover:bg-white/90"
            >
              {confirming ? <Loader2 size={18} className="animate-spin" /> : null}
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteRow({ label, value, last }) {
  return (
    <>
      <div className="flex items-center justify-between py-3 sm:py-4">
        <span className="text-sm sm:text-base text-white/50">{label}</span>
        <span className="text-sm sm:text-base font-bold text-white">{value}</span>
      </div>
      {!last && <div className="h-px bg-white/[0.08]" />}
    </>
  );
}
