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

  const [customRead, setCustomRead] = useState("");
  const [customWrite, setCustomWrite] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const applyReadTab = async (tab: string) => {
    if (!tab.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId || undefined,
          tab: tab.trim(),
        }),
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
    <ActionModal
      title="탭 설정"
      subtitle="읽기·쓰기 탭을 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        {/* ── 읽기 탭 ── */}
        <div className={sheetStyles.field}>
          <div className={sheetStyles.labelRow}>
            <span className={sheetStyles.label}>읽기 탭</span>
            <span className={sheetStyles.sourceTag}>{currentReadTab}</span>
          </div>
          {tabs.length > 0 && (
            <div className={sheetStyles.tabList}>
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${sheetStyles.tabItem} ${t === currentReadTab ? sheetStyles.tabItemActive : ""}`}
                  onClick={() => applyReadTab(t)}
                  disabled={busy}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className={sheetStyles.inlineRow}>
            <input
              className={sheetStyles.input}
              type="text"
              placeholder="새 탭 이름 직접 입력"
              value={customRead}
              onChange={(e) => setCustomRead(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customRead.trim()) applyReadTab(customRead.trim());
              }}
            />
            <button
              type="button"
              className={sheetStyles.inlineBtn}
              disabled={!customRead.trim() || busy}
              onClick={() => {
                if (customRead.trim()) applyReadTab(customRead.trim());
              }}
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
          {tabs.length > 0 && (
            <div className={sheetStyles.tabList}>
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${sheetStyles.tabItem} ${t === writeTab ? sheetStyles.tabItemActive : ""}`}
                  onClick={() => applyWriteTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className={sheetStyles.inlineRow}>
            <input
              className={sheetStyles.input}
              type="text"
              placeholder="새 탭 이름 직접 입력"
              value={customWrite}
              onChange={(e) => setCustomWrite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customWrite.trim()) applyWriteTab(customWrite.trim());
              }}
            />
            <button
              type="button"
              className={sheetStyles.inlineBtn}
              disabled={!customWrite.trim()}
              onClick={() => {
                if (customWrite.trim()) applyWriteTab(customWrite.trim());
              }}
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
          <button
            type="button"
            className={sheetStyles.ghostBtn}
            onClick={() => applyWriteTab(null)}
          >
            쓰기 탭 해제
          </button>
        </div>
      )}
    </ActionModal>
  );
}
