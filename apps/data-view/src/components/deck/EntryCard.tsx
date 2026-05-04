"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./EntryCard.module.css";
import type { CardData } from "@/types/deck";
import { OptionChips } from "./OptionChips";
import { PeerTable } from "./PeerTable";
import {
  ChartPreviewPopover,
  type PopoverAnchor,
} from "@/components/chart/ChartPreviewPopover";

interface Props {
  data: CardData;
}

const HOVER_DELAY = 300; // ms

export function EntryCard({ data }: Props) {
  const { entry, selfStockName, selfMetrics, themeName, peers } = data;
  const { memo, ...restOptions } = entry.options;

  const router = useRouter();
  const cardRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  const showPopover = useCallback(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setAnchor({
      x: rect.right,
      y: rect.top,
      stockCode: entry.stockCode,
      tradeDate: entry.tradeDate,
      tradeTime: entry.tradeTime,
    });
  }, [entry.stockCode, entry.tradeDate, entry.tradeTime]);

  const handleMouseEnter = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(showPopover, HOVER_DELAY);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAnchor(null);
  };

  const handleClick = () => {
    const url = `/chart/${entry.stockCode}/${entry.tradeDate}/${encodeURIComponent(
      entry.tradeTime
    )}`;
    router.push(url);
  };

  return (
    <>
      <article
        ref={cardRef}
        className={styles.card}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>{selfStockName}</div>
            <div className={styles.meta}>
              <span>{entry.tradeDate}</span>
              <span>·</span>
              <span>{entry.tradeTime}</span>
              <span className={styles.themeTag}>#{themeName}</span>
            </div>
          </div>
          <OptionChips options={restOptions} />
        </header>

        <PeerTable self={selfMetrics} peers={peers} />

        {memo && <div className={styles.memo}>📝 {memo}</div>}
      </article>

      {anchor && <ChartPreviewPopover anchor={anchor} />}
    </>
  );
}
