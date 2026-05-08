import { useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

function formatUsd(value) {
  return `$${value.toFixed(2)}`;
}

function formatShare(value) {
  return `${value.toFixed(1)}%`;
}

export default function RewardsChart({ data }) {
  const isMobile = useIsMobile();
  const chartModel = useMemo(() => {
    const normalizedData = (data || [])
      .filter((item) => typeof item.amount === 'number' && item.amount > 0)
      .sort((left, right) => right.amount - left.amount);

    if (!normalizedData.length) {
      return {
        topEntries: [],
        topContributor: null,
        leaderShare: 0,
        visibleClusterShare: 0,
        tailShare: 0,
        halfCoverageCount: 0,
        eightyCoverageCount: 0,
        segmentShares: [],
      };
    }

    const totalAmount = normalizedData.reduce((sum, item) => sum + item.amount, 0);
    const maxVisibleItems = isMobile ? 3 : 4;
    const topEntries = normalizedData.slice(0, maxVisibleItems);
    const tailEntries = normalizedData.slice(maxVisibleItems);
    const tailAmount = tailEntries.reduce((sum, item) => sum + item.amount, 0);
    let runningAmount = 0;

    const compactEntries = topEntries.map((item, index) => {
      runningAmount += item.amount;

      return {
        ...item,
        rank: index + 1,
        share: totalAmount ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0,
        cumulativeShare: totalAmount ? Number(((runningAmount / totalAmount) * 100).toFixed(1)) : 0,
        relativeWidth: topEntries[0]?.amount ? Math.max(10, (item.amount / topEntries[0].amount) * 100) : 0,
        isLeader: index === 0,
      };
    });

    const topContributor = normalizedData[0];
    const leaderShare = totalAmount ? (topContributor.amount / totalAmount) * 100 : 0;

    let halfCoverageCount = 0;
    let eightyCoverageCount = 0;
    let cumulativeAmount = 0;

    normalizedData.forEach((item, index) => {
      cumulativeAmount += item.amount;
      const share = totalAmount ? cumulativeAmount / totalAmount : 0;

      if (!halfCoverageCount && share >= 0.5) {
        halfCoverageCount = index + 1;
      }

      if (!eightyCoverageCount && share >= 0.8) {
        eightyCoverageCount = index + 1;
      }
    });

    const visibleClusterShare = totalAmount ? (topEntries.reduce((sum, item) => sum + item.amount, 0) / totalAmount) * 100 : 0;
    const tailShare = totalAmount ? (tailAmount / totalAmount) * 100 : 0;

    return {
      topEntries: compactEntries,
      topContributor,
      leaderShare,
      visibleClusterShare,
      tailShare,
      halfCoverageCount,
      eightyCoverageCount,
      segmentShares: [
        { label: 'Leader', share: leaderShare, toneClass: 'from-emerald-400 to-cyan-400' },
        { label: `Next ${Math.max(0, topEntries.length - 1)}`, share: Math.max(0, visibleClusterShare - leaderShare), toneClass: 'from-indigo-500 to-violet-400' },
        { label: 'Tail', share: tailShare, toneClass: 'from-slate-500 to-slate-700' },
      ].filter((segment) => segment.share > 0.2),
    };
  }, [data, isMobile]);

  if (!chartModel.topEntries.length) return <div className="text-white/30 text-sm">No data yet</div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.05fr,0.95fr] gap-3 sm:gap-4">
      <div className="glass-subtle rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30">Contributor Snapshot</p>
            <p className="text-[11px] text-white/35 mt-1">Current top earners in the visible range</p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
            {chartModel.halfCoverageCount} to 50%
          </span>
        </div>

        <div className="space-y-2.5">
          {chartModel.topEntries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <div className={`h-7 w-7 shrink-0 rounded-full border text-[11px] font-semibold flex items-center justify-center ${entry.isLeader ? 'border-success/40 bg-success/15 text-success' : 'border-white/10 bg-white/[0.04] text-white/55'}`}>
                  {entry.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white truncate">{entry.name}</p>
                    <span className="text-sm font-semibold text-white shrink-0">{formatUsd(entry.amount)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${entry.isLeader ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-indigo-500 to-violet-400'}`}
                        style={{ width: `${entry.relativeWidth}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white/40 shrink-0">{formatShare(entry.share)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-subtle rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Leader</p>
            <p className="text-sm font-semibold text-white mt-1 truncate">{chartModel.topContributor?.name || '—'}</p>
            <p className="text-[10px] text-white/35 mt-1">{formatShare(chartModel.leaderShare)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Shown Cluster</p>
            <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.visibleClusterShare)}</p>
            <p className="text-[10px] text-white/35 mt-1">Top {chartModel.topEntries.length}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Tail Share</p>
            <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.tailShare)}</p>
            <p className="text-[10px] text-white/35 mt-1">All remaining licenses</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">80% Point</p>
            <p className="text-sm font-semibold text-white mt-1">{chartModel.eightyCoverageCount}</p>
            <p className="text-[10px] text-white/35 mt-1">Licenses to reach 80%</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">Reward Split</p>
          <div className="mt-3 h-3 rounded-full overflow-hidden bg-white/[0.05] flex">
            {chartModel.segmentShares.map((segment) => (
              <div
                key={segment.label}
                className={`h-full bg-gradient-to-r ${segment.toneClass}`}
                style={{ width: `${segment.share}%` }}
                title={`${segment.label}: ${segment.share.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 mt-3">
            {chartModel.segmentShares.map((segment) => (
              <div key={segment.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${segment.toneClass}`} />
                  <span>{segment.label}</span>
                </div>
                <span className="text-sm font-semibold text-white">{formatShare(segment.share)}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/35">
          {chartModel.topContributor?.name || 'The current leader'} leads with {formatUsd(chartModel.topContributor?.amount || 0)} UP, and {chartModel.halfCoverageCount} licenses are enough to generate half of the visible reward flow.
        </p>
      </div>
    </div>
  );
}
