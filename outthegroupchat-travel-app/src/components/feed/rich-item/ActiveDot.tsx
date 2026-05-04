// ─── Small helper: active indicator dot ──────────────────────────────────────

export function ActiveDot({ activeUntil }: { activeUntil: string | null | undefined }) {
  if (!activeUntil) return null;
  const isActive = new Date(activeUntil).getTime() > Date.now();
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      aria-label={isActive ? 'Active now' : 'Expired'}
    />
  );
}
