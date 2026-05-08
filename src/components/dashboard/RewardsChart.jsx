import { useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

function formatUsd(value) {
  return `$${value.toFixed(2)}`;
}

function formatShare(value) {
  return `${value.toFixed(1)}%`;
}

function formatShortDate(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getDistributionProfile({ leaderShare, tailShare, halfCoverageCount, contributorCount }) {
  const halfCoverageRatio = contributorCount ? halfCoverageCount / contributorCount : 0;

  if (leaderShare >= 30 || halfCoverageRatio <= 0.16) {
    return {
      label: 'Top Heavy',
      message: 'A small group is doing most of the work in this range.',
    };
  }

  if (tailShare >= 65 || halfCoverageRatio >= 0.38) {
    return {
      label: 'Wide Spread',
      message: 'Rewards are spread across a long tail instead of a tight core.',
    };
  }

  return {
    label: 'Balanced Mix',
    message: 'Leaders matter, but the mid-pack is still carrying visible weight.',
  };
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
        runnerUp: null,
        contributorCount: 0,
        averageAmount: 0,
        medianAmount: 0,
        leaderGap: 0,
        leaderShare: 0,
        visibleClusterShare: 0,
        tailShare: 0,
        halfCoverageCount: 0,
        eightyCoverageCount: 0,
        segmentShares: [],
        profile: null,
      };
    }

    const totalAmount = normalizedData.reduce((sum, item) => sum + item.amount, 0);
    const contributorCount = normalizedData.length;
    const maxVisibleItems = isMobile ? 2 : 3;
    const topEntries = normalizedData.slice(0, maxVisibleItems);
    const tailEntries = normalizedData.slice(maxVisibleItems);
    const tailAmount = tailEntries.reduce((sum, item) => sum + item.amount, 0);

    const compactEntries = topEntries.map((item, index) => ({
      ...item,
      rank: index + 1,
      share: totalAmount ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0,
      relativeWidth: topEntries[0]?.amount ? Math.max(10, (item.amount / topEntries[0].amount) * 100) : 0,
      isLeader: index === 0,
    }));

    const topContributor = normalizedData[0];
    const runnerUp = normalizedData[1] || null;
    const averageAmount = totalAmount / contributorCount;
    const middleIndex = Math.floor(contributorCount / 2);
    const medianAmount = contributorCount % 2 === 0
      ? (normalizedData[middleIndex - 1].amount + normalizedData[middleIndex].amount) / 2
      : normalizedData[middleIndex].amount;
    const leaderGap = runnerUp ? topContributor.amount - runnerUp.amount : topContributor.amount;
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

    const visibleClusterShare = totalAmount
      ? (topEntries.reduce((sum, item) => sum + item.amount, 0) / totalAmount) * 100
      : 0;
    const tailShare = totalAmount ? (tailAmount / totalAmount) * 100 : 0;
    const profile = getDistributionProfile({
      leaderShare,
      tailShare,
      halfCoverageCount,
      contributorCount,
    });

    return {
      topEntries: compactEntries,
      topContributor,
      runnerUp,
      contributorCount,
      averageAmount: Number(averageAmount.toFixed(2)),
      medianAmount: Number(medianAmount.toFixed(2)),
      leaderGap: Number(leaderGap.toFixed(2)),
      leaderShare,
      visibleClusterShare,
      tailShare,
      halfCoverageCount,
      eightyCoverageCount,
      segmentShares: [
        { label: 'Leader', share: leaderShare, toneClass: 'from-emerald-400 to-cyan-400' },
        { label: 'Chasers', share: Math.max(0, visibleClusterShare - leaderShare), toneClass: 'from-indigo-500 to-violet-400' },
        { label: 'Tail', share: tailShare, toneClass: 'from-slate-500 to-slate-700' },
      ].filter((segment) => segment.share > 0.2),
      profile,
    };
  }, [data, isMobile]);

  if (!chartModel.topEntries.length) {
    return <div className="text-white/30 text-sm">No data yet</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Rewarded</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.contributorCount}</p>
          <p className="text-[10px] text-white/35 mt-1">Licenses paid in range</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Leader Share</p>
          <p className="text-sm font-semibold text-white mt-1">{formatShare(chartModel.leaderShare)}</p>
          <p className="text-[10px] text-white/35 mt-1">Of visible rewards</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Gap To #2</p>
          <p className="text-sm font-semibold text-white mt-1">{formatUsd(chartModel.leaderGap)}</p>
          <p className="text-[10px] text-white/35 mt-1">{chartModel.runnerUp ? `${chartModel.topContributor?.name} vs ${chartModel.runnerUp.name}` : 'Single rewarded leader'}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">50% Point</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.halfCoverageCount}</p>
          <p className="text-[10px] text-white/35 mt-1">Licenses to reach 50%</p>
        </div>
      </div>

      <div className="glass-subtle rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30">Top Contributors</p>
            <p className="text-[11px] text-white/35 mt-1">Highest earners in the current visible range</p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
            {chartModel.halfCoverageCount} to 50%
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
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
                  <div className="flex items-center justify-between gap-3 mt-1.5 text-[10px] text-white/35">
                    <span>{entry.count} reward entry{entry.count !== 1 ? 'ies' : 'y'} · Last {formatShortDate(entry.latestDate)}</span>
                    <span>{formatShare(entry.share)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${entry.isLeader ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-indigo-500 to-violet-400'}`}
                        style={{ width: `${entry.relativeWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 h-2.5 rounded-full overflow-hidden bg-white/[0.05] flex">
          {chartModel.segmentShares.map((segment) => (
            <div
              key={segment.label}
              className={`h-full bg-gradient-to-r ${segment.toneClass}`}
              style={{ width: `${segment.share}%` }}
              title={`${segment.label}: ${segment.share.toFixed(1)}%`}
            />
          ))}
        </div>

        <p className="text-[11px] text-white/35 mt-3">
          {chartModel.topContributor?.name || 'The current leader'} leads with {formatUsd(chartModel.topContributor?.amount || 0)} UP. Top {chartModel.topEntries.length} licenses account for {formatShare(chartModel.visibleClusterShare)}, while the remaining tail still carries {formatShare(chartModel.tailShare)}.
        </p>
      </div>
    </div>
  );
}
