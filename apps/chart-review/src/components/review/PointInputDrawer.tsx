"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ReviewWorkspace.module.css";
import type { ReviewPoint } from "@/types/review";
import type { ManualKeyDef } from "@/lib/loadManualKeys";
import { useUiStore } from "@/stores/useUiStore";

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
  // point.tradeTime 은 "HH:MM:SS", 마커 tradeTime 은 "HH:MM" 이라 앞 5자리(HH:MM)로 비교한다.
  const existing = useMemo(
    () => points.find((p) => p.reviewId && p.tradeTime.slice(0, 5) === tradeTime.slice(0, 5)) ?? null,
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

  const inputKeyOrder = useUiStore((state) => state.inputKeyOrder);
  const inputKeyDisabled = useUiStore((state) => state.inputKeyDisabled);

  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(manualKeys, sourceManual));
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // inputKeyOrder 기준 정렬 + inputKeyDisabled 기준 숨김 적용.
  const displayRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const ai = inputKeyOrder.indexOf(`m_${a.key}`);
      const bi = inputKeyOrder.indexOf(`m_${b.key}`);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sorted.filter((r) => !inputKeyDisabled.includes(`m_${r.key}`));
  }, [rows, inputKeyOrder, inputKeyDisabled]);

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

  const handleRenameKey = async (key: string) => {
    const raw = window.prompt(`'${key}' 의 새 이름(영문/숫자/밑줄)`, key);
    const next = raw?.trim();
    if (!next || next === key) return;
    if (!KEY_PATTERN.test(next)) {
      window.alert("영문/숫자/밑줄만 사용할 수 있습니다.");
      return;
    }
    if (rows.some((r) => r.key === next)) {
      window.alert("이미 있는 항목입니다.");
      return;
    }
    try {
      const res = await fetch("/api/review/manual-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: key, to: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "이름 변경 실패");
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, key: next } : r)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (
      !window.confirm(
        `'${key}' 항목을 완전히 삭제할까요?\n레지스트리와 모든 타점의 저장된 값까지 함께 제거됩니다. (되돌릴 수 없음)`,
      )
    )
      return;
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
      // 화면의 모든 행이 곧 payload 전체다(레거시 키도 행으로 존재). 빈 값은 제외.
      // upsert 가 payload 를 통째로 덮어쓰므로 rows 만으로 구성해야 키 이름 변경이 정확히 반영된다.
      const payload: Record<string, string | string[]> = {};
      for (const row of rows) {
        const values = [...row.values];
        const draft = row.draft.trim();
        if (draft && !values.includes(draft)) values.push(draft);
        if (values.length === 1) payload[row.key] = values[0];
        else if (values.length > 1) payload[row.key] = values;
      }
      // 비활성화된 컬럼: 수정 모드에서는 기존 값 유지, 신규 모드에서는 포함 안 함.
      if (existing) {
        for (const disabledKey of inputKeyDisabled) {
          const rawKey = disabledKey.startsWith("m_") ? disabledKey.slice(2) : disabledKey;
          if (!(rawKey in payload) && rawKey in existing.sourceRow.manual) {
            const value = existing.sourceRow.manual[rawKey];
            if (value) payload[rawKey] = value;
          }
        }
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
    <>
      <div className={styles.inputBackdrop} onClick={onClose} aria-hidden />
      <aside className={styles.inputDrawer}>
      <div
        className={`${styles.inputHeader} ${mode === "edit" ? styles.inputHeaderEdit : styles.inputHeaderNew}`}
      >
        <div className={styles.inputTitleWrap}>
          <div className={styles.inputTitleRow}>
            <span
              className={`${styles.inputModeBadge} ${mode === "edit" ? styles.inputModeEdit : styles.inputModeNew}`}
            >
              {mode === "edit" ? "수정" : "신규"}
            </span>
            <span className={styles.inputTitle}>
              {mode === "edit" ? "타점 수정" : "타점 입력"}
            </span>
          </div>
          <span className={styles.inputSub}>
            {(stockName ?? stockCode)} · {tradeDate} · {tradeTime}
          </span>
        </div>
        <button type="button" className={styles.inputClose} tabIndex={-1} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={styles.inputBody}>
        {rows.length === 0 && (
          <div className={styles.inputEmpty}>
            입력 항목이 없습니다. 아래 ‘항목 추가’로 키를 만들어 주세요.
          </div>
        )}
        {displayRows.map((row, index) => {
          const listId = `sugg-${row.key}`;
          const suggestions = (valueSuggestions[row.key] ?? [])
            .filter((s) => !row.values.includes(s))
            .slice(0, MAX_SUGGESTIONS);
          return (
            <div key={row.key} className={styles.inputRow}>
              <div className={styles.inputRowHead}>
                <span className={styles.inputKey} title={row.key}>
                  {row.label || row.key}
                </span>
                {row.inRegistry && (
                  <button
                    type="button"
                    className={styles.inputKeyAction}
                    title="이름 변경"
                    tabIndex={-1}
                    onClick={() => handleRenameKey(row.key)}
                  >
                    ✎
                  </button>
                )}
                {row.inRegistry && (
                  <button
                    type="button"
                    className={styles.inputKeyAction}
                    title="이 항목 전체 제거"
                    tabIndex={-1}
                    onClick={() => handleDeleteKey(row.key)}
                  >
                    ✕
                  </button>
                )}
                {row.values.length > 0 && (
                  <div className={styles.inputChips} title={row.values.join(", ")}>
                    {row.values.map((value) => (
                      <span key={value} className={styles.inputChip} title={value}>
                        <span className={styles.inputChipText}>{value}</span>
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
              </div>
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
        <span className={styles.inputKbdHint}>
          <kbd className={styles.kbd}>Ctrl</kbd>
          <kbd className={styles.kbd}>Space</kbd>
          저장 ·
          <kbd className={styles.kbd}>Esc</kbd>
          닫기
        </span>
        <div className={styles.inputFooterBtns}>
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
            {submitting ? "저장 중…" : mode === "edit" ? "변경 저장" : "타점 추가"}
          </button>
        </div>
      </div>
      </aside>
    </>
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
