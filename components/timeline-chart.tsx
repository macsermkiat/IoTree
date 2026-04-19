interface TimelinePoint {
  label: string;
  value: number;
}

interface TimelineChartProps {
  data: TimelinePoint[];
  min?: number;
  max?: number;
}

export function TimelineChart({ data, min = 0, max = 100 }: TimelineChartProps) {
  const width = 820;
  const height = 240;
  const padding = 28;

  if (!data.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No timeline data yet. Keep this dashboard open to build a 60-minute binned history.
      </div>
    );
  }

  const span = Math.max(1, max - min);

  const points = data.map((point, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const normalized = (point.value - min) / span;
    const y = height - padding - normalized * (height - padding * 2);
    return { ...point, x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Soil moisture timeline" className="h-56 w-full min-w-[640px]">
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />

          {[0, 25, 50, 75, 100].map((tick) => {
            const y = height - padding - ((tick - min) / span) * (height - padding * 2);
            return (
              <g key={tick}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E2E8F0" strokeDasharray="4 4" strokeWidth="1" />
                <text x={padding - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px]">
                  {tick}
                </text>
              </g>
            );
          })}

          <path d={path} fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" />

          {points.map((point, index) => (
            <circle key={`${point.label}-${index}`} cx={point.x} cy={point.y} r="2.5" fill="#14B8A6" />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 sm:grid-cols-6">
        {data.filter((_, index) => index % Math.max(1, Math.floor(data.length / 6)) === 0).map((point) => (
          <div key={point.label} className="truncate rounded-lg bg-slate-100 px-2 py-1 text-center">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}
