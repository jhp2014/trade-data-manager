"use client";

import styles from "./ReviewWorkspace.module.css";
import { activeFilterCount } from "@/lib/manualFilter";
import { formatHHMM } from "./TimeSlider";
import { createReviewCommands } from "@/lib/reviewCommands";
import { truncate } from "@/lib/format";
import { VALUE_TRUNCATE, resolveFieldValue } from "@/lib/reviewFields";
import { VIEW_MODES, cycleViewMode } from "@/lib/shortcuts";
import { useUiStore } from "@/stores/useUiStore";
import type { ReviewPoint, ReviewViewMode } from "@/types/review";

type ReviewHeaderProps = {
  commands: ReturnType<typeof createReviewCommands>;
  displayName: string;
  tradeDate: string;
  themeName: string | null;
  point: ReviewPoint;
  groupIndex: number;
  groupCount: number;
  viewMode: ReviewViewMode;
  isOverride: boolean;
  isListingDay: boolean;
  onResetOverride: () => void;
  headerAvailable: string[];
  onOpenSettings: () => void;
  markerMinutes: number;
  hasSpreadsheet: boolean;
  readTab: string;
  readSource: "sheet" | "db";
  writeTab: string | null;
  tabs: string[];
  isLoadingWorkset: boolean;
  onCycleSheetTab: () => void;
  onToggleDbMode: () => void;
  onCycleWriteTab: () => void;
  onReloadTab: () => void;
  onInitWriteTab: () => void;
};

export function ReviewHeader({
  commands,
  displayName,
  tradeDate,
  themeName,
  point,
  groupIndex,
  groupCount,
  viewMode,
  isOverride,
  isListingDay,
  onResetOverride,
  headerAvailable,
  onOpenSettings,
  markerMinutes,
  hasSpreadsheet,
  readTab,
  readSource,
  writeTab,
  tabs,
  isLoadingWorkset,
  onCycleSheetTab,
  onToggleDbMode,
  onCycleWriteTab,
  onReloadTab,
  onInitWriteTab,
}: ReviewHeaderProps) {
  const chartPriceMode = useUiStore((state) => state.chartPriceMode);
  const setChartPriceMode = useUiStore((state) => state.setChartPriceMode);
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);
  const manualFiltersInHeader = useUiStore((state) => state.manualFilters);
  const clearManualFiltersInHeader = useUiStore((state) => state.clearManualFilters);
  const activeFiltersCount = activeFilterCount(manualFiltersInHeader);

  const fieldValues = headerFieldKeys
    .filter((key) => headerAvailable.includes(key))
    .map((key) => ({ key, value: resolveFieldValue(key, point) }));

  const viewLabel = VIEW_MODES.find((v) => v.mode === viewMode)?.label ?? viewMode;

  return (
    <header className={styles.header}>
      <div className={styles.headerInfo}>
        <div className={styles.titleLine}>
          <span className={styles.stockName}>{displayName}</span>
          {isOverride && (
            <button type="button" className={styles.overrideTag} onClick={onResetOverride}>
              탐색중 · 본 종목으로 ✕
            </button>
          )}
          <span className={styles.sep}>|</span>
          <span>{themeName ?? "테마 -"}</span>
          <span className={styles.sep}>|</span>
          <span className="tabular">{tradeDate}</span>
          <span className={styles.sep}>|</span>
          <span className="tabular">{formatHHMM(markerMinutes)}</span>
          {isListingDay && (
            <span
              className={styles.listingBadge}
              title="상장일: 전일종가가 없어 등락률을 당일 시가 기준으로 표시합니다."
            >
              상장일·시가기준
            </span>
          )}
        </div>
        <div className={styles.fieldLine}>
          {fieldValues.length === 0 ? (
            <span className={styles.fieldHint}>⚙ 설정에서 표시할 필드를 선택하세요</span>
          ) : (
            fieldValues.map(({ key, value }) => (
              <span key={key} className={styles.fieldItem} title={value || "-"}>
                <span className={styles.fieldKey}>{key}</span>
                <span className={styles.fieldVal}>{value ? truncate(value, VALUE_TRUNCATE) : "-"}</span>
              </span>
            ))
          )}
        </div>
      </div>
      <div className={styles.headerRight}>
        <div className={styles.controls}>
          {/* 읽기 소스 그룹 (시트 설정 있거나 DB 모드일 때 표시) */}
          {(hasSpreadsheet || readSource === "db") && (
            <div className={styles.segGroup}>
              {/* ⇌ 스위치: DB ↔ 시트 모드 토글 전용 */}
              <button
                type="button"
                className={`${styles.segChip} ${readSource === "db" ? styles.segChipDb : ""}`}
                onClick={onToggleDbMode}
                title={readSource === "db" ? "DB 모드 ON · 클릭: 시트 모드로 전환" : "클릭: DB 모드로 전환"}
              >
                ⇌
              </button>
              {/* 읽기 탭 다시 불러오기: 스위치 우측 */}
              <button
                type="button"
                className={styles.segChip}
                onClick={onReloadTab}
                disabled={isLoadingWorkset}
                title={readSource === "db" ? "DB 작업셋 다시 불러오기" : "현재 읽기 탭 다시 불러오기"}
              >
                {isLoadingWorkset ? "…" : "↻"}
              </button>
              {/* 읽기 탭 / DB 칩: 클릭·r키는 시트 탭 순환 전용 */}
              <button
                type="button"
                className={`${styles.segChip} ${readSource === "db" ? styles.segChipDb : styles.segChipActive}`}
                onClick={onCycleSheetTab}
                title={readSource === "db" ? "r키·클릭: 시트 탭으로 전환" : (tabs.length > 1 ? "클릭·r키: 다음 읽기 탭으로 전환" : "읽기 탭")}
              >
                {readSource === "db" ? "DB" : readTab}
              </button>
              <span className={styles.segArrow}>→</span>
              {/* 쓰기 탭 초기화: 탭을 비우고 첫 행에 헤더 기록(쓰기 탭 좌측) */}
              <button
                type="button"
                className={styles.segChip}
                onClick={onInitWriteTab}
                disabled={!writeTab}
                title="쓰기 탭 초기화 · 첫 행에 헤더 기록(기존 내용 삭제)"
              >
                ↻
              </button>
              {/* 쓰기 탭: DB 모드에서도 항상 표시 */}
              <button
                type="button"
                className={`${styles.segChip} ${writeTab ? styles.segChipActive : ""}`}
                onClick={onCycleWriteTab}
                title={tabs.length > 0 ? "클릭: 다음 쓰기 탭으로 전환" : "쓰기 탭 미설정"}
              >
                {writeTab ?? "미설정"}
              </button>
            </div>
          )}
          {/* 종목 이동 */}
          <span className={styles.navGroup} title="화살표로 종목 이동">
            <button
              className={styles.navArrow}
              type="button"
              onClick={commands.prevGroup}
              disabled={groupIndex === 0}
              title="이전 종목"
            >
              ←
            </button>
            <span className={`${styles.navPos} tabular`}>
              {groupIndex < 0 ? "-" : groupIndex + 1}/{groupCount}
            </span>
            <button
              className={styles.navArrow}
              type="button"
              onClick={commands.nextGroup}
              disabled={groupIndex === groupCount - 1}
              title="다음 종목"
            >
              →
            </button>
          </span>
          {/* 가격 모드: 클릭으로 KRX ↔ NXT 전환 */}
          <div className={styles.segGroup}>
            <button
              className={`${styles.segChip} ${styles.segChipActive}`}
              type="button"
              onClick={() => setChartPriceMode(chartPriceMode === "krx" ? "nxt" : "krx")}
              title={`현재 ${chartPriceMode.toUpperCase()} · 클릭: 전환`}
            >
              {chartPriceMode.toUpperCase()}
            </button>
          </div>
          {/* 뷰 모드: 클릭으로 순환 */}
          <div className={styles.segGroup}>
            <button
              className={`${styles.segChip} ${styles.segChipActive}`}
              type="button"
              onClick={() => commands.setViewMode(cycleViewMode(viewMode, 1))}
              title={`현재 ${viewLabel} · 클릭: 다음 뷰로 전환`}
            >
              {viewLabel}
            </button>
          </div>
          {/* 활성 필터 해제 */}
          {activeFiltersCount > 0 && (
            <div className={styles.segGroup}>
              <button
                type="button"
                className={`${styles.segChip} ${styles.segChipWarn}`}
                onClick={clearManualFiltersInHeader}
                title="활성 필터 전체 해제"
              >
                ⊘ {activeFiltersCount}
              </button>
            </div>
          )}
          {/* 설정 */}
          <div className={styles.segGroup}>
            <button type="button" className={styles.segChip} onClick={onOpenSettings} title="설정">
              ⚙
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
