"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import styles from "./ReviewWorkspace.module.css";
import { useModalDismiss } from "@/hooks/useModalDismiss";
import type { DbDateRange } from "@/types/review";
import type { DbRangeRequest } from "@/hooks/useWorkingSetCache";

const PRESETS = [1, 3, 6] as const;

type DbRangePickerProps = {
  /** 현재 적용 범위. null = 전체. */
  dbRange: DbDateRange;
  isLoading: boolean;
  onSetDbRange: (req: DbRangeRequest) => void;
};

/**
 * DB 모드 작업셋의 날짜 범위 피커.
 * - 칩: 현재 범위를 MM.DD~MM.DD(또는 "전체") 로 표시, 클릭 시 팝오버.
 * - 프리셋(최근 N개월)은 서버가 최신 tradeDate 기준으로 앵커링한다.
 */
export function DbRangePicker({ dbRange, isLoading, onSetDbRange }: DbRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dbRange?.from ?? "");
  const [to, setTo] = useState(dbRange?.to ?? "");
  useModalDismiss(() => setOpen(false), { stopPropagation: true, enabled: open });

  // 적용된 범위가 바뀌면(프리셋 등) 입력값을 동기화한다.
  useEffect(() => {
    setFrom(dbRange?.from ?? "");
    setTo(dbRange?.to ?? "");
  }, [dbRange?.from, dbRange?.to]);

  const label = dbRange ? `${fmt(dbRange.from)}~${fmt(dbRange.to)}` : "전체";

  const apply = (req: DbRangeRequest) => {
    onSetDbRange(req);
    setOpen(false);
  };

  return (
    <div className={styles.dbRangeWrap}>
      <button
        type="button"
        className={`${styles.segChip} ${styles.dbRangeChip}`}
        onClick={() => setOpen((v) => !v)}
        title="DB 작업셋 날짜 범위 지정"
        aria-expanded={open}
      >
        <span className={`${styles.dbRangeLabel} tabular`}>{label}</span>
      </button>

      {open && (
        <>
          <div className={styles.dbRangeBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.dbRangePopover} role="dialog" aria-label="DB 날짜 범위">
            <div className={styles.dbRangePresets}>
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={styles.dbRangePresetBtn}
                  onClick={() => apply({ months: m })}
                  disabled={isLoading}
                >
                  최근 {m}개월
                </button>
              ))}
              <button
                type="button"
                className={`${styles.dbRangePresetBtn} ${dbRange === null ? styles.dbRangePresetActive : ""}`}
                onClick={() => apply({ all: true })}
                disabled={isLoading}
              >
                전체
              </button>
            </div>

            <div className={styles.dbRangeFields}>
              <input
                type="date"
                className={styles.dbRangeInput}
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className={styles.dbRangeTilde}>~</span>
              <input
                type="date"
                className={styles.dbRangeInput}
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
              <button
                type="button"
                className={styles.dbRangeApply}
                disabled={!from || !to || isLoading}
                onClick={() => apply({ from, to })}
              >
                적용
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(d: string): string {
  return dayjs(d).format("YY.MM.DD");
}
