"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../ReviewWorkspace.module.css";
import sheetStyles from "../SheetModal.module.css";
import { FieldChecklistModal } from "../FieldChecklistModal";
import { ManualFilterModal } from "../ManualFilterModal";
import { activeFilterCount } from "@/lib/manualFilter";
import {
  type PresetGroup,
  type QuickPreset,
  type PresetAction,
  PRESET_HOTKEYS,
  actionLabel,
  newPresetId,
} from "@/lib/quickPreset";
import { useUiStore } from "@/stores/useUiStore";
import { type ReadSheetState, ActionModal } from "./ActionModal";
import { SheetIdModal } from "./SheetIdModal";
import { TabSettingsModal } from "./TabSettingsModal";
import { ExportImportModal } from "./ExportImportModal";
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

// ── 입력 컬럼 설정 모달 ───────────────────────────────────────────────────────

function InputKeyConfigModal({
  allKeys,
  keyOrder,
  keyDisabled,
  onConfirm,
  onClose,
}: {
  allKeys: string[];        // m_ prefix 포함
  keyOrder: string[];       // m_ prefix 포함, 현재 저장된 순서
  keyDisabled: string[];    // m_ prefix 포함, 현재 숨겨진 키
  onConfirm: (order: string[], disabled: string[]) => void;
  onClose: () => void;
}) {
  // 초기 순서: keyOrder 에 있는 것 먼저, 나머지는 뒤에 붙임.
  const buildInitial = () => {
    const ordered = keyOrder.filter((k) => allKeys.includes(k));
    const rest = allKeys.filter((k) => !ordered.includes(k));
    return [...ordered, ...rest];
  };

  const [order, setOrder] = useState<string[]>(buildInitial);
  const [disabled, setDisabled] = useState<string[]>([...keyDisabled]);

  const active = order.filter((k) => !disabled.includes(k));
  const hidden = order.filter((k) => disabled.includes(k));

  const moveUp = (key: string) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (key: string) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      if (i === -1 || i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const hide = (key: string) => setDisabled((prev) => [...prev, key]);
  const show = (key: string) => setDisabled((prev) => prev.filter((k) => k !== key));

  return (
    <ActionModal
      title="입력 컬럼 설정"
      subtitle="타점 입력창에서 표시할 컬럼과 순서를 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        {/* 활성 컬럼 */}
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>활성 컬럼 (순서)</span>
          {active.length === 0 && (
            <span className={sheetStyles.hint}>모든 컬럼이 숨겨져 있습니다.</span>
          )}
          {active.map((key, idx) => (
              <div key={key} className={sheetStyles.inputKeyRow}>
                <span className={sheetStyles.inputKeyLabel}>{key}</span>
                <div className={sheetStyles.inputKeyActions}>
                  <button
                    type="button"
                    className={sheetStyles.reorderBtn}
                    onClick={() => moveUp(key)}
                    disabled={idx === 0}
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={sheetStyles.reorderBtn}
                    onClick={() => moveDown(key)}
                    disabled={idx === active.length - 1}
                    title="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={sheetStyles.inputKeyToggleBtn}
                    onClick={() => hide(key)}
                    title="숨기기"
                  >
                    숨기기
                  </button>
                </div>
              </div>
          ))}
        </div>

        {/* 숨겨진 컬럼 */}
        {hidden.length > 0 && (
          <div className={sheetStyles.field}>
            <span className={sheetStyles.label}>숨겨진 컬럼</span>
            {hidden.map((key) => (
              <div key={key} className={sheetStyles.inputKeyRow}>
                <span className={`${sheetStyles.inputKeyLabel} ${sheetStyles.inputKeyLabelDisabled}`}>
                  {key}
                </span>
                <div className={sheetStyles.inputKeyActions}>
                  <button
                    type="button"
                    className={sheetStyles.inputKeyToggleBtn}
                    onClick={() => show(key)}
                    title="표시"
                  >
                    표시
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={sheetStyles.footer}>
        <button
          type="button"
          className={sheetStyles.primaryBtn}
          onClick={() => onConfirm(order, disabled)}
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

// ── 퀵 입력 프리셋 설정 모달 ──────────────────────────────────────────────────

const PRESET_ACTIONS: PresetAction[] = ["overwrite", "append", "delete"];

/** 앞의 "m_" 접두사를 떼어 원본 키만 남긴다. */
function stripManualPrefix(raw: string): string {
  const k = raw.trim();
  return k.startsWith("m_") ? k.slice(2) : k;
}

function PresetConfigModal({
  manualFieldKeys,
  valueSuggestions,
  groups,
  onConfirm,
  onClose,
}: {
  manualFieldKeys: string[];                    // m_ 접두사 포함
  valueSuggestions: Record<string, string[]>;   // 접두사 없는 키 → 값 목록
  groups: PresetGroup[];
  onConfirm: (groups: PresetGroup[]) => void;
  onClose: () => void;
}) {
  // 깊은 복사본을 편집하고 저장 시 반영.
  const [draft, setDraft] = useState<PresetGroup[]>(() =>
    PRESET_HOTKEYS.map((hotkey) => {
      const found = groups.find((g) => g.hotkey === hotkey);
      return {
        hotkey,
        presets: (found?.presets ?? []).map((p) => ({
          ...p,
          entries: p.entries.map((e) => ({ ...e })),
        })),
      };
    }),
  );
  const [activeHotkey, setActiveHotkey] = useState<string>(PRESET_HOTKEYS[0]);

  const group = draft.find((g) => g.hotkey === activeHotkey) ?? draft[0];

  // 활성 그룹의 presets 를 갱신.
  const updateActivePresets = (updater: (presets: QuickPreset[]) => QuickPreset[]) => {
    setDraft((prev) =>
      prev.map((g) => (g.hotkey === activeHotkey ? { ...g, presets: updater(g.presets) } : g)),
    );
  };

  const updatePreset = (id: string, patch: Partial<QuickPreset>) =>
    updateActivePresets((presets) => presets.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPreset = () =>
    updateActivePresets((presets) => [
      ...presets,
      { id: newPresetId(), name: "", entries: [] },
    ]);

  const removePreset = (id: string) =>
    updateActivePresets((presets) => presets.filter((p) => p.id !== id));

  const movePreset = (id: string, dir: -1 | 1) =>
    updateActivePresets((presets) => {
      const i = presets.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= presets.length) return presets;
      const next = [...presets];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addEntry = (presetId: string) =>
    updateActivePresets((presets) =>
      presets.map((p) =>
        p.id === presetId
          ? { ...p, entries: [...p.entries, { key: "", action: "overwrite", value: "" }] }
          : p,
      ),
    );

  const updateEntry = (
    presetId: string,
    idx: number,
    patch: Partial<QuickPreset["entries"][number]>,
  ) =>
    updateActivePresets((presets) =>
      presets.map((p) =>
        p.id === presetId
          ? { ...p, entries: p.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)) }
          : p,
      ),
    );

  const removeEntry = (presetId: string, idx: number) =>
    updateActivePresets((presets) =>
      presets.map((p) =>
        p.id === presetId ? { ...p, entries: p.entries.filter((_, i) => i !== idx) } : p,
      ),
    );

  return (
    <ActionModal
      title="퀵 입력 프리셋"
      subtitle="숫자키 1~4로 적용할 프리셋을 정의합니다. 같은 숫자에 여러 프리셋을 두면 순회됩니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        {/* 그룹 선택 (숫자키) */}
        <div className={sheetStyles.presetGroupTabs}>
          {draft.map((g) => (
            <button
              key={g.hotkey}
              type="button"
              className={`${sheetStyles.presetGroupTab} ${
                g.hotkey === activeHotkey ? sheetStyles.presetGroupTabActive : ""
              }`}
              onClick={() => setActiveHotkey(g.hotkey)}
            >
              <span className={sheetStyles.presetGroupTabKey}>{g.hotkey}</span>
              {g.presets.length > 0 && (
                <span className={sheetStyles.presetGroupTabCount}>{g.presets.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* 활성 그룹의 프리셋 목록 */}
        {group.presets.length === 0 && (
          <span className={sheetStyles.hint}>
            아직 프리셋이 없습니다. 아래 ‘프리셋 추가’로 만들어 주세요.
          </span>
        )}

        {group.presets.map((preset, pIdx) => (
          <div key={preset.id} className={sheetStyles.presetCard}>
            <div className={sheetStyles.presetCardHead}>
              <input
                className={sheetStyles.input}
                placeholder="프리셋 이름"
                value={preset.name}
                onChange={(e) => updatePreset(preset.id, { name: e.target.value })}
              />
              <button
                type="button"
                className={sheetStyles.reorderBtn}
                onClick={() => movePreset(preset.id, -1)}
                disabled={pIdx === 0}
                title="위로"
              >
                ↑
              </button>
              <button
                type="button"
                className={sheetStyles.reorderBtn}
                onClick={() => movePreset(preset.id, 1)}
                disabled={pIdx === group.presets.length - 1}
                title="아래로"
              >
                ↓
              </button>
              <button
                type="button"
                className={sheetStyles.removeBtn}
                onClick={() => removePreset(preset.id)}
                title="프리셋 삭제"
              >
                ✕
              </button>
            </div>

            {preset.entries.map((entry, eIdx) => {
              const valueList = valueSuggestions[entry.key] ?? [];
              const valueListId = `preset-val-${preset.id}-${eIdx}`;
              return (
                <div key={eIdx} className={sheetStyles.presetEntryRow}>
                  <input
                    className={sheetStyles.presetEntryKey}
                    list="preset-key-list"
                    placeholder="m_컬럼"
                    value={entry.key ? `m_${entry.key}` : ""}
                    onChange={(e) =>
                      updateEntry(preset.id, eIdx, { key: stripManualPrefix(e.target.value) })
                    }
                  />
                  <select
                    className={sheetStyles.presetEntryAction}
                    value={entry.action}
                    onChange={(e) =>
                      updateEntry(preset.id, eIdx, { action: e.target.value as PresetAction })
                    }
                  >
                    {PRESET_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {actionLabel(a)}
                      </option>
                    ))}
                  </select>
                  <input
                    className={sheetStyles.presetEntryValue}
                    list={valueListId}
                    placeholder={entry.action === "delete" ? "(삭제)" : "값"}
                    value={entry.value}
                    disabled={entry.action === "delete"}
                    onChange={(e) => updateEntry(preset.id, eIdx, { value: e.target.value })}
                  />
                  {valueList.length > 0 && (
                    <datalist id={valueListId}>
                      {valueList.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  )}
                  <button
                    type="button"
                    className={sheetStyles.removeBtn}
                    onClick={() => removeEntry(preset.id, eIdx)}
                    title="항목 제거"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              className={sheetStyles.addFieldBtn}
              onClick={() => addEntry(preset.id)}
            >
              + 항목 추가
            </button>
          </div>
        ))}

        <button type="button" className={sheetStyles.presetAddBtn} onClick={addPreset}>
          + 프리셋 추가
        </button>

        {/* 컬럼 자동완성용 공유 datalist */}
        <datalist id="preset-key-list">
          {manualFieldKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>

      <div className={sheetStyles.footer}>
        <button type="button" className={sheetStyles.primaryBtn} onClick={() => onConfirm(draft)}>
          저장
        </button>
        <button type="button" className={sheetStyles.ghostBtn} onClick={onClose}>
          취소
        </button>
      </div>
    </ActionModal>
  );
}
