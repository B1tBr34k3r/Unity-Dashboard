import { User, X } from 'lucide-react';

const COLORS = [
  { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', dot: '#6366f1' },   // indigo
  { bg: 'rgba(6,182,212,0.15)', text: '#22d3ee', dot: '#06b6d4' },    // cyan
  { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', dot: '#22c55e' },    // green
  { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', dot: '#f59e0b' },   // amber
  { bg: 'rgba(236,72,153,0.15)', text: '#f472b6', dot: '#ec4899' },   // pink
  { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', dot: '#a855f7' },   // purple
  { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf', dot: '#14b8a6' },   // teal
  { bg: 'rgba(251,146,60,0.15)', text: '#fb923c', dot: '#f97316' },   // orange
];

function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getOperatorColor(name) {
  return COLORS[hashName(name) % COLORS.length];
}

export default function OperatorBadge({ name, onRemove, size = 'sm' }) {
  if (!name) return null;

  const color = getOperatorColor(name);
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${
        isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ background: color.bg, color: color.text }}
    >
      <User size={isSmall ? 9 : 11} />
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full hover:bg-white/10 p-0.5"
        >
          <X size={isSmall ? 8 : 10} />
        </button>
      )}
    </span>
  );
}
