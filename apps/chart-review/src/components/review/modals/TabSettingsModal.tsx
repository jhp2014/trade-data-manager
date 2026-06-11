"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type ReadSheetState } from "./ActionModal";
import { useUiStore } from "@/stores/useUiStore";
import { postJson } from "@/lib/apiClient";

export function TabSettingsModal({
  tabs,
  config,
  writeTab,
  onWriteTabChange,
  onClose,
}: {
  tabs: string[];
  config: ReadSheetState | null;
  writeTab: string | null;
  onWriteTabChange: (tab: string | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const currentReadTab = config?.tab ?? "review";
  const spreadsheetId = config?.spreadsheetId ?? "";

  const cycleTabList = useUiStore((state) => state.cycleTabList);
  const setCycleTabList = useUiStore((state) => state.setCycleTabList);

  const [writeInput, setWriteInput] = useState(writeTab ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // 탭이 순환 목록에 포함되는지 여부.
  const isTabCycleEnabled = (tab: string) =>
    cycleTabList === null ? true : cycleTabList.includes(tab);

  // 순환 체크박스 토글. 현재 tabs 기준으로 explicit list ↔ null(전체) 관리.
  const toggleTabCycle = (tab: string) => {
    const effective = cycleTabList ?? tabs;
    const has = effective.includes(tab);
    const newList = has ? effective.filter((t) => t !== tab) : [...effective, tab];
    // 전체 탭이 포함되면 null(전체 순환)으로 단순화.
    setCycleTabList(newList.length === tabs.length ? null : newList);
  };

  const applyReadTab = async (tab: string) => {
    if (!tab || tab === currentReadTab) return;
    setBusy(true);
    setStatus(null);
    try {
      await postJson(
        "/api/review/read-sheet",
        { spreadsheetId: spreadsheetId || undefined, tab },
        "저장 실패",
      );
      useUiStore.getState().clearManualFilters();
      router.refresh();
      onClose();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  };

  const applyWriteTab = (tab: string | null) => {
    onWriteTabChange(tab);
    onClose();
  };

  return (
    <ActionModal title="탭 설정" subtitle="읽기·쓰기 탭을 설정합니다." onClose={onClose}>
      <div className={sheetStyles.body}>

        {/* ── 읽기 탭 ── */}
        <div className={sheetStyles.field}>
          <div className={sheetStyles.labelRow}>
            <span className={sheetStyles.label}>읽기 탭</span>
            <span className={sheetStyles.sourceTag}>{currentReadTab}</span>
          </div>
          {tabs.length === 0 ? (
            <span className={sheetStyles.hint}>불러올 수 있는 탭이 없습니다.</span>
          ) : (
            <>
              <div className={sheetStyles.tabRowList}>
                {tabs.map((t) => (
                  <div key={t} className={sheetStyles.tabRow}>
                    <label className={sheetStyles.tabRowCheck} title="r키·칩 클릭으로 순환">
                      <input
                        type="checkbox"
                        checked={isTabCycleEnabled(t)}
                        onChange={() => toggleTabCycle(t)}
                      />
                    </label>
                    <span className={sheetStyles.tabRowLabel}>{t}</span>
                    {t === currentReadTab && (
                      <span className={sheetStyles.tabRowCurBadge}>현재</span>
                    )}
                    <button
                      type="button"
                      className={sheetStyles.tabRowApplyBtn}
                      onClick={() => applyReadTab(t)}
                      disabled={busy || t === currentReadTab}
                    >
                      {t === currentReadTab ? "읽는 중" : "선택"}
                    </button>
                  </div>
                ))}
              </div>
              <span className={sheetStyles.hint}>
                체크된 탭만 r키·칩 클릭으로 순환됩니다.
              </span>
            </>
          )}
        </div>

        <div className={sheetStyles.sectionDivider} />

        {/* ── 쓰기 탭 ── */}
        <div className={sheetStyles.field}>
          <div className={sheetStyles.labelRow}>
            <span className={sheetStyles.label}>쓰기 탭</span>
            {writeTab
              ? <span className={sheetStyles.sourceTag}>{writeTab}</span>
              : <span className={sheetStyles.sourceWarn}>미설정</span>
            }
          </div>
          <div className={sheetStyles.inlineRow}>
            <input
              id="tab-write-input"
              list="tab-write-list"
              className={sheetStyles.input}
              placeholder="탭 선택 또는 직접 입력"
              value={writeInput}
              onChange={(e) => setWriteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && writeInput.trim()) applyWriteTab(writeInput.trim());
              }}
              autoComplete="off"
            />
            {tabs.length > 0 && (
              <datalist id="tab-write-list">
                {tabs.map((t) => <option key={t} value={t} />)}
              </datalist>
            )}
            <button
              type="button"
              className={sheetStyles.inlineBtn}
              onClick={() => { if (writeInput.trim()) applyWriteTab(writeInput.trim()); }}
              disabled={!writeInput.trim()}
            >
              적용
            </button>
          </div>
          <span className={sheetStyles.hint}>f 키 Append 의 기본 쓰기 대상입니다.</span>
        </div>

      </div>

      {status && (
        <div className={`${sheetStyles.status} ${status.ok ? sheetStyles.statusOk : sheetStyles.statusErr}`}>
          {status.message}
        </div>
      )}

      {writeTab && (
        <div className={sheetStyles.footer}>
          <button type="button" className={sheetStyles.ghostBtn} onClick={() => applyWriteTab(null)}>
            쓰기 탭 해제
          </button>
        </div>
      )}
    </ActionModal>
  );
}
