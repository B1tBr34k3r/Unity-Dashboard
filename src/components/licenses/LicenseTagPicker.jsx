import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Tag, X } from 'lucide-react';
import { LICENSE_TAG_PRESETS } from '../../utils/licenseDisplay';

export default function LicenseTagPicker({ value, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }

    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
          value
            ? 'border-accent/30 bg-accent/10 text-accent-light hover:bg-accent/20'
            : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white/65 hover:bg-white/[0.06]'
        }`}
      >
        <Tag size={10} />
        <span>{value || 'Tag'}</span>
        <ChevronDown size={10} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {value && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
            setOpen(false);
          }}
          className="rounded-full p-1 text-white/25 hover:bg-white/[0.06] hover:text-white/60"
          aria-label="Clear preset tag"
        >
          <X size={10} />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-40 glass-strong rounded-xl shadow-xl overflow-hidden">
          <div className="px-1 py-1.5">
            {LICENSE_TAG_PRESETS.map((preset) => {
              const active = preset === value;

              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onChange(preset);
                    setOpen(false);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'bg-accent/15 text-accent-light'
                      : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}