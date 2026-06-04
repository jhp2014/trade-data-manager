"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type ReadSheetState } from "./ActionModal";

export function SheetIdModal({
  config,
  onClose,
}: {
  config: ReadSheetState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(config?.spreadsheetId ?? "");
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
        body: JSON.stringify({ spreadsheetId: id, tab: config?.tab }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setStatus({ ok: true, message: "저장되었습니다. 탭 목록을 새로고침합니다." });
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
      setStatus({ ok: true, message: "기본값(.env)으로 되돌렸습니다." });
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
        : "미설정";

  return (
    <ActionModal
      title="시트 ID 설정"
      subtitle="작업에 사용할 Google Spreadsheet ID 를 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.sourceRow}>
          <span>현재 소스</span>
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
            placeholder="스프레드시트 URL 의 /d/…/edit 사이 문자열"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
          />
          <span className={sheetStyles.hint}>
            Google Sheets URL 에서 <code>/d/</code> 뒤, <code>/edit</code> 앞의 긴 문자열을 붙여넣으세요.
          </span>
        </div>
      </div>
      {status && (
        <div className={`${sheetStyles.status} ${status.ok ? sheetStyles.statusOk : sheetStyles.statusErr}`}>
          {status.message}
        </div>
      )}
      <div className={sheetStyles.footer}>
        <button type="button" className={sheetStyles.primaryBtn} onClick={apply} disabled={busy}>
          {busy ? "저장 중…" : "저장"}
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
