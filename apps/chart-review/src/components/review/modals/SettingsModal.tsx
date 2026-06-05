"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../ReviewWorkspace.module.css";
import { FieldChecklistModal } from "../FieldChecklistModal";
import { ManualFilterModal } from "../ManualFilterModal";
import { activeFilterCount } from "@/lib/manualFilter";
import { useUiStore } from "@/stores/useUiStore";
import type { ReadSheetState } from "./ActionModal";
import { SheetIdModal } from "./SheetIdModal";
import { TabSettingsModal } from "./TabSettingsModal";
import { ExportImportModal } from "./ExportImportModal";
import { CsvImportModal } from "./CsvImportModal";
import { ExportFieldsModal } from "./ExportFieldsModal";
import { InputKeyConfigModal } from "./InputKeyConfigModal";
import { PresetConfigModal } from "./PresetConfigModal";

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

/** 우측에 인라인 입력(숫자/시각 등)을 두는 설정 행. */
function SettingsInputRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.settingsRow}>
      <span className={styles.settingsRowText}>
        <span className={styles.settingsRowLabel}>{label}</span>
        <span className={styles.settingsRowSub}>{sub}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * 정수 입력(스피너 없음, 자유롭게 지웠다 다시 입력 가능).
 * 편집 중에는 로컬 문자열을 그대로 두고, blur/Enter 시에만 clamp 후 커밋한다.
 * 빈 값/비정상 값으로 빠져나가면 직전 유효값으로 되돌린다.
 */
function ClearableNumberInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // 외부 값이 바뀌면(다른 경로로 변경) 로컬 텍스트도 동기화.
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = Math.round(Number(text));
    if (text.trim() !== "" && Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onCommit(clamped);
      setText(String(clamped));
    } else {
      setText(String(value)); // 무효 입력 → 되돌림
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={styles.settingsInlineInput}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

type SettingsModalProps = {
  manualFieldKeys: string[];
  headerAvailable: string[];
  valueSuggestions: Record<string, string[]>;
  onReloadAll: () => void;
  onClose: () => void;
};

export function SettingsModal({
  manualFieldKeys,
  headerAvailable,
  valueSuggestions,
  onReloadAll,
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
  const writeTab = useUiStore((state) => state.writeTab);
  const setWriteTab = useUiStore((state) => state.setWriteTab);
  const exportFieldKeys = useUiStore((state) => state.exportFieldKeys);
  const setExportFieldKeys = useUiStore((state) => state.setExportFieldKeys);
  const inputKeyOrder = useUiStore((state) => state.inputKeyOrder);
  const setInputKeyOrder = useUiStore((state) => state.setInputKeyOrder);
  const inputKeyDisabled = useUiStore((state) => state.inputKeyDisabled);
  const setInputKeyDisabled = useUiStore((state) => state.setInputKeyDisabled);
  const quickPresetGroups = useUiStore((state) => state.quickPresetGroups);
  const setQuickPresetGroups = useUiStore((state) => state.setQuickPresetGroups);
  const minuteZoomCandles = useUiStore((state) => state.minuteZoomCandles);
  const setMinuteZoomCandles = useUiStore((state) => state.setMinuteZoomCandles);
  const minuteClipEnd = useUiStore((state) => state.minuteClipEnd);
  const setMinuteClipEnd = useUiStore((state) => state.setMinuteClipEnd);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<
    | "header"
    | "point"
    | "filter"
    | "sheet-id"
    | "tab-settings"
    | "export-import"
    | "csv"
    | "export-fields"
    | "input-keys"
    | "presets"
    | null
  >(null);
  const [sheetConfig, setSheetConfig] = useState<ReadSheetState | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [dbFieldKeys, setDbFieldKeys] = useState<string[]>([]);
  const activeFilters = activeFilterCount(manualFilters);

  useEffect(() => {
    let alive = true;
    fetch("/api/review/read-sheet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReadSheetState | null) => {
        if (alive && data) setSheetConfig(data);
      })
      .catch(() => {});
    fetch("/api/review/sheets/tabs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tabs?: string[] } | null) => {
        if (alive && data?.tabs) setTabs(data.tabs);
      })
      .catch(() => {});
    fetch("/api/review/fields")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { featureKeys?: string[]; manualKeys?: string[] } | null) => {
        if (!alive || !data) return;
        setDbFieldKeys([...(data.featureKeys ?? []), ...(data.manualKeys ?? [])]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openPicker === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPicker, onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  // f 키 append 및 Export 에서 쓸 수 있는 전체 필드 목록.
  // DB 에서 수집한 전체 컬럼 기준. 아직 fetch 전이면 현재 작업셋 기준으로 보임.
  const BASE_KEYS = ["stockCode", "tradeDate", "tradeTime", "stockName", "groupId"];
  const allExportableKeys = [
    ...BASE_KEYS,
    ...(dbFieldKeys.length > 0 ? dbFieldKeys : headerAvailable).filter(
      (k) => !BASE_KEYS.includes(k),
    ),
  ];

  return (
    <div ref={overlayRef} className={styles.settingsOverlay} onClick={handleOverlayClick}>
      <div className={styles.settingsModal}>
        <div className={styles.settingsHeader}>
          <span className={styles.settingsTitle}>설정</span>
          <button type="button" className={styles.settingsClose} onClick={onClose}>
            ✕
          </button>
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

          <div className={styles.settingsGroupLabel}>차트</div>
          <div className={styles.settingsGroup}>
            <SettingsInputRow
              label="확대 캔들 수"
              sub="x 키 확대 시 마커 중심으로 보일 분봉 수"
            >
              <ClearableNumberInput
                value={minuteZoomCandles}
                min={20}
                max={600}
                onCommit={setMinuteZoomCandles}
              />
            </SettingsInputRow>
            <SettingsInputRow
              label="기본 뷰 종료 시각"
              sub="이 시각 이후 봉은 마우스 스크롤로만 (오후장 NXT)"
            >
              <input
                type="time"
                className={styles.settingsInlineInput}
                value={minuteClipEnd}
                onChange={(e) => {
                  if (e.target.value) setMinuteClipEnd(e.target.value);
                }}
              />
            </SettingsInputRow>
          </div>

          <div className={styles.settingsGroupLabel}>타점 입력</div>
          <div className={styles.settingsGroup}>
            <SettingsRow
              label="입력 컬럼 설정"
              sub="표시 순서·활성화/숨기기"
              count={inputKeyDisabled.length > 0 ? inputKeyDisabled.length : undefined}
              onClick={() => setOpenPicker("input-keys")}
            />
            <SettingsRow
              label="퀵 입력 프리셋"
              sub="숫자키 1~4로 값 즉시 적용"
              count={quickPresetGroups.reduce((n, g) => n + g.presets.length, 0) || undefined}
              onClick={() => setOpenPicker("presets")}
            />
          </div>

          <div className={styles.settingsGroupLabel}>내보내기</div>
          <div className={styles.settingsGroup}>
            <SettingsRow
              label="컬럼 설정"
              sub="f키 Append · Export 출력 컬럼과 순서"
              count={exportFieldKeys.length}
              onClick={() => setOpenPicker("export-fields")}
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
              label="시트 ID 설정"
              sub={
                sheetConfig?.spreadsheetId
                  ? `ID: ${sheetConfig.spreadsheetId.slice(0, 24)}…`
                  : "스프레드시트 ID 설정"
              }
              onClick={() => setOpenPicker("sheet-id")}
            />
            <SettingsRow
              label="탭 설정"
              sub={`읽기: ${sheetConfig?.tab ?? "review"} → 쓰기: ${writeTab ?? "미설정"}`}
              onClick={() => setOpenPicker("tab-settings")}
            />
            <SettingsRow
              label="Export / 병합"
              sub="데이터 내보내기 · 시트 → DB 병합"
              onClick={() => setOpenPicker("export-import")}
            />
            <SettingsRow
              label="작업셋 전체 재로드"
              sub="탭 목록 + 전체 캐시 초기화 후 재조회"
              onClick={() => { onReloadAll(); onClose(); }}
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
      {openPicker === "sheet-id" && (
        <SheetIdModal
          config={sheetConfig}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "tab-settings" && (
        <TabSettingsModal
          tabs={tabs}
          config={sheetConfig}
          writeTab={writeTab}
          onWriteTabChange={setWriteTab}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "export-import" && (
        <ExportImportModal
          spreadsheetId={sheetConfig?.spreadsheetId ?? null}
          readTab={sheetConfig?.tab ?? "review"}
          writeTab={writeTab}
          filters={manualFilters}
          activeFilters={activeFilters}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "export-fields" && (
        <ExportFieldsModal
          allKeys={allExportableKeys}
          selected={exportFieldKeys}
          onConfirm={(keys) => {
            setExportFieldKeys(keys);
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "presets" && (
        <PresetConfigModal
          manualFieldKeys={manualFieldKeys}
          valueSuggestions={valueSuggestions}
          groups={quickPresetGroups}
          onConfirm={(groups) => {
            setQuickPresetGroups(groups);
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "csv" && <CsvImportModal onClose={() => setOpenPicker(null)} />}
      {openPicker === "input-keys" && (
        <InputKeyConfigModal
          allKeys={manualFieldKeys}
          keyOrder={inputKeyOrder}
          keyDisabled={inputKeyDisabled}
          onConfirm={(order, disabled) => {
            setInputKeyOrder(order);
            setInputKeyDisabled(disabled);
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}
    </div>
  );
}
