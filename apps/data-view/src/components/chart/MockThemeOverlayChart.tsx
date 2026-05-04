"use client";

interface Series {
  stockCode: string;
  stockName: string;
  series: Array<{ time: number; changeRate: number }>;
}

interface Props {
  data: Series[];
  width?: number;
  height?: number;
}

const COLORS = [
  "var(--accent-primary)",
  "var(--rise)",
  "var(--fall)",
  "#f59e0b",
  "#10b981",
];

export function MockThemeOverlayChart({
  data,
  width = 320,
  height = 120,
}: Props) {
  if (data.length === 0) return null;

  const allRates = data.flatMap((s) => s.series.map((p) => p.changeRate));
  const minR = Math.min(...allRates, -1);
  const maxR = Math.max(...allRates, 1);
  const range = maxR - minR || 1;

  const len = data[0]?.series.length ?? 1;

  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* 0 baseline */}
        <line
          x1={0}
          x2={width}
          y1={((maxR - 0) / range) * height}
          y2={((maxR - 0) / range) * height}
          stroke="var(--border-default)"
          strokeDasharray="2 2"
        />
        {data.map((s, idx) => {
          const points = s.series
            .map((p, i) => {
              const x = (i / Math.max(len - 1, 1)) * width;
              const y = ((maxR - p.changeRate) / range) * height;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <polyline
              key={s.stockCode}
              points={points}
              fill="none"
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={1.2}
              opacity={0.85}
            />
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 4,
          fontSize: "var(--fs-xs)",
        }}
      >
        {data.map((s, idx) => (
          <span
            key={s.stockCode}
            style={{
              color: COLORS[idx % COLORS.length],
              fontWeight: 500,
            }}
          >
            ● {s.stockName}
          </span>
        ))}
      </div>
    </div>
  );
}
