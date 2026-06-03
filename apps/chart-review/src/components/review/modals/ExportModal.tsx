"use client";

import { useState } from "react";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type SheetDefaults } from "./ActionModal";

type ExportModalProps = {
  filters: Record<string, string[]>;
  activeFilters: number;
  defaults: SheetDefaults;
  onClose: () => void;
};

export function ExportModal({ filters, activeFilters, defaults, onClose }: ExportModalProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [scope, setScope] = useState<"working" | "all">("working");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId.trim() || undefined,
          tab: tab.trim() || undefined,
          filters,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export 실패");
      const scopeLabel = data.scope === "all" ? "DB 전체" : "작업셋";
      setStatus({
        ok: true,
        message: `완료: '${data.tab}' 탭에 ${data.rows}행 · ${data.cols}열 (${scopeLabel}${data.filtered ? " · 필터" : ""})`,
      });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionModal
      title="Google Sheet Export"
      subtitle="타점을 스프레드시트로 내보냅니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>내보낼 범위</span>
          <div className={sheetStyles.segmented}>
            <button
              type="button"
              className={`${sheetStyles.seg} ${scope === "working" ? sheetStyles.segOn : ""}`}
              onClick={() => setScope("working")}
            >
              현재 작업셋
            </button>
            <button
              type="button"
              className={`${sheetStyles.seg} ${scope === "all" ? sheetStyles.segOn : ""}`}
              onClick={() => setScope("all")}
            >
              DB 전체
            </button>
          </div>
          <span className={sheetStyles.hint}>
            {scope === "all"
              ? "DB 의 모든 타점을 내보냅니다."
              : "현재 작업셋(읽기 시트 범위)의 타점만 내보냅니다."}
            {activeFilters > 0 && ` · m_ 필터 ${activeFilters}개 매칭만`}
          </span>
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>스프레드시트 ID</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="비우면 기본값 사용"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>탭 이름</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="비우면 기본값 · 없으면 새로 생성"
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
        <button type="button" className={sheetStyles.primaryBtn} onClick={handleExport} disabled={busy}>
          {busy ? "내보내는 중…" : "Export"}
        </button>
      </div>
    </ActionModal>
  );
}
