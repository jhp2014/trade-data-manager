import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAssign } from "../store/assign.js";
import { useWorkbench } from "../store/workbench.js";
import { themeContextQuery, daySummaryQuery } from "../api/queries.js";
import { assignTheme } from "../api/themes.js";
import { AnchoredPopover } from "../ui/Dialog.js";
import { Chip, SectionLabel, TextInput } from "../ui/controls.js";

// 종목명 우클릭 → 테마 배정 컨텍스트 팝오버(커서 위치에 앵커). market-eye AssignModal 재구성.
//  - 현재: 이 종목이 속한 테마 전부 + 테마별 편입이슈(중복행도 그대로 = 시트 진실)
//  - 빠른선택: 오늘 보드에 뜬 테마 중 미배정분 칩
//  - 직접입력: 기존 테마 자동완성(공백·대소문자 정규화로 중복철자 차단) / 없으면 새 테마 추가
// 배정 성공 시 서버가 멤버십 캐시를 이미 무효화 → 클라는 보드+컨텍스트 쿼리만 invalidate 후 닫는다.
export function AssignThemeModal(): JSX.Element | null {
    const target = useAssign((s) => s.target);
    const anchor = useAssign((s) => s.anchor);
    if (!target || !anchor) return null;
    return <AssignBody key={target.code} />;
}

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase(); // "현대 그룹" == "현대그룹"

function AssignBody(): JSX.Element {
    const target = useAssign((s) => s.target)!;
    const anchor = useAssign((s) => s.anchor)!;
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
        <AnchoredPopover anchor={anchor} onClose={close} width={300}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* 헤더 */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <b style={{ color: "var(--text-primary)", fontSize: 14 }}>{target.name || target.code}</b>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{target.code}</span>
                    <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 11, fontWeight: 600 }}>테마 배정</span>
                </div>

                {/* 현재 — 속한 테마 전부 + 테마별 편입이슈 */}
                {current.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <SectionLabel>현재 테마 · 편입이슈</SectionLabel>
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
                        <SectionLabel>보드 테마에서 선택</SectionLabel>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {boardChips.map((t) => (
                                <Chip key={t} disabled={busy} onClick={() => void assign(t)}>
                                    {t}
                                </Chip>
                            ))}
                        </div>
                    </div>
                )}

                {/* 직접 입력 — 자동완성 + 새 테마 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <SectionLabel>테마 직접 입력</SectionLabel>
                    <TextInput
                        value={text}
                        autoFocus
                        disabled={busy}
                        placeholder="예: 현대그룹 (기존 테마면 아래서 선택)"
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !exactExists) void assign(text);
                        }}
                    />
                    {suggestions.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {suggestions.map((t) => (
                                <Chip key={t} variant="soft" disabled={busy} onClick={() => void assign(t)}>
                                    {t} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>기존</span>
                                </Chip>
                            ))}
                        </div>
                    )}
                    {text.trim() && !exactExists && (
                        <Chip variant="accent" disabled={busy} onClick={() => void assign(text)} style={{ alignSelf: "flex-start" }}>
                            ＋ ‘{text.trim()}’ 새 테마로 추가
                        </Chip>
                    )}
                </div>

                {skipped && <div style={{ color: "var(--warning)", fontSize: 12 }}>이미 ‘{skipped}’ 에 배정돼 있습니다</div>}
                {err && <div style={{ color: "var(--fall)", fontSize: 12 }}>⚠️ {err}</div>}
                {busy && <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>저장 중…</div>}
            </div>
        </AnchoredPopover>
    );
}
