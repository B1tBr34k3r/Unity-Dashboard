import { useState } from 'react';
import { sendOtp, verifyOtp, loginWithToken, getUser } from '../data/apiAdapter';
import toast from 'react-hot-toast';
import { Mail, KeyRound, ChevronRight } from 'lucide-react';

export default function LoginPage({ onLogin }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await sendOtp(email.trim());
      toast.success('OTP sent! Check your email');
      setStep('otp');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    try {
      await verifyOtp(email.trim(), otp.trim());
      toast.success('Logged in successfully');
      onLogin();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTokenLogin = async (e) => {
    e.preventDefault();
    const cleaned = token.trim().replace(/^Bearer\s+/i, '');
    if (!cleaned) return;
    setLoading(true);
    try {
      loginWithToken(cleaned);
      await getUser();
      toast.success('Connected successfully');
      onLogin();
    } catch {
      toast.error('Invalid or expired token');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] backdrop-blur transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/unity-icon.png" alt="Unity" className="w-16 h-16 rounded-2xl mx-auto mb-5 shadow-lg shadow-accent/30" />
          <h1 className="text-3xl font-bold text-gradient">Unity Nodes</h1>
          <p className="text-sm text-white/40 mt-2">Sign in with your Unity Edge account</p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="glass-strong p-6 space-y-4 glow-accent">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass + ' pl-10'} autoFocus />
              </div>
            </div>
            <button type="submit" disabled={loading || !email.trim()} className="w-full flex items-center justify-center gap-2 py-3 btn-gradient rounded-xl text-sm disabled:opacity-50">
              {loading ? 'Sending...' : 'Send OTP'}
              {!loading && <ChevronRight size={16} />}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="glass-strong p-6 space-y-4 glow-accent">
            <div className="text-center mb-2">
              <p className="text-sm text-white/50">OTP sent to <span className="text-white">{email}</span></p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Enter OTP Code</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" className={inputClass + ' pl-10 text-center tracking-[0.3em] text-lg'} autoFocus maxLength={6} />
              </div>
            </div>
            <button type="submit" disabled={loading || !otp.trim()} className="w-full py-3 btn-gradient rounded-xl text-sm disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setStep('email'); setOtp(''); }} className="text-xs text-white/30 hover:text-white/60">Change email</button>
              <button type="button" onClick={async () => { try { await sendOtp(email.trim()); toast.success('OTP resent'); } catch (err) { toast.error(err.message); } }} className="text-xs text-accent-light hover:text-accent">Resend OTP</button>
            </div>
          </form>
        )}

        {step === 'token' && (
          <form onSubmit={handleTokenLogin} className="glass-strong p-6 space-y-4 glow-accent">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Bearer Token</label>
              <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." rows={4} className={inputClass + ' resize-none font-mono text-xs'} autoFocus />
            </div>
            <button type="submit" disabled={loading || !token.trim()} className="w-full py-3 btn-gradient rounded-xl text-sm disabled:opacity-50">
              {loading ? 'Verifying...' : 'Connect'}
            </button>
          </form>
        )}

        <div className="text-center mt-5">
          {step !== 'token' ? (
            <button onClick={() => setStep('token')} className="text-xs text-white/25 hover:text-white/50 transition-colors">Or paste a Bearer token instead</button>
          ) : (
            <button onClick={() => setStep('email')} className="text-xs text-white/25 hover:text-white/50 transition-colors">Or sign in with email OTP</button>
          )}
        </div>
      </div>
    </div>
  );
}
