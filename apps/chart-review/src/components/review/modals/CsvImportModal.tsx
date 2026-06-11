"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal } from "./ActionModal";
import { postJson } from "@/lib/apiClient";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type CsvDirState = {
  dir: string;
  source: "env" | "default";
  exists: boolean;
  pending: number;
  pendingFiles: string[];
};

export function CsvImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<CsvDirState | null>(null);
  const { busy, status, run } = useAsyncAction();

  const loadInfo = useCallback(() => {
    fetch("/api/review/import-csv")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CsvDirState | null) => {
        if (data) setInfo(data);
      })
      .catch(() => {
        /* 무시 */
      });
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const handleRun = () =>
    run(async () => {
      const data = await postJson<{
        totalFiles: number;
        totalTargets: number;
        errors: unknown[];
      }>("/api/review/import-csv", undefined, "CSV 적재 실패");
      loadInfo();
      router.refresh();
      if (data.totalFiles === 0) {
        return "처리할 Capture CSV 파일이 없습니다.";
      }
      const parts = [`${data.totalFiles}개 파일`, `타겟 ${data.totalTargets}건`];
      if (data.errors.length > 0) parts.push(`오류 ${data.errors.length}건`);
      return {
        ok: data.errors.length === 0,
        message: `완료: ${parts.join(" · ")} (processed 로 이동)`,
      };
    });

  return (
    <ActionModal
      title="CSV 타겟 불러오기"
      subtitle="Capture CSV 의 종목·라인값을 review_target 으로 적재합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.banner}>
          <span className={sheetStyles.bannerIcon}>↧</span>
          <span>
            중복 종목/날짜는 <strong>덮어쓰기</strong> 되며, 읽은 파일은 <code>processed/</code> 로
            이동합니다. 라인값을 고치려면 파일을 processed 에서 빼고 다시 실행하세요.
          </span>
        </div>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>CSV 디렉터리</span>
          <div className={sheetStyles.pathBox}>{info?.dir ?? "…"}</div>
          <span className={sheetStyles.hint}>
            {info?.source === "env"
              ? "환경변수 CHART_REVIEW_TARGET_DIR 사용"
              : "기본 경로 · CHART_REVIEW_TARGET_DIR 로 변경 가능"}
          </span>
        </div>
        <div className={sheetStyles.sourceRow}>
          <span>대기 중인 파일</span>
          {info && !info.exists ? (
            <span className={sheetStyles.sourceWarn}>경로 없음</span>
          ) : (
            <span className={sheetStyles.sourceTag}>{info?.pending ?? 0}개</span>
          )}
        </div>
      </div>
      {status && (
        <div className={`${sheetStyles.status} ${status.ok ? sheetStyles.statusOk : sheetStyles.statusErr}`}>
          {status.message}
        </div>
      )}
      <div className={sheetStyles.footer}>
        <button
          type="button"
          className={sheetStyles.primaryBtn}
          onClick={handleRun}
          disabled={busy || (info != null && !info.exists)}
        >
          {busy ? "적재 중…" : "CSV 적재 실행"}
        </button>
      </div>
    </ActionModal>
  );
}
