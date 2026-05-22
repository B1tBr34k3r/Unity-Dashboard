import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowLeft, Copy, Pencil, Check, X } from 'lucide-react';
import HoverRevealText from '../components/common/HoverRevealText';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useOperatorTags } from '../hooks/useOperatorTags';
import LicenseTagPicker from '../components/licenses/LicenseTagPicker';
import LicenseStatusBadge from '../components/licenses/LicenseStatusBadge';
import OperatorPicker from '../components/licenses/OperatorPicker';
import { aggregateByRewardMonth, formatDateShort, formatRewardDayLabel, microsDetailed, truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, formatLeaseTimeLeft, formatLicenseDistribution, formatTaggedLicenseName, getLicenseBackendName, getLicenseDisplayName, getLicenseOriginalBackendName } from '../utils/licenseDisplay';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { LicenseDetailSkeleton } from '../components/common/Skeleton';
import DateRangeFilter, { useDateRangeFilter } from '../components/common/DateRangeFilter';

export default function LicenseDetailPage({ api }) {
  const { id } = useParams();
  const decodedId = decodeURIComponent(id);
  const { user, allocations, licenses: licenseMetadata, isLoading } = api;

  // All daily reward logs for this license
  const allLogs = useMemo(() => {
    return (allocations || [])
      .filter((a) => a.licenseId === decodedId)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  }, [allocations, decodedId]);

  const dateRange = useDateRangeFilter(allLogs);
  const logs = dateRange.filtered;

  const monthData = useMemo(() => aggregateByRewardMonth(logs), [logs]);
  const hasRewardData = allLogs.length > 0;

  const totalReward = logs.reduce((sum, a) => sum + a.amountMicros, 0);
  const { getLabel, setLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, setPresetTag, presetTags, cloneTagOrder, workTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator, setOperator, allOperators } = useOperatorTags(user?.id);

  // Chart data
  const chartData = logs.map((a) => ({
    date: formatRewardDayLabel(a.completedAt),
    reward: Number((a.amountMicros / 1_000_000).toFixed(4)),
  }));

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenseMetadata || []).map((license) => [license.id, license])),
    [licenseMetadata]
  );
  const tagIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId]), {
      clone: cloneTagOrder,
      work: workTagOrder,
    }),
    [presetTags, licenseInfoById, cloneTagOrder, workTagOrder]
  );

  const licenseDetails = useMemo(
    () => (licenseMetadata || []).find((license) => license.id === decodedId) || null,
    [licenseMetadata, decodedId]
  );
  const backendName = getLicenseBackendName(licenseDetails);
  const originalBackendName = getLicenseOriginalBackendName(licenseDetails);
  const originalIdentityName = originalBackendName && originalBackendName !== backendName ? originalBackendName : '';
  const label = getLabel(decodedId);
  const presetTag = getPresetTag(decodedId);
  const tagIndex = tagIndexById[decodedId] || null;
  const latestRewardAt = logs.length ? logs[logs.length - 1].completedAt : null;
  const latestValidationAt = licenseDetails?.validationLastSuccessAt || null;
  const latestDate = (() => {
    const rewardTs = latestRewardAt ? new Date(latestRewardAt).getTime() : 0;
    const validationTs = latestValidationAt ? new Date(latestValidationAt).getTime() : 0;
    const latest = validationTs > rewardTs ? latestValidationAt : latestRewardAt;
    return latest ? new Date(latest).toLocaleDateString() : '—';
  })();
  const uptimePercentage =
    typeof licenseDetails?.uptime === 'number' ? Number((licenseDetails.uptime * 100).toFixed(2)) : null;
  const minUptime =
    typeof licenseDetails?.leaseMinUptimePercentage === 'number'
      ? licenseDetails.leaseMinUptimePercentage
      : null;
  const statusKey = !licenseDetails?.deviceId && !licenseDetails?.deviceName
    ? 'unbound'
    : licenseDetails?.isOnline
      ? 'online'
      : 'offline';
  const deviceSummary = backendName || licenseDetails?.deviceId || 'No device bound';
  const distributionLabel = formatLicenseDistribution(licenseDetails?.leaseSharePercentage);
  const leaseTimeLeft = formatLeaseTimeLeft(licenseDetails?.leaseTo);
  const taggedName = formatTaggedLicenseName(backendName, presetTag, tagIndex);
  const displayName = getLicenseDisplayName({ customLabel: label, backendName, presetTag, tagIndex });
  const operator = getOperator(decodedId);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const copyId = () => {
    navigator.clipboard.writeText(decodedId);
    toast.success('License ID copied');
  };

  const startEditing = () => {
    setEditValue(displayName || '');
    setEditing(true);
  };

  const saveLabel = () => {
    const success = setLabel(decodedId, editValue);
    if (success) setEditing(false);
  };

  if (isLoading) return <LicenseDetailSkeleton />;

  if (!licenseDetails && !allLogs.length) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link to="/licenses" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">License Not Found</h1>
        </div>
        <p className="text-white/40">No reward data found for this license.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link to="/licenses" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40 shrink-0 mt-0.5">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLabel();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    placeholder="e.g. Phone-01, Laptop..."
                    className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-base sm:text-lg text-white placeholder-white/30 focus:outline-none focus:border-accent/50 w-full max-w-[200px]"
                    autoFocus
                  />
                  <button onClick={saveLabel} className="text-success hover:text-success/80 p-1">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60 p-1">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <HoverRevealText
                    as="h1"
                    text={displayName || 'License Details'}
                    className="text-xl sm:text-2xl font-bold text-white truncate"
                    wrapperClassName="flex-1 min-w-0"
                  />
                  <button onClick={startEditing} className="text-white/20 hover:text-white/60 shrink-0">
                    <Pencil size={14} />
                  </button>
                  <LicenseTagPicker
                    value={presetTag}
                    onChange={(tag) => setPresetTag(decodedId, tag)}
                    onRemove={() => setPresetTag(decodedId, '')}
                  />
                  <OperatorPicker
                    value={operator}
                    allOperators={allOperators}
                    onChange={(name) => setOperator(decodedId, name)}
                    onRemove={() => setOperator(decodedId, '')}
                  />
                </div>
              )}
              {(label && backendName) || (label && taggedName) ? (
                <HoverRevealText
                  as="p"
                  text={taggedName ? `Auto tag name: ${taggedName}` : `Device: ${backendName}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              ) : null}
              {!label && presetTag && backendName && (
                <HoverRevealText
                  as="p"
                  text={`Tag preset: ${presetTag}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              )}
              {originalIdentityName && (
                <HoverRevealText
                  as="p"
                  text={`Original identity: ${originalIdentityName}`}
                  className="text-xs sm:text-sm text-white/25 mt-1 truncate"
                />
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs sm:text-sm text-white/30 font-mono truncate">{truncateHex(decodedId, 8, 6)}</span>
                <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>
            {hasRewardData && <DateRangeFilter {...dateRange} />}
          </div>
        </div>
      </div>

      {/* Stats + License ID row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Total Earned</p>
          <p className="text-base sm:text-xl font-bold text-success mt-0.5 sm:mt-1 truncate">${microsDetailed(totalReward)}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">UP</p>
        </div>
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Entries</p>
          <p className="text-base sm:text-xl font-bold text-white mt-0.5 sm:mt-1">{logs.length}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">reward logs</p>
        </div>
        <div className="glass p-2.5 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Last Active</p>
          <p className="text-base sm:text-xl font-bold text-white/70 mt-0.5 sm:mt-1 truncate">{latestDate}</p>
        </div>
      </div>

      {licenseDetails && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Device</p>
            <HoverRevealText
              as="p"
              text={taggedName || deviceSummary}
              className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate"
            />
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {originalIdentityName ? `Original: ${originalIdentityName}` : 'Official metadata'}
            </p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Uptime</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">
              {uptimePercentage !== null ? `${uptimePercentage}%` : '—'}
            </p>
            <p className="text-[9px] sm:text-[10px] text-white/30">Min. {minUptime !== null ? `${minUptime}%` : '—'}</p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Status</p>
            <div className="mt-2">
              <LicenseStatusBadge status={statusKey} />
            </div>
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {latestValidationAt ? `Validated ${new Date(latestValidationAt).toLocaleDateString()}` : 'No validation yet'}
            </p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Distribution</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{distributionLabel}</p>
            <p className="text-[9px] sm:text-[10px] text-white/30">ULO and UNO cut</p>
          </div>
          <div className="glass p-2.5 sm:p-4">
            <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Lease Left</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{leaseTimeLeft}</p>
            <p className="text-[9px] sm:text-[10px] text-white/30">
              {licenseDetails?.leaseTo ? `Ends ${formatDateShort(licenseDetails.leaseTo)}` : 'No lease expiry'}
            </p>
          </div>
        </div>
      )}

      {/* License ID compact */}
      <div className="glass-subtle px-3 sm:px-4 py-2.5 sm:py-3 mb-4 sm:mb-6 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">License ID</p>
          <p className="text-xs text-white/50 font-mono truncate">{decodedId}</p>
        </div>
        <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0 ml-3 p-1">
          <Copy size={14} />
        </button>
      </div>

      {monthData.length > 0 && (
        <div className="glass p-4 sm:p-6 mb-4">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Monthly Rewards</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {monthData.map((month) => (
              <div key={month.key} className="glass-subtle p-3 rounded-xl">
                <p className="text-xs text-white/40">{month.label}</p>
                <p className="text-sm font-bold text-accent-light mt-1">${microsDetailed(month.totalMicros)} UP</p>
                <p className="text-[10px] text-white/20">{month.count} rewards</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reward chart — full width */}
      {chartData.length > 1 && (
        <div className="glass p-4 sm:p-6 mb-4">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Daily Rewards</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} stroke="rgba(255,255,255,0.06)" />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} stroke="rgba(255,255,255,0.06)" />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: 'rgba(10,10,26,0.9)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', fontSize: '13px', color: '#fff', padding: '10px 14px' }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                formatter={(val) => [`$${val} UP`, 'Reward']}
              />
              <Bar dataKey="reward" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!hasRewardData && (
        <div className="glass p-4 sm:p-6 mb-4 text-sm text-white/40">
          No reward data has been recorded for this license yet. Device status and uptime are still available from the official license metadata.
        </div>
      )}

      {/* Reward log — fixed card with scroll, same pattern as Licenses page */}
      <div className="glass overflow-hidden flex flex-col" style={{ maxHeight: '400px' }}>
        <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Reward Log</h2>
          <span className="text-xs text-white/20">{logs.length} entries</span>
        </div>

        {/* Single table with sticky header */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-left text-sm table-fixed">
            <colgroup>
              <col className="w-28" />
              <col />
              <col className="w-32 hidden sm:table-column" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[#0d0d1f]">
              <tr className="border-b border-white/[0.06]">
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium">Date</th>
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium">Reward</th>
                <th className="py-2.5 px-4 text-xs text-white/30 font-medium hidden sm:table-cell">Type</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                [...logs].reverse().map((a) => (
                  <tr key={a.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2.5 px-4 text-white/40 text-xs sm:text-sm">{new Date(a.completedAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-4 text-accent-light font-medium text-xs sm:text-sm">${microsDetailed(a.amountMicros)} UP</td>
                    <td className="py-2.5 px-4 text-white/20 text-xs hidden sm:table-cell">{a.type?.replace(/_/g, ' ')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-sm text-white/35">
                    No reward entries yet for this license.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
