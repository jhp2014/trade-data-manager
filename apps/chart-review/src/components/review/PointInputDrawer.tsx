"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ReviewWorkspace.module.css";
import type { ReviewPoint } from "@/types/review";
import type { ManualKeyDef } from "@/lib/loadManualKeys";

type PointInputDrawerProps = {
  stockCode: string;
  stockName?: string;
  tradeDate: string;
  tradeTime: string; // "HH:MM" (현재 마커 위치)
  points: ReviewPoint[];
  manualKeys: ManualKeyDef[];
  valueSuggestions: Record<string, string[]>;
  onClose: () => void;
  onSaved: () => void;
};

type Row = {
  key: string;
  label: string | null;
  values: string[]; // 확정된 칩
  draft: string; // 현재 입력 중인 텍스트
  inRegistry: boolean;
};

const KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const MAX_SUGGESTIONS = 20;

export function PointInputDrawer({
  stockCode,
  stockName,
  tradeDate,
  tradeTime,
  points,
  manualKeys,
  valueSuggestions,
  onClose,
  onSaved,
}: PointInputDrawerProps) {
  // 마커 시간에 이미 저장된 Point 가 있으면 수정, 없으면 신규.
  const existing = useMemo(
    () => points.find((p) => p.reviewId && p.tradeTime === tradeTime) ?? null,
    [points, tradeTime],
  );
  const mode: "edit" | "new" = existing ? "edit" : "new";

  // prefill 원본 manual:
  // - 수정: 해당 Point 의 저장값
  // - 신규: 같은 종목·날짜의 다른(형제) Point 값을 복사, 없으면 빈 값
  const sourceManual = useMemo<Record<string, string>>(() => {
    if (existing) return existing.sourceRow.manual;
    const sibling = points.find((p) => p.reviewId);
    return sibling ? sibling.sourceRow.manual : {};
  }, [existing, points]);

  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(manualKeys, sourceManual));
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 열릴 때 첫 입력창에 자동 포커스 (Space 로 연 직후 바로 타이핑).
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const setRowDraft = (key: string, draft: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, draft } : r)));

  // draft 를 칩으로 확정. 중복은 무시.
  const commitDraft = (key: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const value = r.draft.trim();
        if (!value || r.values.includes(value)) return { ...r, draft: "" };
        return { ...r, values: [...r.values, value], draft: "" };
      }),
    );

  const removeChip = (key: string, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, values: r.values.filter((v) => v !== value) } : r)),
    );

  const handleAddKey = async () => {
    const raw = window.prompt("새 입력 항목(영문/숫자/밑줄)");
    const key = raw?.trim();
    if (!key) return;
    if (!KEY_PATTERN.test(key)) {
      window.alert("영문/숫자/밑줄만 사용할 수 있습니다.");
      return;
    }
    if (rows.some((r) => r.key === key)) {
      window.alert("이미 있는 항목입니다.");
      return;
    }
    try {
      const res = await fetch("/api/review/manual-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "추가 실패");
      setRows((prev) => [...prev, { key, label: null, values: [], draft: "", inRegistry: true }]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!window.confirm(`'${key}' 항목을 전체에서 제거할까요? (기존 값은 보존)`)) return;
    try {
      const res = await fetch("/api/review/manual-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      setRows((prev) => prev.filter((r) => r.key !== key));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // 숨겨진(레지스트리 삭제) 키 값은 보존하기 위해 원본 payload 를 기반으로 병합.
      const payload: Record<string, string | string[]> = { ...sourceManual };
      for (const row of rows) {
        const values = [...row.values];
        const draft = row.draft.trim();
        if (draft && !values.includes(draft)) values.push(draft);
        if (values.length === 0) delete payload[row.key];
        else if (values.length === 1) payload[row.key] = values[0];
        else payload[row.key] = values;
      }
      const res = await fetch("/api/review/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode, tradeDate, tradeTime, payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장 실패");
      onSaved();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  // Esc = 저장 없이 닫기. Ctrl+Space = 저장 + 닫기.
  // (값에 공백이 필요하므로 일반 Space 는 입력에 쓰고, 저장은 Ctrl 조합으로 분리.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitting) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.code === "Space" && e.ctrlKey) {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, rows, onClose]);

  return (
    <aside className={styles.inputDrawer}>
      <div className={styles.inputHeader}>
        <div className={styles.inputTitleWrap}>
          <span className={styles.inputTitle}>
            타점 {mode === "edit" ? "수정" : "입력"}
          </span>
          <span className={styles.inputSub}>
            {(stockName ?? stockCode)} · {tradeDate} · {tradeTime}
          </span>
        </div>
        <button type="button" className={styles.settingsClose} tabIndex={-1} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={styles.inputBody}>
        {rows.length === 0 && (
          <div className={styles.inputEmpty}>
            입력 항목이 없습니다. 아래 ‘항목 추가’로 키를 만들어 주세요.
          </div>
        )}
        {rows.map((row, index) => {
          const listId = `sugg-${row.key}`;
          const suggestions = (valueSuggestions[row.key] ?? [])
            .filter((s) => !row.values.includes(s))
            .slice(0, MAX_SUGGESTIONS);
          return (
            <div key={row.key} className={styles.inputRow}>
              <div className={styles.inputRowHead}>
                <label className={styles.inputKey} title={row.key}>
                  {row.label || row.key}
                </label>
                {row.inRegistry && (
                  <button
                    type="button"
                    className={styles.inputDelKey}
                    title="이 항목 전체 제거"
                    tabIndex={-1}
                    onClick={() => handleDeleteKey(row.key)}
                  >
                    ✕
                  </button>
                )}
              </div>
              {row.values.length > 0 && (
                <div className={styles.inputChips}>
                  {row.values.map((value) => (
                    <span key={value} className={styles.inputChip}>
                      {value}
                      <button
                        type="button"
                        className={styles.inputChipDel}
                        tabIndex={-1}
                        onClick={() => removeChip(row.key, value)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                className={styles.inputField}
                type="text"
                list={listId}
                value={row.draft}
                placeholder="값 입력 후 Enter"
                onChange={(e) => setRowDraft(row.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft(row.key);
                  }
                }}
              />
              {suggestions.length > 0 && (
                <datalist id={listId}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
          );
        })}
        <button type="button" className={styles.inputAddKey} tabIndex={-1} onClick={handleAddKey}>
          + 항목 추가
        </button>
      </div>

      <div className={styles.inputFooter}>
        <button
          type="button"
          className={styles.inputCancel}
          tabIndex={-1}
          onClick={onClose}
          disabled={submitting}
        >
          취소
        </button>
        <button
          type="button"
          className={styles.inputSave}
          tabIndex={-1}
          onClick={handleSave}
          disabled={submitting}
        >
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </aside>
  );
}

/** 레지스트리 키 + (원본 payload 에만 있는) 레거시 키를 합쳐 행 목록 생성. " | " 분해로 칩 복원. */
function buildInitialRows(
  manualKeys: ManualKeyDef[],
  sourceManual: Record<string, string>,
): Row[] {
  const rows: Row[] = manualKeys.map((k) => ({
    key: k.key,
    label: k.label,
    values: splitValues(sourceManual[k.key]),
    draft: "",
    inRegistry: true,
  }));
  const registryKeys = new Set(manualKeys.map((k) => k.key));
  for (const [key, value] of Object.entries(sourceManual)) {
    if (!registryKeys.has(key)) {
      rows.push({ key, label: null, values: splitValues(value), draft: "", inRegistry: false });
    }
  }
  return rows;
}

/** "a | b" → ["a","b"]. 빈 값/공백 제거. */
function splitValues(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}
