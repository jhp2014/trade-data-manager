import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAssign } from "../store/assign.js";
import { useWorkbench } from "../store/workbench.js";
import { themeContextQuery, daySummaryQuery } from "../api/queries.js";
import { assignTheme } from "../api/themes.js";
import { Modal } from "./Modal.js";

// 종목명 우클릭 → 테마 배정 팝업. market-eye AssignModal 재구성.
//  - 현재: 이 종목이 속한 테마 전부 + 테마별 편입이슈(중복행도 그대로 = 시트 진실)
//  - 빠른선택: 오늘 보드에 뜬 테마 중 미배정분 칩
//  - 직접입력: 기존 테마 자동완성(공백·대소문자 정규화로 중복철자 차단) / 없으면 새 테마 추가
// 배정 성공 시 서버가 멤버십 캐시를 이미 무효화 → 클라는 보드+컨텍스트 쿼리만 invalidate 후 닫는다.
export function AssignThemeModal(): JSX.Element | null {
    const target = useAssign((s) => s.target);
    if (!target) return null;
    return <AssignBody key={target.code} />;
}

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase(); // "현대 그룹" == "현대그룹"

function AssignBody(): JSX.Element {
    const target = useAssign((s) => s.target)!;
    const close = useAssign((s) => s.close);
    const date = useWorkbench((s) => s.focus.date);
    const qc = useQueryClient();

    const ctxQ = useQuery(themeContextQuery(target.code));
    const summaryQ = useQuery(daySummaryQuery(date)); // 이미 로드돼 있으면 캐시 히트 — 빠른선택 칩용

    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [skipped, setSkipped] = useState<string | null>(null);

    const current = ctxQ.data?.current ?? [];
    const allThemes = ctxQ.data?.allThemes ?? [];
    const ownThemes = new Set(current.map((m) => m.theme));
    const boardChips = (summaryQ.data?.themes ?? []).filter((t) => !ownThemes.has(t)); // 미배정분만

    const q = norm(text);
    const suggestions = text.trim() ? allThemes.filter((t) => norm(t).includes(q)).slice(0, 8) : [];
    const exactExists = allThemes.some((t) => norm(t) === q); // 같은 철자(공백무시) 이미 존재

    const assign = async (theme: string): Promise<void> => {
        const t = theme.trim();
        if (!t || busy) return;
        setBusy(true);
        setErr(null);
        setSkipped(null);
        try {
            const res = await assignTheme({ code: target.code, theme: t, name: target.name });
            if (!res.assigned) {
                setSkipped(t); // 이미 그 테마 — 닫지 않고 알림(다른 테마 고를 수 있게)
                return;
            }
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["theme-context"] }),
                qc.invalidateQueries({ queryKey: ["day-summary"] }),
                qc.invalidateQueries({ queryKey: ["day-replay"] }),
            ]);
            close();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title="테마 배정" onClose={close}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 300 }}>
                <div>
                    <b style={{ color: "var(--text-primary)", fontSize: 14 }}>{target.name || target.code}</b>
                    <span className="tabular" style={{ marginLeft: 6, color: "var(--text-tertiary)", fontSize: 12 }}>{target.code}</span>
                </div>

                {/* 현재 — 속한 테마 전부 + 테마별 편입이슈 */}
                {current.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <Label>현재 테마 · 편입이슈</Label>
                        {current.map((m, i) => (
                            <div key={`${m.theme}-${i}`} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{m.theme}</span>
                                <span style={{ color: m.issue ? "var(--text-secondary)" : "var(--text-tertiary)", fontSize: 12 }}>{m.issue || "—"}</span>
                            </div>
                        ))}
                    </div>
                )}
                {ctxQ.isLoading && <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>불러오는 중…</span>}

                {/* 빠른선택 — 오늘 보드 테마 중 미배정분 */}
                {boardChips.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <Label>보드 테마에서 선택</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {boardChips.map((t) => (
                                <button key={t} disabled={busy} onClick={() => void assign(t)} style={chipStyle}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 직접 입력 — 자동완성 + 새 테마 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <Label>테마 직접 입력</Label>
                    <input
                        value={text}
                        autoFocus
                        disabled={busy}
                        placeholder="예: 현대그룹 (기존 테마면 아래서 선택)"
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !exactExists) void assign(text);
                            if (e.key === "Escape") close();
                        }}
                        style={inputStyle}
                    />
                    {suggestions.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {suggestions.map((t) => (
                                <button key={t} disabled={busy} onClick={() => void assign(t)} style={suggestStyle}>
                                    {t} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>기존</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {text.trim() && !exactExists && (
                        <button disabled={busy} onClick={() => void assign(text)} style={newThemeStyle}>
                            ＋ ‘{text.trim()}’ 새 테마로 추가
                        </button>
                    )}
                </div>

                {skipped && <div style={{ color: "var(--warning)", fontSize: 12 }}>이미 ‘{skipped}’ 에 배정돼 있습니다</div>}
                {err && <div style={{ color: "var(--fall)", fontSize: 12 }}>⚠️ {err}</div>}
                {busy && <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>저장 중…</div>}
            </div>
        </Modal>
    );
}

function Label({ children }: { children: React.ReactNode }): JSX.Element {
    return <span style={{ color: "var(--text-tertiary)", fontSize: 11, fontWeight: 600 }}>{children}</span>;
}

const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "5px 8px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
    fontSize: 13,
};
const chipStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "3px 9px",
    background: "var(--bg-primary)",
    cursor: "pointer",
};
const suggestStyle: React.CSSProperties = { ...chipStyle, background: "var(--bg-tertiary)" };
const newThemeStyle: React.CSSProperties = {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent-primary)",
    border: "1px dashed var(--accent-primary)",
    borderRadius: 8,
    padding: "4px 10px",
    background: "var(--accent-soft)",
    cursor: "pointer",
};
