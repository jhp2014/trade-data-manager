"use client";

import type { ChartCandle } from "@/actions/chartPreview";

interface Props {
  candles: ChartCandle[];
  width?: number;
  height?: number;
}

export function MockMinuteChart({ candles, width = 320, height = 120 }: Props) {
  if (candles.length === 0) return null;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const range = maxPrice - minPrice || 1;

  const points = candles
    .map((c, i) => {
      const x = (i / (candles.length - 1)) * width;
      const y = ((maxPrice - c.close) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // 면적 라인 채우기
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon points={areaPoints} fill="var(--accent-bg)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
