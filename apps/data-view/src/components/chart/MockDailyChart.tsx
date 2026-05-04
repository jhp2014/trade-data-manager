"use client";

import type { ChartCandle } from "@/actions/chartPreview";

interface Props {
  candles: ChartCandle[];
  width?: number;
  height?: number;
}

export function MockDailyChart({ candles, width = 320, height = 120 }: Props) {
  if (candles.length === 0) return null;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const priceRange = maxPrice - minPrice || 1;

  const candleWidth = width / candles.length;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {candles.map((c, i) => {
        const x = i * candleWidth + candleWidth / 2;
        const yHigh = ((maxPrice - c.high) / priceRange) * height;
        const yLow = ((maxPrice - c.low) / priceRange) * height;
        const yOpen = ((maxPrice - c.open) / priceRange) * height;
        const yClose = ((maxPrice - c.close) / priceRange) * height;
        const isRise = c.close >= c.open;
        const color = isRise ? "var(--rise)" : "var(--fall)";
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);
        const bodyW = Math.max(candleWidth - 1, 1);

        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} />
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyHeight}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
