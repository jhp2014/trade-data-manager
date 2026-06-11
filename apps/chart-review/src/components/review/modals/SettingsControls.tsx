"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "../ReviewWorkspace.module.css";

/** 우측 화살표로 하위 피커를 여는 설정 행. */
export function SettingsRow({
  label,
  sub,
  count,
  onClick,
}: {
  label: string;
  sub: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.settingsRow} onClick={onClick}>
      <span className={styles.settingsRowText}>
        <span className={styles.settingsRowLabel}>{label}</span>
        <span className={styles.settingsRowSub}>{sub}</span>
      </span>
      {count != null && count > 0 && (
        <span className={styles.settingsRowCount}>{count}</span>
      )}
      <span className={styles.settingsRowChevron} aria-hidden>
        ›
      </span>
    </button>
  );
}

/** 우측에 인라인 입력(숫자/시각 등)을 두는 설정 행. */
export function SettingsInputRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.settingsRow}>
      <span className={styles.settingsRowText}>
        <span className={styles.settingsRowLabel}>{label}</span>
        <span className={styles.settingsRowSub}>{sub}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * 정수 입력(스피너 없음, 자유롭게 지웠다 다시 입력 가능).
 * 편집 중에는 로컬 문자열을 그대로 두고, blur/Enter 시에만 clamp 후 커밋한다.
 * 빈 값/비정상 값으로 빠져나가면 직전 유효값으로 되돌린다.
 */
export function ClearableNumberInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // 외부 값이 바뀌면(다른 경로로 변경) 로컬 텍스트도 동기화.
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = Math.round(Number(text));
    if (text.trim() !== "" && Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onCommit(clamped);
      setText(String(clamped));
    } else {
      setText(String(value)); // 무효 입력 → 되돌림
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={styles.settingsInlineInput}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
