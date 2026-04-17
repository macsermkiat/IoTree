interface StatusBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function StatusBadge({
  active,
  activeLabel = 'ON',
  inactiveLabel = 'OFF',
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
