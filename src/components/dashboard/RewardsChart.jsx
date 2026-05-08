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
        topContributorShare: 0,
        topFiveShare: 0,
        othersCount: 0,
        othersShare: 0,
        halfCoverageCount: 0,
        eightyCoverageCount: 0,
        leaderAmount: 0,
        segmentShares: [],
      };
    }

    const totalAmount = normalizedData.reduce((sum, item) => sum + item.amount, 0);
    const maxVisibleItems = isMobile ? 4 : 5;
    const topEntries = normalizedData.slice(0, maxVisibleItems);
    const tailEntries = normalizedData.slice(maxVisibleItems);
    const tailAmount = tailEntries.reduce((sum, item) => sum + item.amount, 0);
    let runningAmount = 0;

    const leaderboardEntries = topEntries.map((item, index) => {
      runningAmount += item.amount;

      return {
      ...item,
      rank: index + 1,
      share: totalAmount ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0,
      cumulativeShare: totalAmount ? Number(((runningAmount / totalAmount) * 100).toFixed(1)) : 0,
      relativeWidth: topEntries[0]?.amount ? Math.max(8, (item.amount / topEntries[0].amount) * 100) : 0,
      isLeader: index === 0,
      };
    });

    const topContributor = normalizedData[0];
    const topContributorShare = totalAmount ? (topContributor.amount / totalAmount) * 100 : 0;
    const topFiveAmount = normalizedData.slice(0, 5).reduce((sum, item) => sum + item.amount, 0);
    const leaderAmount = topContributor.amount;

    let halfCoverageCount = 0;
    let eightyCoverageCount = 0;
    let cumulativeMicros = 0;

    normalizedData.forEach((item, index) => {
      cumulativeMicros += item.amount;
      const share = totalAmount ? cumulativeMicros / totalAmount : 0;

      if (!halfCoverageCount && share >= 0.5) {
        halfCoverageCount = index + 1;
      }

      if (!eightyCoverageCount && share >= 0.8) {
        eightyCoverageCount = index + 1;
      }
    });

    const topFiveShare = totalAmount ? (topFiveAmount / totalAmount) * 100 : 0;
    const visibleClusterShare = totalAmount ? (topEntries.reduce((sum, item) => sum + item.amount, 0) / totalAmount) * 100 : 0;
    const nextContributorsShare = Math.max(0, visibleClusterShare - topContributorShare);
    const tailShare = totalAmount ? (tailAmount / totalAmount) * 100 : 0;

    return {
      topEntries: leaderboardEntries,
      topContributor,
      topContributorShare,
      topFiveShare,
      othersCount: tailEntries.length,
      othersShare: tailShare,
      halfCoverageCount,
      eightyCoverageCount,
      leaderAmount,
      segmentShares: [
        { label: 'Leader', share: topContributorShare, toneClass: 'from-emerald-400 to-cyan-400' },
        { label: `Next ${Math.max(0, topEntries.length - 1)}`, share: nextContributorsShare, toneClass: 'from-indigo-500 to-violet-400' },
        { label: 'Tail', share: tailShare, toneClass: 'from-slate-500 to-slate-700' },
      ].filter((segment) => segment.share > 0.2),
    };
  }, [data, isMobile]);

  if (!chartModel.topEntries.length) return <div className="text-white/30 text-sm">No data yet</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Leader</p>
          <p className="text-sm font-semibold text-white mt-1 truncate">{chartModel.topContributor?.name || '—'}</p>
          <p className="text-[10px] text-white/35 mt-1">{chartModel.topContributor ? formatUsd(chartModel.topContributor.amount) : '—'}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Leader Share</p>
          <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.topContributorShare)}</p>
          <p className="text-[10px] text-white/35 mt-1">Of visible rewards</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Top 5 Share</p>
          <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.topFiveShare)}</p>
          <p className="text-[10px] text-white/35 mt-1">Reward concentration</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">50% Point</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.halfCoverageCount}</p>
          <p className="text-[10px] text-white/35 mt-1">Licenses to hit half</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-4 sm:gap-5">
        <div className="glass-subtle rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30">Top Contributors</p>
              <p className="text-[11px] text-white/35 mt-1">Highest earners in the current range</p>
            </div>
            <p className="text-[10px] text-white/35">80% point: {chartModel.eightyCoverageCount}</p>
          </div>

          <div className="space-y-3">
          {chartModel.topEntries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-full border text-[11px] font-semibold flex items-center justify-center ${entry.isLeader ? 'border-success/40 bg-success/15 text-success' : 'border-white/10 bg-white/[0.04] text-white/55'}`}>
                  {entry.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.name}</p>
                      <p className="text-[10px] text-white/35 mt-1">
                        {entry.count} allocation{entry.count !== 1 ? 's' : ''}
                        {entry.latestDate ? ` · Latest ${new Date(entry.latestDate).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white">{formatUsd(entry.amount)}</p>
                      <p className="text-[10px] text-white/35 mt-1">{formatShare(entry.share)}</p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${entry.isLeader ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-indigo-500 to-violet-400'}`}
                      style={{ width: `${entry.relativeWidth}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-white/35">
                    <span>Relative to leader</span>
                    <span>{entry.cumulativeShare.toFixed(1)}% cumulative</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>

        <div className="glass-subtle rounded-xl p-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30">Reward Split</p>
            <p className="text-[11px] text-white/35 mt-1">How much the leader cluster carries versus the tail</p>
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
          </div>

          <div className="grid grid-cols-1 gap-2">
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

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Tail Share</p>
              <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.othersShare)}</p>
              <p className="text-[10px] text-white/35 mt-1">{chartModel.othersCount} licenses</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Leader Value</p>
              <p className="text-sm font-semibold text-white mt-1">{formatUsd(chartModel.leaderAmount)}</p>
              <p className="text-[10px] text-white/35 mt-1">Current top earner</p>
            </div>
          </div>

          <p className="text-[11px] text-white/35">
            {chartModel.topContributor?.name || 'The current leader'} leads with {formatUsd(chartModel.leaderAmount)} UP, and {chartModel.halfCoverageCount} licenses are enough to generate half of the visible reward flow.
          </p>
        </div>
      </div>
    </div>
  );
}
