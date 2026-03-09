export default function FeedLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 pt-20">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>

        {/* Tabs skeleton */}
        <div className="h-10 w-72 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse mb-6" />

        {/* Masonry skeleton */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {[280, 200, 320, 240, 180, 300, 220, 260].map((height, i) => (
            <div
              key={i}
              className="break-inside-avoid bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 animate-pulse overflow-hidden"
            >
              <div className="bg-slate-200 dark:bg-slate-700" style={{ height: `${height}px` }} />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
