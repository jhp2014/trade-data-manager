"use client";

import { useEffect, useRef } from "react";
import sheetStyles from "../SheetModal.module.css";

/** 읽기 시트 설정(쿠키/env) 상태. read-sheet API 응답 형태. */
export type ReadSheetState = {
  spreadsheetId: string | null;
  tab: string;
  source: "cookie" | "env" | "none";
  hasCredentials: boolean;
};

/** Sheet 연동 모달들의 입력 기본값(읽기 시트 설정에서 파생). */
export type SheetDefaults = { spreadsheetId: string; tab: string };

/** 설정 모달 위에 겹쳐 뜨는 액션 모달 셸(읽기/Export/Import 공용). */
export function ActionModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };
  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div ref={overlayRef} className={sheetStyles.overlay} onClick={handleOverlayClick}>
      <div className={sheetStyles.modal} role="dialog" aria-label={title}>
        <div className={sheetStyles.header}>
          <div className={sheetStyles.titleWrap}>
            <span className={sheetStyles.title}>{title}</span>
            {subtitle && <span className={sheetStyles.subtitle}>{subtitle}</span>}
          </div>
          <button type="button" className={sheetStyles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
