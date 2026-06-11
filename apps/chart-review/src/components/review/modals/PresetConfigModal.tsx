"use client";

import { useState } from "react";
import sheetStyles from "../SheetModal.module.css";
import {
  type PresetGroup,
  type QuickPreset,
  type PresetAction,
  PRESET_HOTKEYS,
  actionLabel,
  newPresetId,
} from "@/lib/quickPreset";
import { ActionModal } from "./ActionModal";
import { moveItem } from "@/lib/reorder";
import { stripManualPrefix } from "@/lib/manualValue";

// ── 퀵 입력 프리셋 설정 모달 ──────────────────────────────────────────────────

const PRESET_ACTIONS: PresetAction[] = ["overwrite", "append", "delete"];

export function PresetConfigModal({
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
    updateActivePresets((presets) =>
      moveItem(presets, presets.findIndex((p) => p.id === id), dir),
    );

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
                      updateEntry(preset.id, eIdx, { key: stripManualPrefix(e.target.value.trim()) })
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
