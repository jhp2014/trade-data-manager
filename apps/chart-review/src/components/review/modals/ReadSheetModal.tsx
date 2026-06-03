"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type ReadSheetState, type SheetDefaults } from "./ActionModal";
import { useUiStore } from "@/stores/useUiStore";

export function ReadSheetModal({
  config,
  defaults,
  onClose,
}: {
  config: ReadSheetState | null;
  defaults: SheetDefaults;
  onClose: () => void;
}) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const apply = async () => {
    const id = spreadsheetId.trim();
    if (!id) {
      setStatus({ ok: false, message: "스프레드시트 ID 를 입력하세요." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: id, tab: tab.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "설정 저장 실패");
      setStatus({ ok: true, message: `'${data.tab}' 탭 기준으로 작업셋을 다시 불러옵니다.` });
      // 시트가 바뀌면 이전 작업셋 기준 필터는 의미가 없으므로 먼저 해제한다.
      useUiStore.getState().clearManualFilters();
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", { method: "DELETE" });
      if (!res.ok) throw new Error("초기화 실패");
      setSpreadsheetId("");
      setTab("");
      setStatus({ ok: true, message: "기본값(.env)으로 되돌렸습니다." });
      useUiStore.getState().clearManualFilters();
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel =
    config?.source === "cookie"
      ? "앱 설정(쿠키)"
      : config?.source === "env"
        ? "기본값(.env)"
        : "미설정 → DB 전체";

  return (
    <ActionModal
      title="읽기 시트 (작업셋)"
      subtitle="작업셋을 정의할 스프레드시트를 지정합니다. 미설정 시 DB 전체를 사용합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.sourceRow}>
          <span>현재 작업셋</span>
          <span className={sheetStyles.sourceTag}>{sourceLabel}</span>
          {config && !config.hasCredentials && (
            <span className={sheetStyles.sourceWarn}>· 서비스 계정 자격증명 없음</span>
          )}
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>스프레드시트 ID</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="스프레드시트 ID 를 입력하세요"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>탭 이름</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="비우면 review"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
          />
        </div>
      </div>
      {status && (
        <div className={`${sheetStyles.status} ${status.ok ? sheetStyles.statusOk : sheetStyles.statusErr}`}>
          {status.message}
        </div>
      )}
      <div className={sheetStyles.footer}>
        <button type="button" className={sheetStyles.primaryBtn} onClick={apply} disabled={busy}>
          {busy ? "적용 중…" : "이 시트로 불러오기"}
        </button>
        <button
          type="button"
          className={sheetStyles.ghostBtn}
          onClick={reset}
          disabled={busy || config?.source !== "cookie"}
        >
          기본값으로
        </button>
      </div>
    </ActionModal>
  );
}
