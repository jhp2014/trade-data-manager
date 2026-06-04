"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal } from "./ActionModal";

type Props = {
  spreadsheetId: string | null;
  readTab: string;
  writeTab: string | null;
  filters: Record<string, string[]>;
  activeFilters: number;
  onClose: () => void;
};

export function ExportImportModal({
  spreadsheetId,
  readTab,
  writeTab,
  filters,
  activeFilters,
  onClose,
}: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<"export" | "import">("export");
  const [scope, setScope] = useState<"working" | "all">("working");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const switchPanel = (p: "export" | "import") => {
    setPanel(p);
    setStatus(null);
  };

  const handleExport = async () => {
    if (!writeTab) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId || undefined,
          tab: writeTab,
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
          spreadsheetId: spreadsheetId || undefined,
          tab: readTab || undefined,
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
      title="Export / 병합"
      subtitle="데이터 내보내기와 시트 병합을 관리합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.panelToggleWrap}>
        <div className={sheetStyles.segmented}>
          <button
            type="button"
            className={`${sheetStyles.seg} ${panel === "export" ? sheetStyles.segOn : ""}`}
            onClick={() => switchPanel("export")}
          >
            Export
          </button>
          <button
            type="button"
            className={`${sheetStyles.seg} ${panel === "import" ? sheetStyles.segOn : ""}`}
            onClick={() => switchPanel("import")}
          >
            병합 Import
          </button>
        </div>
      </div>

      <div className={sheetStyles.body}>
        {panel === "export" ? (
          <>
            <div className={sheetStyles.sourceRow}>
              <span>쓰기 탭</span>
              {writeTab
                ? <span className={sheetStyles.sourceTag}>{writeTab}</span>
                : <span className={sheetStyles.sourceWarn}>미설정 — 탭 설정에서 먼저 지정하세요</span>
              }
            </div>
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
          </>
        ) : (
          <>
            <div className={sheetStyles.sourceRow}>
              <span>읽기 탭</span>
              <span className={sheetStyles.sourceTag}>{readTab}</span>
            </div>
            <div className={sheetStyles.banner}>
              <span className={sheetStyles.bannerIcon}>↧</span>
              <span>
                값이 있는 m_ 셀만 덮어쓰고, <strong>빈 셀은 그대로 보존</strong>합니다. 찾지 못한
                타점은 건너뛰고 결과에 보고합니다.
              </span>
            </div>
          </>
        )}
      </div>

      {status && (
        <div className={`${sheetStyles.status} ${status.ok ? sheetStyles.statusOk : sheetStyles.statusErr}`}>
          {status.message}
        </div>
      )}

      <div className={sheetStyles.footer}>
        {panel === "export" ? (
          <button
            type="button"
            className={sheetStyles.primaryBtn}
            onClick={handleExport}
            disabled={busy || !writeTab}
            title={!writeTab ? "탭 설정에서 쓰기 탭을 먼저 지정하세요." : undefined}
          >
            {busy ? "내보내는 중…" : "Export"}
          </button>
        ) : (
          <button
            type="button"
            className={sheetStyles.primaryBtn}
            onClick={handleImport}
            disabled={busy}
          >
            {busy ? "병합 중…" : "Sheet → DB 병합"}
          </button>
        )}
      </div>
    </ActionModal>
  );
}
