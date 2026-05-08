import { useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

function formatUsd(value) {
  return `$${value.toFixed(2)}`;
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
        visibleLicenseCount: 0,
        topContributor: null,
        topContributorShare: 0,
        topFiveShare: 0,
        topTenShare: 0,
        othersCount: 0,
        othersShare: 0,
        halfCoverageCount: 0,
        eightyCoverageCount: 0,
        leaderAmount: 0,
        segmentShares: [],
      };
    }

    const totalAmount = normalizedData.reduce((sum, item) => sum + item.amount, 0);
    const maxVisibleItems = isMobile ? 6 : 9;
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
    const topTenAmount = normalizedData.slice(0, 10).reduce((sum, item) => sum + item.amount, 0);
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
    const topTenShare = totalAmount ? (topTenAmount / totalAmount) * 100 : 0;
    const nextFourShare = Math.max(0, topFiveShare - topContributorShare);
    const nextFiveShare = Math.max(0, topTenShare - topFiveShare);
    const tailShare = totalAmount ? (tailAmount / totalAmount) * 100 : 0;

    return {
      topEntries: leaderboardEntries,
      visibleLicenseCount: normalizedData.length,
      topContributor,
      topContributorShare,
      topFiveShare,
      topTenShare,
      othersCount: tailEntries.length,
      othersShare: tailShare,
      halfCoverageCount,
      eightyCoverageCount,
      leaderAmount,
      segmentShares: [
        { label: 'Top 1', share: topContributorShare, toneClass: 'from-emerald-400 to-cyan-400' },
        { label: 'Next 4', share: nextFourShare, toneClass: 'from-indigo-500 to-violet-400' },
        { label: 'Next 5', share: nextFiveShare, toneClass: 'from-cyan-400 to-sky-500' },
        { label: 'Tail', share: Math.max(0, 100 - topTenShare), toneClass: 'from-slate-500 to-slate-700' },
      ].filter((segment) => segment.share > 0.2),
    };
  }, [data, isMobile]);

  if (!chartModel.topEntries.length) return <div className="text-white/30 text-sm">No data yet</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Top License</p>
          <p className="text-sm font-semibold text-white mt-1 truncate">{chartModel.topContributor?.name || '—'}</p>
          <p className="text-[10px] text-white/35 mt-1">{chartModel.topContributor ? `${formatUsd(chartModel.topContributor.amount)} UP` : '—'}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Leader Share</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.topContributorShare.toFixed(1)}%</p>
          <p className="text-[10px] text-white/35 mt-1">Of visible rewards</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Half Reward Point</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.halfCoverageCount}</p>
          <p className="text-[10px] text-white/35 mt-1">Licenses needed for 50%</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Long Tail Share</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.othersShare.toFixed(1)}%</p>
          <p className="text-[10px] text-white/35 mt-1">
            {chartModel.othersCount ? `${chartModel.othersCount} in the long tail` : 'All shown directly'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr,0.95fr] gap-4 sm:gap-5">
        <div className="space-y-3">
          {chartModel.topEntries.map((entry) => (
            <div key={entry.id} className="glass-subtle rounded-xl p-3.5">
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
                      <p className="text-[10px] text-white/35 mt-1">{entry.share.toFixed(1)}% share</p>
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

        <div className="space-y-4">
          <div className="glass-subtle rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Reward Concentration</p>
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
            <div className="grid grid-cols-2 gap-2 mt-4">
              {chartModel.segmentShares.map((segment) => (
                <div key={segment.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">{segment.label}</p>
                  <p className="text-sm font-semibold text-white mt-1">{segment.share.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-subtle rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Coverage Pressure</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Top 5</p>
                <p className="text-sm font-semibold text-white mt-1">{chartModel.topFiveShare.toFixed(1)}%</p>
                <p className="text-[10px] text-white/35 mt-1">Reward share</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Top 10</p>
                <p className="text-sm font-semibold text-white mt-1">{chartModel.topTenShare.toFixed(1)}%</p>
                <p className="text-[10px] text-white/35 mt-1">Reward share</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/30">50% Point</p>
                <p className="text-sm font-semibold text-white mt-1">{chartModel.halfCoverageCount}</p>
                <p className="text-[10px] text-white/35 mt-1">Licenses needed</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/30">80% Point</p>
                <p className="text-sm font-semibold text-white mt-1">{chartModel.eightyCoverageCount}</p>
                <p className="text-[10px] text-white/35 mt-1">Licenses needed</p>
              </div>
            </div>
            <p className="text-[11px] text-white/35 mt-4">
              {chartModel.topContributor?.name || 'The current leader'} leads with {formatUsd(chartModel.leaderAmount)} UP, while the long tail still carries {chartModel.othersShare.toFixed(1)}% of visible rewards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
