import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAssign } from "../store/assign.js";
import { useWorkbench } from "../store/workbench.js";
import { themeContextQuery, daySummaryQuery, dailyCommentQuery } from "../api/queries.js";
import { assignTheme, refreshThemes } from "../api/themes.js";
import { refreshLiveThemes, useLiveSnapshot } from "../api/live.js";
import { saveDailyComment } from "../api/comment.js";
import { AnchoredPopover } from "../ui/Dialog.js";
import { Chip, SectionLabel, TextInput, TextArea } from "../ui/controls.js";

// 종목명 우클릭 → 컨텍스트 팝오버(커서 위치에 앵커). market-eye AssignModal 재구성.
//  - 당일 코멘트: (date,code) DB 메모 편집(빈 값=삭제) — 보드 카드에도 뜨는 그 코멘트.
//  - 현재 테마 · 편입이슈: 이 종목이 속한 시트 행 전부(중복행도 그대로 = 시트 진실).
//  - 테마 배정: 테마 입력 + 편입이슈(선택)를 한 묶음으로. 칩은 즉시배정하되 편입이슈 칸에 값이 있으면 함께 append.
// 편집 성공 시 서버 캐시는 이미 무효화 → 클라는 보드+컨텍스트 쿼리만 invalidate 한다.
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
    const { snapshot } = useLiveSnapshot(); // 실시간 보드에 현재 뜬 테마도 후보로(실시간 배정도 장마감처럼 빠른선택)

    const [text, setText] = useState("");
    const [issue, setIssue] = useState(""); // 편입이슈(선택) — 아래 어떤 배정을 하든 append 행에 함께 기록
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [skipped, setSkipped] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const themeRef = useRef<HTMLInputElement>(null);

    const current = ctxQ.data?.current ?? [];
    const allThemes = ctxQ.data?.allThemes ?? [];
    const ownThemes = new Set(current.map((m) => m.theme));
    // 후보 칩 = 오늘 EOD 보드 테마 ∪ 실시간 보드에 현재 뜬 테마, 미배정분만(중복 제거).
    const liveThemes = new Set<string>();
    for (const s of snapshot?.stocks ?? []) for (const t of s.themes) liveThemes.add(t);
    const boardChips = [...new Set([...(summaryQ.data?.themes ?? []), ...liveThemes])].filter((t) => !ownThemes.has(t));

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
            const res = await assignTheme({ code: target.code, theme: t, name: target.name, issue: issue.trim() || undefined });
            if (!res.assigned) {
                setSkipped(t); // 이미 그 테마 — 닫지 않고 알림(다른 테마 고를 수 있게)
                return;
            }
            void refreshLiveThemes().catch(() => {}); // 실시간 보드(apps/live) 즉시 반영 — best-effort(미기동 무시)
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

    // 칩 클릭 = 테마칸 채우기(즉시배정 아님). 채운 뒤 입력칸에 포커스 → 바로 Enter/＋배정 로 커밋 가능.
    const pick = (theme: string): void => {
        setText(theme);
        themeRef.current?.focus();
    };

    // 테마 새로고침 — 시트 수동편집·신규상장 반영. 서버 캐시 무효화 후 팝업·보드 쿼리 재조회.
    const refresh = async (): Promise<void> => {
        if (refreshing) return;
        setRefreshing(true);
        setErr(null);
        try {
            await refreshThemes();
            void refreshLiveThemes().catch(() => {}); // 실시간 보드(apps/live)도 함께 — best-effort(미기동 무시)
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["theme-context"] }),
                qc.invalidateQueries({ queryKey: ["day-summary"] }),
                qc.invalidateQueries({ queryKey: ["day-replay"] }),
            ]);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <AnchoredPopover anchor={anchor} onClose={close} width={300}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 헤더 — 우측 상단 테마 새로고침(시트 수동편집·신규상장 반영) */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b style={{ color: "var(--text-primary)", fontSize: 14 }}>{target.name || target.code}</b>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{target.code}</span>
                    <button
                        className="icon-btn"
                        style={{ marginLeft: "auto" }}
                        disabled={refreshing}
                        onClick={() => void refresh()}
                        title="테마 새로고침 (시트 수동편집·신규상장 반영)"
                    >
                        <RefreshIcon spinning={refreshing} />
                    </button>
                </div>

                {/* 당일 코멘트 — (date,code) DB 메모 */}
                {date ? (
                    <CommentSection code={target.code} date={date} />
                ) : (
                    <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>날짜를 선택하면 당일 코멘트를 남길 수 있습니다</span>
                )}

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

                {/* 테마 배정 — 제목(테마명)+내용(편입이슈) 컴포저. 제목 우측 엔터=배정, 칩=제목칸 채우기. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <SectionLabel>테마 배정</SectionLabel>
                    <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-secondary)", overflow: "hidden" }}>
                        {/* 제목 = 테마명 + 엔터(배정) */}
                        <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-default)" }}>
                            <TextInput
                                inputRef={themeRef}
                                value={text}
                                autoFocus
                                disabled={busy}
                                placeholder="테마명 (기존이면 아래 칩에서 선택)"
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void assign(text);
                                }}
                                style={{ flex: 1, minWidth: 0, border: "none", borderRadius: 0, background: "transparent", padding: "6px 8px" }}
                            />
                            <EnterButton onClick={() => void assign(text)} disabled={busy || !text.trim()} title="테마 배정 (Enter)" />
                        </div>
                        {/* 내용 = 편입이슈(선택) */}
                        <TextInput
                            value={issue}
                            disabled={busy}
                            placeholder="편입이슈 (선택) · 예: 3분기 실적 서프라이즈"
                            onChange={(e) => setIssue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void assign(text);
                            }}
                            style={{ width: "100%", border: "none", borderRadius: 0, background: "transparent", padding: "6px 8px", fontSize: 12 }}
                        />
                    </div>

                    {/* 새 테마 힌트(타이핑한 값이 기존과 다를 때) */}
                    {text.trim() && !exactExists && (
                        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>‘{text.trim()}’ 은 새 테마로 추가됩니다</span>
                    )}

                    {/* 자동완성(기존 테마) — 클릭 = 테마칸 채우기 */}
                    {suggestions.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {suggestions.map((t) => (
                                <Chip key={t} variant="soft" disabled={busy} onClick={() => pick(t)}>
                                    {t} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>기존</span>
                                </Chip>
                            ))}
                        </div>
                    )}

                    {/* 오늘 보드 테마 중 미배정분 — 클릭 = 테마칸 채우기 */}
                    {boardChips.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>보드 미배정</span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {boardChips.map((t) => (
                                    <Chip key={t} disabled={busy} onClick={() => pick(t)}>
                                        {t}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {skipped && <div style={{ color: "var(--warning)", fontSize: 12 }}>이미 ‘{skipped}’ 에 배정돼 있습니다</div>}
                {err && <div style={{ color: "var(--fall)", fontSize: 12 }}>⚠️ {err}</div>}
                {busy && <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>저장 중…</div>}
            </div>
        </AnchoredPopover>
    );
}

// 새로고침 아이콘 — 원형 화살표. 진행 중이면 회전(.spin).
function RefreshIcon({ spinning }: { spinning?: boolean }): JSX.Element {
    return (
        <svg className={spinning ? "spin" : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
        </svg>
    );
}

// 엔터(제출) 아이콘 — 렌더 편차 없게 SVG 로. 컴포저 우측에 세로로 꽉 차게 붙어 커밋(배정·저장) 액션을 표시.
function EnterIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>
    );
}

// 컴포저 우측 엔터 버튼 — 입력칸(9)과 9:1 로 나눠 붙는 커밋 액션. 비활성(테마 미입력·저장 중)이면 흐리게.
function EnterButton({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title?: string }): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "stretch",
                width: 34,
                flexShrink: 0,
                borderLeft: "1px solid var(--border-default)",
                background: "transparent",
                color: disabled ? "var(--text-tertiary)" : "var(--accent-primary)",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <EnterIcon />
        </button>
    );
}

// 당일 코멘트 편집 — (date,code) DB 메모. 프리필 후 저장(빈 값=삭제). 보드 카드도 같은 코멘트를 읽으므로 저장 시 보드 쿼리 무효화.
function CommentSection({ code, date }: { code: string; date: string }): JSX.Element {
    const qc = useQueryClient();
    const q = useQuery(dailyCommentQuery(date, code));
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    // 로드되면 1회 프리필(팝오버는 종목당 remount·date 고정 → isSuccess 는 한 번만 뒤집힌다).
    useEffect(() => {
        if (q.isSuccess) setText(q.data?.comment ?? "");
    }, [q.isSuccess]);

    const save = async (): Promise<void> => {
        if (busy) return;
        setBusy(true);
        setSaved(false);
        try {
            await saveDailyComment({ date, code, comment: text.trim() });
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["daily-comment", date, code] }),
                qc.invalidateQueries({ queryKey: ["day-summary"] }),
                qc.invalidateQueries({ queryKey: ["day-replay"] }),
            ]);
            setSaved(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <SectionLabel>당일 코멘트 · {date}</SectionLabel>
                {busy ? (
                    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>저장 중…</span>
                ) : saved ? (
                    <span style={{ color: "var(--accent-primary)", fontSize: 11, fontWeight: 600 }}>저장됨</span>
                ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-secondary)", overflow: "hidden" }}>
                <TextArea
                    value={text}
                    disabled={busy}
                    rows={2}
                    placeholder="이 날 이 종목 메모 (Enter 저장, Shift+Enter 줄바꿈)"
                    onChange={(e) => {
                        setText(e.target.value);
                        setSaved(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void save();
                        }
                    }}
                    style={{ flex: 1, minWidth: 0, border: "none", borderRadius: 0, background: "transparent", padding: "6px 8px", resize: "none" }}
                />
                <EnterButton onClick={() => void save()} disabled={busy} title="저장 (Enter)" />
            </div>
        </div>
    );
}
