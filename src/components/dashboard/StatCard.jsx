export default function StatCard({ icon: Icon, label, value, sub, color = 'text-white' }) {
  return (
    <div className="glass p-3 sm:p-5 hover:bg-white/[0.05] transition-all duration-300 group relative overflow-hidden">
      {/* Subtle glow behind icon */}
      <div
        className="absolute -top-4 -left-4 w-20 h-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl pointer-events-none"
        style={{
          background: color === 'text-success' ? 'rgba(16,185,129,0.12)'
            : color === 'text-accent-light' ? 'rgba(99,102,241,0.12)'
            : color === 'text-warning' ? 'rgba(245,158,11,0.1)'
            : 'rgba(255,255,255,0.04)',
        }}
      />
      <div className="flex items-start gap-2.5 sm:gap-4 relative">
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/[0.06] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
          <Icon size={18} className={`${color} sm:w-5 sm:h-5`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider">{label}</p>
          <p className={`text-lg sm:text-2xl font-bold ${color} mt-0.5 sm:mt-1 truncate`}>{value}</p>
          {sub && <p className="text-[10px] sm:text-xs text-white/30 mt-0.5 sm:mt-1 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
