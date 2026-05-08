import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useIsMobile } from '../../hooks/useIsMobile';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
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
    </div>
  );
}

function renderDot(props) {
  const { cx, cy, index } = props;
  if (index === undefined) return null;
  return (
    <circle
      cx={cx} cy={cy} r={3}
      fill="#6366f1"
      stroke="rgba(10,10,26,0.9)"
      strokeWidth={1.5}
    />
  );
}

function renderActiveDot(props) {
  const { cx, cy } = props;
  return (
    <>
      <circle cx={cx} cy={cy} r={8} fill="#6366f1" fillOpacity={0.2} strokeWidth={0} />
      <circle cx={cx} cy={cy} r={4.5} fill="#818cf8" stroke="rgba(10,10,26,0.9)" strokeWidth={2} />
    </>
  );
}

export default function RewardsChart({ data }) {
  const isMobile = useIsMobile();
  if (!data.length) return <div className="text-white/30 text-sm">No data yet</div>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="rewardGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="50%" stopColor="#818cf8" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="rewardStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
            tickFormatter={(d) => d.length > 12 ? d.slice(0, 10) + '…' : d}
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
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(99,102,241,0.2)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="url(#rewardStroke)"
            fill="url(#rewardGrad)"
            strokeWidth={2.5}
            dot={renderDot}
            activeDot={renderActiveDot}
            isAnimationActive
            animationDuration={2000}
            animationEasing="ease-in-out"
            name="Rewards"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[2px] rounded" style={{ background: 'linear-gradient(90deg, #6366f1, #06b6d4)' }} />
          <span className="text-[9px] text-white/30 font-mono">Rewards per License</span>
        </div>
      </div>
    </div>
  );
}
