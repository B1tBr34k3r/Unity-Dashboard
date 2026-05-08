const STATUS_META = {
  online: {
    label: 'Online',
    toneClass: 'border-success/20 bg-success/10 text-success',
    dotClass: 'bg-success shadow-[0_0_12px_rgba(34,197,94,0.45)]',
  },
  offline: {
    label: 'Offline',
    toneClass: 'border-warning/20 bg-warning/10 text-warning',
    dotClass: 'bg-warning shadow-[0_0_12px_rgba(245,158,11,0.32)]',
  },
  unbound: {
    label: 'Unbound',
    toneClass: 'border-white/[0.08] bg-white/[0.04] text-white/45',
    dotClass: 'bg-white/30',
  },
  'below-min': {
    label: 'Below Min',
    toneClass: 'border-danger/20 bg-danger/10 text-danger',
    dotClass: 'bg-danger shadow-[0_0_12px_rgba(239,68,68,0.32)]',
  },
};

const SIZE_META = {
  sm: {
    rootClass: 'px-2 py-0.5 text-[10px]',
    dotClass: 'h-1.5 w-1.5',
  },
  md: {
    rootClass: 'px-2.5 py-1 text-xs',
    dotClass: 'h-2 w-2',
  },
};

function normalizeStatusKey(status) {
  return String(status || 'unbound').toLowerCase().replace(/\s+/g, '-');
}

export default function LicenseStatusBadge({ status = 'unbound', size = 'md', uppercase = false, className = '' }) {
  const normalizedStatus = normalizeStatusKey(status);
  const statusMeta = STATUS_META[normalizedStatus] || STATUS_META.unbound;
  const sizeMeta = SIZE_META[size] || SIZE_META.md;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium ${statusMeta.toneClass} ${sizeMeta.rootClass} ${className}`}
    >
      <span className={`${sizeMeta.dotClass} rounded-full shrink-0 ${statusMeta.dotClass}`} />
      <span className={uppercase ? 'uppercase tracking-[0.18em]' : ''}>{statusMeta.label}</span>
    </span>
  );
}