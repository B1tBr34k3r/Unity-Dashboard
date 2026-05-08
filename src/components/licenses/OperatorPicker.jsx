import { useState, useRef, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import OperatorBadge from './OperatorBadge';

export default function OperatorPicker({ value, allOperators, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = allOperators.filter(
    (op) => op.toLowerCase().includes(input.toLowerCase()) && op !== value
  );

  const select = (name) => {
    onChange(name);
    setOpen(false);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      select(input.trim());
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setInput('');
    }
  };

  if (value) {
    return (
      <OperatorBadge name={value} onRemove={onRemove} size="sm" />
    );
  }

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
      >
        <UserPlus size={10} />
        <span className="hidden sm:inline">Assign</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-44 sm:w-48 glass-strong rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type name or pick..."
              className="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
            />
          </div>
          {filtered.length > 0 && (
            <div className="max-h-32 overflow-y-auto px-1 pb-1" style={{ scrollbarWidth: 'thin' }}>
              {filtered.map((op) => (
                <button
                  key={op}
                  onClick={() => select(op)}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white rounded-lg transition-colors"
                >
                  {op}
                </button>
              ))}
            </div>
          )}
          {input.trim() && !allOperators.some((op) => op.toLowerCase() === input.trim().toLowerCase()) && (
            <div className="px-1 pb-1">
              <button
                onClick={() => select(input.trim())}
                className="w-full text-left px-2.5 py-1.5 text-xs text-accent-light hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                + Create "{input.trim()}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
