import { useState, useMemo } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { usePersistentPageState } from '../../hooks/usePersistentPageState';

const PRESETS = [
  { label: 'All Time', value: 'all', days: null },
  { label: 'Today', value: 'today', days: 0 },
  { label: 'Last 7 Days', value: '7d', days: 7 },
  { label: 'Last 30 Days', value: '30d', days: 30 },
  { label: 'Last 90 Days', value: '90d', days: 90 },
  { label: 'Custom', value: 'custom', days: null },
];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useDateRangeFilter(data, dateAccessor = (item) => item.completedAt, storageKeyBase = null) {
  const [preset, setPreset] = usePersistentPageState(
    storageKeyBase ? `${storageKeyBase}:preset` : null,
    'all'
  );
  const [customFrom, setCustomFrom] = usePersistentPageState(
    storageKeyBase ? `${storageKeyBase}:custom-from` : null,
    ''
  );
  const [customTo, setCustomTo] = usePersistentPageState(
    storageKeyBase ? `${storageKeyBase}:custom-to` : null,
    ''
  );

  const filtered = useMemo(() => {
    if (!data?.length) return data || [];

    if (preset === 'all') return data;

    let from, to;

    if (preset === 'custom') {
      from = customFrom ? startOfDay(customFrom) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23, 59, 59, 999)) : null;
      if (!from && !to) return data;
    } else if (preset === 'today') {
      from = startOfDay(new Date());
      to = new Date();
    } else {
      const p = PRESETS.find((pr) => pr.value === preset);
      from = daysAgo(p.days);
      to = new Date();
    }

    return data.filter((item) => {
      const d = new Date(dateAccessor(item));
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [data, preset, customFrom, customTo, dateAccessor]);

  return { filtered, preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo };
}

export default function DateRangeFilter({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const [open, setOpen] = useState(false);

  const activeLabel = PRESETS.find((p) => p.value === preset)?.label || 'All Time';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 glass text-xs sm:text-sm text-white/60 hover:text-white"
      >
        <Calendar size={14} />
        <span>{activeLabel}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-30 glass-strong p-2 min-w-[200px]">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setPreset(p.value);
                  if (p.value !== 'custom') setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  preset === p.value
                    ? 'bg-accent/20 text-accent-light'
                    : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}

            {preset === 'custom' && (
              <div className="border-t border-white/[0.06] mt-2 pt-2 px-2 space-y-2">
                <div>
                  <label className="text-[10px] text-white/30 uppercase tracking-wider">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/30 uppercase tracking-wider">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-accent/50"
                  />
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full mt-1 px-3 py-1.5 btn-gradient rounded-lg text-xs"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
