"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../ReviewWorkspace.module.css";
import sheetStyles from "../SheetModal.module.css";
import { FieldChecklistModal } from "../FieldChecklistModal";
import { ManualFilterModal } from "../ManualFilterModal";
import { activeFilterCount } from "@/lib/manualFilter";
import { useUiStore } from "@/stores/useUiStore";
import { type ReadSheetState, type SheetDefaults, ActionModal } from "./ActionModal";
import { ReadSheetModal } from "./ReadSheetModal";
import { ExportModal } from "./ExportModal";
import { ImportModal } from "./ImportModal";
import { CsvImportModal } from "./CsvImportModal";

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
  const writeTab = useUiStore((state) => state.writeTab);
  const setWriteTab = useUiStore((state) => state.setWriteTab);
  const exportFieldKeys = useUiStore((state) => state.exportFieldKeys);
  const setExportFieldKeys = useUiStore((state) => state.setExportFieldKeys);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<
    | "header"
    | "point"
    | "filter"
    | "read"
    | "write-tab"
    | "export"
    | "import"
    | "csv"
    | "export-fields"
    | null
  >(null);
  const [sheetConfig, setSheetConfig] = useState<ReadSheetState | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
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
    return () => {
      alive = false;
    };
  }, []);

  const defaults: SheetDefaults = {
    spreadsheetId: sheetConfig?.spreadsheetId ?? "",
    tab: sheetConfig?.tab ?? "review",
  };

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
  const allExportableKeys = [
    "stockCode",
    "tradeDate",
    "tradeTime",
    "stockName",
    ...headerAvailable,
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
              label="읽기 시트 (작업셋)"
              sub={sheetConfig?.spreadsheetId ? `ID: ${sheetConfig.spreadsheetId.slice(0, 20)}…` : "스프레드시트 ID · 읽기 탭 설정"}
              onClick={() => setOpenPicker("read")}
            />
            <SettingsRow
              label="쓰기 탭"
              sub={writeTab ? `현재: ${writeTab}` : "미설정 — f 키 Append 비활성"}
              onClick={() => setOpenPicker("write-tab")}
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
          tabs={tabs}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "write-tab" && (
        <WriteTabModal
          tabs={tabs}
          writeTab={writeTab}
          onConfirm={(t) => {
            setWriteTab(t);
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "export" && (
        <ExportModal
          filters={manualFilters}
          activeFilters={activeFilters}
          defaults={defaults}
          tabs={tabs}
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
      {openPicker === "import" && (
        <ImportModal defaults={defaults} onClose={() => setOpenPicker(null)} />
      )}
      {openPicker === "csv" && <CsvImportModal onClose={() => setOpenPicker(null)} />}
    </div>
  );
}

// ── 쓰기 탭 설정 모달 ──────────────────────────────────────────────────────

function WriteTabModal({
  tabs,
  writeTab,
  onConfirm,
  onClose,
}: {
  tabs: string[];
  writeTab: string | null;
  onConfirm: (tab: string | null) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");

  return (
    <ActionModal
      title="쓰기 탭 설정"
      subtitle="f 키 Append 및 Export 의 기본 대상 탭을 지정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        {tabs.length > 0 && (
          <div className={sheetStyles.field}>
            <span className={sheetStyles.label}>탭 선택</span>
            <div className={sheetStyles.tabList}>
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`${sheetStyles.tabItem} ${tab === writeTab ? sheetStyles.tabItemActive : ""}`}
                  onClick={() => onConfirm(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>직접 입력 (새 탭)</span>
          <div className={sheetStyles.inlineRow}>
            <input
              className={sheetStyles.input}
              type="text"
              placeholder="새 탭 이름 입력"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) onConfirm(input.trim());
              }}
            />
            <button
              type="button"
              className={sheetStyles.inlineBtn}
              onClick={() => {
                if (input.trim()) onConfirm(input.trim());
              }}
            >
              확인
            </button>
          </div>
        </div>
      </div>
      <div className={sheetStyles.footer}>
        {writeTab && (
          <button
            type="button"
            className={sheetStyles.ghostBtn}
            onClick={() => onConfirm(null)}
          >
            미설정으로
          </button>
        )}
      </div>
    </ActionModal>
  );
}

// ── 내보내기 컬럼 설정 모달 ────────────────────────────────────────────────

function ExportFieldsModal({
  allKeys,
  selected,
  onConfirm,
  onClose,
}: {
  allKeys: string[];
  selected: string[];
  onConfirm: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<string[]>([...selected]);
  const available = allKeys.filter((k) => !current.includes(k));

  const moveUp = (i: number) => {
    if (i === 0) return;
    setCurrent((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (i: number) => {
    if (i === current.length - 1) return;
    setCurrent((prev) => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const remove = (i: number) => {
    setCurrent((prev) => prev.filter((_, idx) => idx !== i));
  };

  const add = (key: string) => {
    setCurrent((prev) => [...prev, key]);
  };

  return (
    <ActionModal
      title="내보내기 컬럼 설정"
      subtitle="f 키 Append · Export 에서 출력할 컬럼과 순서를 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>내보낼 컬럼 (순서)</span>
          {current.length === 0 && (
            <span className={sheetStyles.hint}>아래에서 컬럼을 추가하세요.</span>
          )}
          {current.map((key, i) => (
            <div key={key} className={sheetStyles.fieldRow}>
              <span className={sheetStyles.fieldRowKey}>{key}</span>
              <div className={sheetStyles.fieldRowActions}>
                <button
                  type="button"
                  className={sheetStyles.reorderBtn}
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={sheetStyles.reorderBtn}
                  onClick={() => moveDown(i)}
                  disabled={i === current.length - 1}
                  title="아래로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={sheetStyles.removeBtn}
                  onClick={() => remove(i)}
                  title="제거"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {available.length > 0 && (
          <div className={sheetStyles.field}>
            <span className={sheetStyles.label}>추가 가능</span>
            <div className={sheetStyles.availableList}>
              {available.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={sheetStyles.addFieldBtn}
                  onClick={() => add(key)}
                >
                  + {key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={sheetStyles.footer}>
        <button
          type="button"
          className={sheetStyles.primaryBtn}
          onClick={() => onConfirm(current)}
        >
          저장
        </button>
        <button type="button" className={sheetStyles.ghostBtn} onClick={onClose}>
          취소
        </button>
      </div>
    </ActionModal>
  );
}
