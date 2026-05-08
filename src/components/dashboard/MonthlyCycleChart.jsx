import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { useIsMobile } from '../../hooks/useIsMobile';

const BAR_COLORS = [
  '#6366f1', '#818cf8', '#06b6d4', '#22d3ee', '#a78bfa',
  '#67e8f9', '#7c3aed', '#38bdf8', '#8b5cf6', '#2dd4bf',
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const count = payload[0].payload?.count;
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
        ${val.toFixed(2)} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>UP</span>
      </p>
      {count !== undefined && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'monospace' }}>
          {count} allocation{count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default function MonthlyCycleChart({ data }) {
  const isMobile = useIsMobile();
  if (!data.length) return <div className="text-white/30 text-sm">No data yet</div>;

  const maxVal = Math.max(...data.map((d) => d.amount));

  return (
    <div>
      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            {data.map((_, i) => (
              <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={0.95} />
                <stop offset="100%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={0.4} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
            stroke="rgba(255,255,255,0.04)"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}
            stroke="rgba(255,255,255,0.04)"
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(99,102,241,0.06)', radius: 4 }}
          />
          <Bar
            dataKey="amount"
            radius={[6, 6, 0, 0]}
            isAnimationActive
            animationDuration={1500}
            animationEasing="ease-out"
            maxBarSize={48}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.key || i}
                fill={`url(#barGrad${i})`}
                fillOpacity={entry.amount === maxVal ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {data.slice(-5).map((d, i) => (
          <div key={d.key || i} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: BAR_COLORS[(data.length - 5 + i) % BAR_COLORS.length] }}
            />
            <span className="text-[9px] text-white/30 font-mono">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
