interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, disabled }: ToggleSwitchProps) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
          checked ? 'bg-emerald-500' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        aria-pressed={checked}
        aria-label={`${label} toggle`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}
