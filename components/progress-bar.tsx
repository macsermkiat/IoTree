interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="mt-4 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-4 rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
