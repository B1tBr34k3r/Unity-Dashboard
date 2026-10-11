import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar,
} from 'lucide-react';

export default function TimelineNavigator({
  data = [],
  valueKey = 'amount',
  labelKey = 'label',
  range = { startIndex: 0, endIndex: 0 },
  onChange,
  onResetMonth,
  defaultWindow = 45,
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const dataLength = data.length;

  // Safe normalized indices
  const safeStart = Math.max(0, Math.min(range.startIndex ?? 0, Math.max(0, dataLength - 1)));
  const safeEnd = Math.max(safeStart, Math.min(range.endIndex ?? Math.max(0, dataLength - 1), Math.max(0, dataLength - 1)));

  // Generate SVG Sparkline Path
  const { pathD, fillD } = useMemo(() => {
    if (dataLength < 2) return { pathD: '', fillD: '' };

    const values = data.map((d) => {
      const v = typeof d[valueKey] === 'number' ? d[valueKey] : typeof d.reward === 'number' ? d.reward : 0;
      return Number.isFinite(v) ? v : 0;
    });

    const maxVal = Math.max(...values, 0.01);
    const minVal = Math.min(...values, 0);
    const rangeVal = maxVal - minVal || 1;

    const width = 1000;
    const height = 48;
    const padding = 4;
    const usableHeight = height - padding * 2;

    const points = values.map((val, idx) => {
      const x = (idx / (dataLength - 1)) * width;
      const normalizedY = (val - minVal) / rangeVal;
      const y = height - padding - normalizedY * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const fillD = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

    return { pathD, fillD };
  }, [data, dataLength, valueKey]);

  // Labels for current focus
  const startItem = data[safeStart];
  const endItem = data[safeEnd];
  const startLabel = startItem ? (startItem[labelKey] || startItem.date || startItem.dayKey || '') : '';
  const endLabel = endItem ? (endItem[labelKey] || endItem.date || endItem.dayKey || '') : '';
  const focusCount = safeEnd - safeStart + 1;

  // Helper to commit new indices safely
  const commitRange = useCallback(
    (newStart, newEnd) => {
      if (dataLength < 1 || !onChange) return;
      const clampedStart = Math.max(0, Math.min(newStart, dataLength - 1));
      const clampedEnd = Math.max(clampedStart, Math.min(newEnd, dataLength - 1));

      if (clampedStart === safeStart && clampedEnd === safeEnd) return;

      onResetMonth?.();
      onChange({ startIndex: clampedStart, endIndex: clampedEnd });
    },
    [dataLength, onChange, onResetMonth, safeStart, safeEnd]
  );

  // Quick preset handlers
  const handlePreset = (days) => {
    if (dataLength < 1) return;
    if (days === 'all' || days >= dataLength) {
      commitRange(0, dataLength - 1);
      return;
    }
    const newStart = Math.max(0, dataLength - days);
    const newEnd = dataLength - 1;
    commitRange(newStart, newEnd);
  };

  // Stepping & Panning
  const handleShift = (direction, step = 7) => {
    const currentWindow = safeEnd - safeStart;
    let newStart = safeStart;
    let newEnd = safeEnd;

    if (direction === 'first') {
      newStart = 0;
      newEnd = Math.min(dataLength - 1, currentWindow);
    } else if (direction === 'last') {
      newEnd = dataLength - 1;
      newStart = Math.max(0, dataLength - 1 - currentWindow);
    } else if (direction === 'left') {
      newStart = Math.max(0, safeStart - step);
      newEnd = newStart + currentWindow;
      if (newEnd > dataLength - 1) {
        newEnd = dataLength - 1;
        newStart = Math.max(0, newEnd - currentWindow);
      }
    } else if (direction === 'right') {
      newEnd = Math.min(dataLength - 1, safeEnd + step);
      newStart = newEnd - currentWindow;
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(dataLength - 1, currentWindow);
      }
    }

    commitRange(newStart, newEnd);
  };

  // Zoom controls
  const handleZoom = (zoomIn) => {
    const step = 7;
    const currentWindow = safeEnd - safeStart;
    const center = (safeStart + safeEnd) / 2;

    let targetWindow;
    if (zoomIn) {
      targetWindow = Math.max(2, currentWindow - step);
    } else {
      targetWindow = Math.min(dataLength - 1, currentWindow + step);
    }

    let newStart = Math.round(center - targetWindow / 2);
    let newEnd = Math.round(center + targetWindow / 2);

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(dataLength - 1, targetWindow);
    }
    if (newEnd > dataLength - 1) {
      newEnd = dataLength - 1;
      newStart = Math.max(0, dataLength - 1 - targetWindow);
    }

    commitRange(newStart, newEnd);
  };

  const handleReset = () => {
    if (dataLength < 1) return;
    const newStart = Math.max(0, dataLength - defaultWindow);
    commitRange(newStart, dataLength - 1);
  };

  // Interactive track pointer events
  const getIndexFromX = useCallback(
    (clientX) => {
      if (!trackRef.current || dataLength <= 1) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (dataLength - 1));
    },
    [dataLength]
  );

  const startDrag = (type, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    dragRef.current = {
      type,
      startX: e.clientX,
      initialStart: safeStart,
      initialEnd: safeEnd,
      pointerId: e.pointerId,
    };
    setIsDragging(true);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current || !trackRef.current) return;
    const { type, startX, initialStart, initialEnd } = dragRef.current;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect.width) return;

    const deltaIndex = Math.round(((e.clientX - startX) / rect.width) * (dataLength - 1));

    if (type === 'pan') {
      const windowSize = initialEnd - initialStart;
      let newStart = initialStart + deltaIndex;
      let newEnd = initialEnd + deltaIndex;

      if (newStart < 0) {
        newStart = 0;
        newEnd = windowSize;
      }
      if (newEnd > dataLength - 1) {
        newEnd = dataLength - 1;
        newStart = Math.max(0, dataLength - 1 - windowSize);
      }

      commitRange(newStart, newEnd);
    } else if (type === 'left') {
      const newStart = Math.min(initialStart + deltaIndex, initialEnd - 1);
      commitRange(newStart, initialEnd);
    } else if (type === 'right') {
      const newEnd = Math.max(initialEnd + deltaIndex, initialStart + 1);
      commitRange(initialStart, newEnd);
    }
  };

  const endDrag = (e) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(dragRef.current.pointerId);
      } catch {
        // pointer capture release fallback
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const onTrackClick = (e) => {
    if (dragRef.current) return;
    const clickedIndex = getIndexFromX(e.clientX);
    const windowSize = safeEnd - safeStart;
    let newStart = Math.round(clickedIndex - windowSize / 2);
    let newEnd = newStart + windowSize;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(dataLength - 1, windowSize);
    }
    if (newEnd > dataLength - 1) {
      newEnd = dataLength - 1;
      newStart = Math.max(0, dataLength - 1 - windowSize);
    }

    commitRange(newStart, newEnd);
  };

  // Convert indices to percentages for highlight box
  const startPct = dataLength > 1 ? (safeStart / (dataLength - 1)) * 100 : 0;
  const endPct = dataLength > 1 ? (safeEnd / (dataLength - 1)) * 100 : 100;
  const widthPct = Math.max(1, endPct - startPct);

  // Active preset detection
  const isAll = safeStart === 0 && safeEnd === dataLength - 1;
  const isAtLatest = safeEnd === dataLength - 1;
  const currentDays = safeEnd - safeStart + 1;

  if (dataLength === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 sm:p-4 mt-4 space-y-3 select-none backdrop-blur-xs">
      {/* Top Header Row: Labels & Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-white/40">
            Timeline Focus
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
            <Calendar size={12} className="text-cyan-300" />
            {focusCount} {focusCount === 1 ? 'day' : 'days'} ({startLabel} — {endLabel})
          </span>
        </div>

        {/* Quick Zoom Presets */}
        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] overflow-x-auto">
          {[
            { label: '7D', days: 7 },
            { label: '14D', days: 14 },
            { label: '30D', days: 30 },
            { label: '90D', days: 90 },
            { label: 'All Time', days: 'all' },
          ].map((preset) => {
            const isActive =
              preset.days === 'all'
                ? isAll
                : isAtLatest && currentDays === preset.days;

            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.days)}
                className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Visual Minimap Scrubber */}
      <div
        ref={trackRef}
        onClick={onTrackClick}
        className="relative h-14 w-full rounded-xl bg-black/40 border border-white/[0.08] overflow-hidden cursor-crosshair group touch-none"
      >
        {/* SVG Sparkline Background */}
        <svg
          viewBox="0 0 1000 48"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full pointer-events-none opacity-60 group-hover:opacity-80 transition-opacity"
        >
          <defs>
            <linearGradient id="navigatorFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {fillD && <path d={fillD} fill="url(#navigatorFillGrad)" />}
          {pathD && <path d={pathD} fill="none" stroke="#818cf8" strokeWidth={1.5} />}
        </svg>

        {/* Dimming Mask: Left of selection */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-black/45 pointer-events-none transition-all duration-75"
          style={{ width: `${startPct}%` }}
        />

        {/* Dimming Mask: Right of selection */}
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/45 pointer-events-none transition-all duration-75"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Selected Active Window */}
        <div
          onPointerDown={(e) => startDrag('pan', e)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute top-0 bottom-0 border-y-2 border-cyan-400/80 bg-cyan-400/[0.12] rounded-md backdrop-brightness-125 cursor-grab active:cursor-grabbing transition-shadow ${
            isDragging ? 'shadow-[0_0_20px_rgba(34,211,238,0.35)] cursor-grabbing' : 'shadow-[0_0_12px_rgba(34,211,238,0.18)]'
          }`}
          style={{
            left: `${startPct}%`,
            width: `${widthPct}%`,
          }}
        >
          {/* Left Resize Handle */}
          <div
            onPointerDown={(e) => startDrag('left', e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-9 rounded-md bg-cyan-400 text-slate-950 flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 shadow-md z-30 transition-transform"
            title="Drag to adjust start date"
          >
            <div className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-slate-900 rounded-full" />
              <span className="w-0.5 h-3 bg-slate-900 rounded-full" />
            </div>
          </div>

          {/* Right Resize Handle */}
          <div
            onPointerDown={(e) => startDrag('right', e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-9 rounded-md bg-cyan-400 text-slate-950 flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 shadow-md z-30 transition-transform"
            title="Drag to adjust end date"
          >
            <div className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-slate-900 rounded-full" />
              <span className="w-0.5 h-3 bg-slate-900 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Step & Pan Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        {/* Navigation Step Arrows */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safeStart <= 0}
            onClick={() => handleShift('first')}
            title="Jump to oldest date"
            className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            type="button"
            disabled={safeStart <= 0}
            onClick={() => handleShift('left', 7)}
            title="Shift 7 days earlier"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-[11px]"
          >
            <ChevronLeft size={14} />
            <span>Earlier</span>
          </button>
          <button
            type="button"
            disabled={safeEnd >= dataLength - 1}
            onClick={() => handleShift('right', 7)}
            title="Shift 7 days later"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-[11px]"
          >
            <span>Later</span>
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            disabled={safeEnd >= dataLength - 1}
            onClick={() => handleShift('last')}
            title="Jump to latest date"
            className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronsRight size={14} />
          </button>
        </div>

        {/* Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleZoom(false)}
            title="Widen window (Zoom out)"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer text-[11px]"
          >
            <ZoomOut size={13} />
            <span className="hidden sm:inline">Zoom Out</span>
          </button>
          <button
            type="button"
            onClick={() => handleZoom(true)}
            title="Narrow window (Zoom in)"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer text-[11px]"
          >
            <ZoomIn size={13} />
            <span className="hidden sm:inline">Zoom In</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset to default window"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-cyan-200 hover:border-cyan-400/30 transition-colors cursor-pointer text-[11px]"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
