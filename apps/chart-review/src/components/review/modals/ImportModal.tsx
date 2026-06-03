"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal, type SheetDefaults } from "./ActionModal";

export function ImportModal({ defaults, onClose }: { defaults: SheetDefaults; onClose: () => void }) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleImport = async () => {
    if (
      !window.confirm(
        "시트의 비어있지 않은 m_ 값을 DB에 병합합니다.\n(빈 셀은 건드리지 않고, 값이 있는 셀만 덮어씁니다.)\n진행할까요?",
      )
    )
      return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/import-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId.trim() || undefined,
          tab: tab.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import 실패");
      const parts = [`병합 ${data.merged}건`];
      if (data.skippedNotFound > 0) parts.push(`미발견 ${data.skippedNotFound}건`);
      if (data.skippedNoValues > 0) parts.push(`값없음 ${data.skippedNoValues}건`);
      setStatus({ ok: true, message: `완료: ${parts.join(" · ")} (전체 ${data.total}행)` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionModal
      title="Sheet → DB 병합 Import"
      subtitle="시트의 m_ 값을 DB 타점에 병합합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.banner}>
          <span className={sheetStyles.bannerIcon}>↧</span>
          <span>
            값이 있는 m_ 셀만 덮어쓰고, <strong>빈 셀은 그대로 보존</strong>합니다. 찾지 못한 타점은
            건너뛰고 결과에 보고합니다.
          </span>
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>스프레드시트 ID</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="비우면 읽기 시트 설정 사용"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>탭 이름</span>
          <input
            className={sheetStyles.input}
            type="text"
            placeholder="비우면 읽기 시트 설정 사용"
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
        <button type="button" className={sheetStyles.primaryBtn} onClick={handleImport} disabled={busy}>
          {busy ? "병합 중…" : "Sheet → DB 병합"}
        </button>
      </div>
    </ActionModal>
  );
}
