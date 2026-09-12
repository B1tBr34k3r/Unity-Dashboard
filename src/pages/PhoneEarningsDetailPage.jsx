import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft } from 'lucide-react';
import { DashboardSkeleton } from '../components/common/Skeleton';
import { usePhoneEarningsGroups } from '../hooks/usePhoneEarningsGroups';
import { microsDetailed, truncateHex } from '../utils/formatters';

function formatUsdFromNumber(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'rgba(12,12,30,0.95)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
      }}
    >
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ fontSize: 12, color: entry.color || '#f8fafc', marginTop: 3 }}>
          {entry.name || entry.dataKey}: {formatUsdFromNumber(entry.value)} UP
        </p>
      ))}
    </div>
  );
}

export default function PhoneEarningsDetailPage({ api }) {
  const { phoneName } = useParams();
  const decodedPhoneName = phoneName ? decodeURIComponent(phoneName) : '';
  const { user, licenses: licenseMetadata, allocations, isLoading } = api;
  const phoneGroups = usePhoneEarningsGroups({
    userId: user?.id,
    licenseMetadata,
    allocations: allocations || [],
  });
  const phoneGroup = useMemo(
    () => phoneGroups.find((group) => group.phoneName === decodedPhoneName) || null,
    [decodedPhoneName, phoneGroups]
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!phoneGroup) {
    return (
      <div className="space-y-4">
        <Link to="/phone-earnings" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
          <ArrowLeft size={16} /> Back to phone earnings
        </Link>
        <div className="glass p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Phone not found</h1>
          <p className="mt-2 text-sm text-white/40">This phone has no stored earnings in the current data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/phone-earnings" className="mb-4 inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
            <ArrowLeft size={16} /> Back to phone earnings
          </Link>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Phone Earnings Detail</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{phoneGroup.phoneName}</h1>
          <p className="mt-1 text-sm text-white/40">
            {phoneGroup.licenseCount} license{phoneGroup.licenseCount === 1 ? '' : 's'} · {phoneGroup.entries} rewards logged
          </p>
        </div>
        <div className="rounded-2xl border border-success/20 bg-success/10 px-5 py-4 sm:text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-success/70">Total Earned</p>
          <p className="mt-1 font-mono text-2xl font-bold text-success">{formatUsdFromNumber(phoneGroup.amount)} UP</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Reward</p>
          <p className="mt-1 text-lg font-semibold text-warning">${microsDetailed(phoneGroup.latestRewardMicros)} UP</p>
        </div>
        <div className="glass p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Average / License</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatUsdFromNumber(phoneGroup.averagePerLicense)} UP</p>
        </div>
        <div className="glass p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Rewards Logged</p>
          <p className="mt-1 text-lg font-semibold text-white">{phoneGroup.entries}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Daily Earnings</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={phoneGroup.dailyData} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
                <defs>
                  <linearGradient id="selectedPhoneArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="amount" name="Earned" stroke="#818cf8" strokeWidth={2.2} fill="url(#selectedPhoneArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Contribution Split</p>
          <div className="mt-4 space-y-3">
            {phoneGroup.licenses.slice(0, 8).map((license, index) => {
              const amount = license.totalMicros / 1_000_000;
              const share = phoneGroup.totalMicros ? (license.totalMicros / phoneGroup.totalMicros) * 100 : 0;

              return (
                <div key={license.licenseId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        #{index + 1} <span className="font-mono text-white/75">{truncateHex(license.licenseId, 8, 6)}</span>
                      </p>
                      <p className="mt-1 truncate text-xs text-white/35">{license.entries} rewards · {license.displayName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold text-success">{formatUsdFromNumber(amount)}</p>
                      <p className="text-xs text-white/35">{share.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-cyan" style={{ width: `${Math.max(2, Math.min(100, share))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/[0.06] px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-white/30">
          <span>License</span>
          <span>Rewards</span>
          <span>Total</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {phoneGroup.licenses.map((license) => (
            <div key={license.licenseId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-white/75">{license.displayName}</p>
                <p className="mt-0.5 font-mono text-[10px] text-white/25">{truncateHex(license.licenseId, 8, 6)}</p>
              </div>
              <p className="text-xs text-white/35">{license.entries}</p>
              <p className="font-mono text-sm font-semibold text-white">{`$${microsDetailed(license.totalMicros)}`}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
