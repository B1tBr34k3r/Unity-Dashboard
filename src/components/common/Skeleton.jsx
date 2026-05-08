export function Skeleton({ className = '', style }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`}
      style={style}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass p-4 sm:p-5">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-7 w-28 mb-2" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  );
}

export function ChartSkeleton({ height = 250 }) {
  return (
    <div className="glass p-5 sm:p-6">
      <Skeleton className="h-3 w-40 mb-5" />
      <Skeleton className="w-full rounded-xl" style={{ height }} />
    </div>
  );
}

export function TableRowSkeleton({ columns = 4 }) {
  return (
    <tr className="border-b border-white/[0.04]">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <ChartSkeleton height={280} />
      <ChartSkeleton height={250} />
    </div>
  );
}

export function LicenseListSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] sm:h-[calc(100vh-4rem)]">
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Skeleton className="h-7 w-32 mb-2" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>
      <div className="glass overflow-hidden flex-1">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['#', 'License', 'Total', 'Reward', 'Date'].map((h) => (
                <th key={h} className="py-3 px-4">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={5} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WalletCardSkeleton() {
  return (
    <div className="glass p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="shimmer h-6 w-24 rounded-lg" />
        <div className="shimmer h-6 w-16 rounded-full" />
      </div>
      {/* Address box */}
      <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="shimmer h-3 w-24 rounded" />
          <div className="shimmer h-7 w-14 rounded-lg" />
        </div>
        <div className="shimmer h-4 w-full rounded" />
      </div>
      {/* Token rows */}
      <div className="mt-4 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
            <div className="space-y-1.5">
              <div className="shimmer h-4 w-12 rounded" />
              <div className="shimmer h-3 w-20 rounded" />
            </div>
            <div className="space-y-1.5 flex flex-col items-end">
              <div className="shimmer h-4 w-14 rounded" />
              <div className="shimmer h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      {/* Last updated */}
      <div className="shimmer mt-4 h-3 w-36 rounded" />
    </div>
  );
}

export function PayoutWalletsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="glass p-5 sm:p-6">
        <div className="shimmer h-6 w-32 rounded-full mb-3" />
        <div className="shimmer h-7 w-64 rounded-lg mb-2" />
        <div className="shimmer h-4 w-full max-w-md rounded" />
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center gap-6">
          <div className="shimmer h-4 w-40 rounded" />
          <div className="shimmer h-4 w-48 rounded" />
        </div>
      </div>
      {/* Wallet card skeletons */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <WalletCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function WithdrawalSkeleton() {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="glass p-5 sm:p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-48" />
          <div className="shimmer h-12 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <div className="shimmer h-12 w-full rounded-xl" />
          <Skeleton className="h-3 w-full max-w-xs" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-9 w-28 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="shimmer h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function LicenseDetailSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass p-3 sm:p-4">
            <Skeleton className="h-2.5 w-20 mb-2" />
            <Skeleton className="h-6 w-24 mb-1" />
            <Skeleton className="h-2 w-12" />
          </div>
        ))}
      </div>
      <ChartSkeleton height={250} />
    </div>
  );
}
