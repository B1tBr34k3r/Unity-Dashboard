import { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { useIsMobile } from '../../hooks/useIsMobile';

const BAR_COLORS = [
  '#6366f1', '#818cf8', '#06b6d4', '#22d3ee', '#a78bfa',
  '#67e8f9', '#7c3aed', '#38bdf8', '#8b5cf6', '#2dd4bf',
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        background: 'rgba(12,12,30,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#818cf8', fontFamily: 'monospace' }}>
        ${point.amount.toFixed(2)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>UP</span>
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'monospace' }}>
        {point.count} allocation{point.count !== 1 ? 's' : ''}
      </p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
        3-cycle trend ${point.movingAverage.toFixed(2)} UP
      </p>
      {point.deltaAmount !== null ? (
        <p style={{ fontSize: 10, color: point.deltaAmount >= 0 ? '#22c55e' : '#f59e0b', marginTop: 2 }}>
          {point.deltaAmount >= 0 ? '+' : ''}{point.deltaAmount.toFixed(2)} UP vs previous cycle
        </p>
      ) : null}
    </div>
  );
}

export default function MonthlyCycleChart({ data }) {
  const isMobile = useIsMobile();
  const chartModel = useMemo(() => {
    const normalizedData = (data || []).map((entry, index, entries) => {
      const windowEntries = entries.slice(Math.max(0, index - 2), index + 1);
      const movingAverage = windowEntries.reduce((sum, item) => sum + item.amount, 0) / windowEntries.length;
      const previousEntry = index > 0 ? entries[index - 1] : null;

      return {
        ...entry,
        movingAverage: Number(movingAverage.toFixed(2)),
        deltaAmount: previousEntry ? Number((entry.amount - previousEntry.amount).toFixed(2)) : null,
      };
    });

    if (!normalizedData.length) {
      return {
        series: [],
        averageAmount: 0,
        peakCycle: null,
        latestCycle: null,
      };
    }

    const totalAmount = normalizedData.reduce((sum, entry) => sum + entry.amount, 0);
    const peakCycle = normalizedData.reduce((bestEntry, entry) => (entry.amount > bestEntry.amount ? entry : bestEntry), normalizedData[0]);
    const latestCycle = normalizedData[normalizedData.length - 1];

    return {
      series: normalizedData.map((entry) => ({
        ...entry,
        isPeak: entry.key === peakCycle.key,
        isLatest: entry.key === latestCycle.key,
      })),
      averageAmount: totalAmount / normalizedData.length,
      peakCycle,
      latestCycle,
    };
  }, [data]);

  if (!chartModel.series.length) return <div className="text-white/30 text-sm">No data yet</div>;

  const latestDelta = chartModel.latestCycle?.deltaAmount;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Best Cycle</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.peakCycle?.label || '—'}</p>
          <p className="text-[10px] text-white/35 mt-1">{chartModel.peakCycle ? `$${chartModel.peakCycle.amount.toFixed(2)} UP` : '—'}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Average Cycle</p>
          <p className="text-sm font-semibold text-white mt-1">${chartModel.averageAmount.toFixed(2)}</p>
          <p className="text-[10px] text-white/35 mt-1">Across visible payout cycles</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Latest Cycle</p>
          <p className="text-sm font-semibold text-white mt-1">{chartModel.latestCycle?.label || '—'}</p>
          <p className="text-[10px] text-white/35 mt-1">{chartModel.latestCycle ? `$${chartModel.latestCycle.amount.toFixed(2)} UP` : '—'}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Cycle Change</p>
          <p className="text-sm font-semibold text-white mt-1">
            {latestDelta === null || latestDelta === undefined ? '—' : `${latestDelta >= 0 ? '+' : ''}$${latestDelta.toFixed(2)}`}
          </p>
          <p className="text-[10px] text-white/35 mt-1">Latest versus previous cycle</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 250 : 340}>
        <ComposedChart data={chartModel.series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="monthlyPeakBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#15803d" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="monthlyLatestBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#155e75" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="monthlyBaseBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#4338ca" stopOpacity={0.38} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)', radius: 4 }} />
          <ReferenceLine y={chartModel.averageAmount} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
          <Bar
            dataKey="amount"
            radius={[8, 8, 2, 2]}
            isAnimationActive
            animationDuration={1500}
            animationEasing="ease-out"
            maxBarSize={52}
          >
            {chartModel.series.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.isPeak ? 'url(#monthlyPeakBar)' : entry.isLatest ? 'url(#monthlyLatestBar)' : 'url(#monthlyBaseBar)'}
              />
            ))}
          </Bar>
          {chartModel.series.length > 1 ? (
            <Line
              type="monotone"
              dataKey="movingAverage"
              stroke="#67e8f9"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4, fill: '#67e8f9', stroke: 'rgba(10,10,26,0.9)', strokeWidth: 2 }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center gap-4 text-[10px] text-white/35 uppercase tracking-[0.18em]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" />
          Peak Cycle
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" />
          Latest Cycle
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-5 rounded-full bg-accent-cyan" />
          3-Cycle Trend
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-5 rounded-full border-t border-dashed border-white/40" />
          Average Cycle
        </div>
      </div>
    </div>
  );
}
