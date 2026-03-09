export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Nav skeleton */}
      <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="hidden md:flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            ))}
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl h-64 animate-pulse border border-slate-200 dark:border-slate-700" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
