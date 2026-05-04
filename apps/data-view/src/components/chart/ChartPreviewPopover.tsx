"use client";

import { useEffect, useState } from "react";
import styles from "./ChartPreviewPopover.module.css";
import { useChartPreview } from "@/hooks/useChartPreview";
import { MockDailyChart } from "./MockDailyChart";
import { MockMinuteChart } from "./MockMinuteChart";
import { MockThemeOverlayChart } from "./MockThemeOverlayChart";

export interface PopoverAnchor {
  /** 카드의 우측 상단 좌표 (viewport 기준) */
  x: number;
  y: number;
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
}

interface Props {
  anchor: PopoverAnchor;
}

const POPOVER_W = 360;
const GAP = 12;

export function ChartPreviewPopover({ anchor }: Props) {
  const { data, isLoading } = useChartPreview({
    stockCode: anchor.stockCode,
    tradeDate: anchor.tradeDate,
    tradeTime: anchor.tradeTime,
  });

  // 화면 밖으로 나가지 않도록 좌표 보정
  const [pos, setPos] = useState({ left: anchor.x + GAP, top: anchor.y });

  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x + GAP;
    let top = anchor.y;
    if (left + POPOVER_W > vw - 60) {
      // 카드 좌측에 띄우기
      left = anchor.x - POPOVER_W - GAP;
    }
    if (top + 460 > vh) {
      top = vh - 460 - 12;
    }
    if (top < 12) top = 12;
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  return (
    <div
      className={styles.popover}
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
    >
      {isLoading || !data ? (
        <div className={styles.loading}>차트 로딩 중…</div>
      ) : (
        <>
          <div className={styles.section}>
            <span className={styles.label}>일봉 (60일)</span>
            <MockDailyChart candles={data.daily} width={POPOVER_W - 24} />
          </div>
          <div className={styles.section}>
            <span className={styles.label}>분봉 (당일)</span>
            <MockMinuteChart candles={data.minute} width={POPOVER_W - 24} />
          </div>
          <div className={styles.section}>
            <span className={styles.label}>테마 오버레이 (등락률)</span>
            <MockThemeOverlayChart
              data={data.themeOverlay}
              width={POPOVER_W - 24}
            />
          </div>
        </>
      )}
    </div>
  );
}
