"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../ReviewWorkspace.module.css";
import { FieldChecklistModal } from "../FieldChecklistModal";
import { ManualFilterModal } from "../ManualFilterModal";
import { activeFilterCount } from "@/lib/manualFilter";
import { useUiStore } from "@/stores/useUiStore";
import { type ReadSheetState, type SheetDefaults } from "./ActionModal";
import { ReadSheetModal } from "./ReadSheetModal";
import { ExportModal } from "./ExportModal";
import { ImportModal } from "./ImportModal";
import { CsvImportModal } from "./CsvImportModal";

/** 설정 모달의 리스트 행(클릭 시 하위 모달 오픈). */
function SettingsRow({
  label,
  sub,
  count,
  onClick,
}: {
  label: string;
  sub: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.settingsRow} onClick={onClick}>
      <span className={styles.settingsRowText}>
        <span className={styles.settingsRowLabel}>{label}</span>
        <span className={styles.settingsRowSub}>{sub}</span>
      </span>
      {count != null && count > 0 && (
        <span className={styles.settingsRowCount}>{count}</span>
      )}
      <span className={styles.settingsRowChevron} aria-hidden>
        ›
      </span>
    </button>
  );
}

type SettingsModalProps = {
  manualFieldKeys: string[];
  headerAvailable: string[];
  valueSuggestions: Record<string, string[]>;
  onClose: () => void;
};

export function SettingsModal({
  manualFieldKeys,
  headerAvailable,
  valueSuggestions,
  onClose,
}: SettingsModalProps) {
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);
  const toggleHeaderField = useUiStore((state) => state.toggleHeaderField);
  const clearHeaderFields = useUiStore((state) => state.clearHeaderFields);
  const pointFieldKeys = useUiStore((state) => state.pointFieldKeys);
  const togglePointField = useUiStore((state) => state.togglePointField);
  const clearPointFields = useUiStore((state) => state.clearPointFields);
  const manualFilters = useUiStore((state) => state.manualFilters);
  const toggleManualFilterValue = useUiStore((state) => state.toggleManualFilterValue);
  const clearManualFilters = useUiStore((state) => state.clearManualFilters);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<
    "header" | "point" | "filter" | "read" | "export" | "import" | "csv" | null
  >(null);
  const [sheetConfig, setSheetConfig] = useState<ReadSheetState | null>(null);
  const activeFilters = activeFilterCount(manualFilters);

  // 읽기 시트 설정(쿠키/env) 불러오기 → 각 모달 입력 기본값으로 사용
  useEffect(() => {
    let alive = true;
    fetch("/api/review/read-sheet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReadSheetState | null) => {
        if (alive && data) setSheetConfig(data);
      })
      .catch(() => {
        /* 무시: 자격증명/설정 없음 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const defaults: SheetDefaults = {
    spreadsheetId: sheetConfig?.spreadsheetId ?? "",
    tab: sheetConfig?.tab ?? "review",
  };

  // ESC 로 닫기 (하위 모달이 열려 있으면 그 모달이 먼저 처리)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openPicker === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPicker, onClose]);

  // 오버레이 클릭(배경)으로 닫기
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} className={styles.settingsOverlay} onClick={handleOverlayClick}>
      <div className={styles.settingsModal}>
        <div className={styles.settingsHeader}>
          <span className={styles.settingsTitle}>설정</span>
          <button type="button" className={styles.settingsClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.settingsBody}>
          <div className={styles.settingsGroupLabel}>표시</div>
          <div className={styles.settingsGroup}>
            <SettingsRow
              label="헤더 표시 필드"
              sub="차트 헤더에 표시할 필드"
              count={headerFieldKeys.length}
              onClick={() => setOpenPicker("header")}
            />
            <SettingsRow
              label="Point List 표시 필드"
              sub="타점 목록에 표시할 필드"
              count={pointFieldKeys.length}
              onClick={() => setOpenPicker("point")}
            />
            <SettingsRow
              label="m_ 값 필터"
              sub="선택한 값이 있는 타점에 배지 표시"
              count={activeFilters}
              onClick={() => setOpenPicker("filter")}
            />
          </div>

          <div className={styles.settingsGroupLabel}>데이터 적재</div>
          <div className={styles.settingsGroup}>
            <SettingsRow
              label="CSV 타겟 불러오기"
              sub="Capture CSV → review_target 적재"
              onClick={() => setOpenPicker("csv")}
            />
          </div>

          <div className={styles.settingsGroupLabel}>Sheet 연동</div>
          <div className={styles.settingsGroup}>
            <SettingsRow
              label="읽기 시트 (작업셋)"
              sub="작업셋을 정의할 스프레드시트"
              onClick={() => setOpenPicker("read")}
            />
            <SettingsRow
              label="Google Sheet Export"
              sub="타점을 스프레드시트로 내보내기"
              onClick={() => setOpenPicker("export")}
            />
            <SettingsRow
              label="Sheet → DB 병합 Import"
              sub="시트의 m_ 값을 DB에 병합"
              onClick={() => setOpenPicker("import")}
            />
          </div>
        </div>
      </div>

      {openPicker === "header" && (
        <FieldChecklistModal
          title="헤더 표시 필드"
          availableKeys={headerAvailable}
          selectedKeys={headerFieldKeys}
          onToggle={toggleHeaderField}
          onClear={clearHeaderFields}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "point" && (
        <FieldChecklistModal
          title="Point List 표시 필드"
          availableKeys={manualFieldKeys}
          selectedKeys={pointFieldKeys}
          onToggle={togglePointField}
          onClear={clearPointFields}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "filter" && (
        <ManualFilterModal
          valueSuggestions={valueSuggestions}
          filters={manualFilters}
          onToggle={toggleManualFilterValue}
          onClear={clearManualFilters}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "read" && (
        <ReadSheetModal
          config={sheetConfig}
          defaults={defaults}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "export" && (
        <ExportModal
          filters={manualFilters}
          activeFilters={activeFilters}
          defaults={defaults}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "import" && (
        <ImportModal defaults={defaults} onClose={() => setOpenPicker(null)} />
      )}
      {openPicker === "csv" && <CsvImportModal onClose={() => setOpenPicker(null)} />}
    </div>
  );
}
