import { ChevronLeft, ChevronRight } from 'lucide-react';

function getVisiblePages(page, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages]);
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('...');
    }
    result.push(sorted[i]);
  }
  return result;
}

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const visible = getVisiblePages(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-0.5 sm:gap-2 mt-4 sm:mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 sm:p-2 rounded-xl glass text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={16} />
      </button>

      {visible.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-7 sm:w-9 text-center text-white/20 text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-7 h-7 sm:w-9 sm:h-9 rounded-xl text-xs sm:text-sm font-medium ${
              p === page
                ? 'btn-gradient'
                : 'glass text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 sm:p-2 rounded-xl glass text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
