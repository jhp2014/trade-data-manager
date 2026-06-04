"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type ReadSheetState } from "./ActionModal";
import { useUiStore } from "@/stores/useUiStore";

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

  const [readInput, setReadInput] = useState(currentReadTab);
  const [writeInput, setWriteInput] = useState(writeTab ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const applyReadTab = async () => {
    const tab = readInput.trim();
    if (!tab) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: spreadsheetId || undefined, tab }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
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
          <div className={sheetStyles.inlineRow}>
            <input
              id="tab-read-input"
              list="tab-read-list"
              className={sheetStyles.input}
              placeholder="탭 선택 또는 직접 입력"
              value={readInput}
              onChange={(e) => setReadInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyReadTab(); }}
              disabled={busy}
              autoComplete="off"
            />
            {tabs.length > 0 && (
              <datalist id="tab-read-list">
                {tabs.map((t) => <option key={t} value={t} />)}
              </datalist>
            )}
            <button
              type="button"
              className={sheetStyles.inlineBtn}
              onClick={applyReadTab}
              disabled={!readInput.trim() || busy}
            >
              적용
            </button>
          </div>
          <span className={sheetStyles.hint}>변경 시 필터가 초기화되고 작업셋이 새로고침됩니다.</span>
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
              onKeyDown={(e) => { if (e.key === "Enter" && writeInput.trim()) applyWriteTab(writeInput.trim()); }}
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
