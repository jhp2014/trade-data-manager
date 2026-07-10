// 작업셋 패널 표현 컴포넌트 — 월 선택 팝오버·조준 아이콘·날짜 헤더·종목명·타점 행.
// WorksetPanel 본문(데이터 합본)에서 분리한 순수 표현 조각.
import { useState } from "react";
import { createPortal } from "react-dom";
import type { ReviewPointListItem } from "../api/reviewPoints.js";
import { weekdayOf } from "../lib/date.js";

function fmtDateHeader(date: string): string {
    return `${date.replace(/-/g, ".")} (${weekdayOf(date)})`;
}

export function MonthPicker({ month, months, onPick }: { month: string; months: string[]; onPick: (m: string) => void }): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span className="tabular" style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{month.replace("-", ".")}</span>
            <button
                onClick={() => setOpen((v) => !v)}
                title="월 변경"
                style={{ display: "inline-flex", alignItems: "center", padding: "2px 3px", border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", lineHeight: 0 }}
            >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open && (
                <>
                    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 41, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", maxHeight: 260, overflowY: "auto", minWidth: 84 }}>
                        {months.length === 0 && <div style={{ padding: "5px 12px", color: "var(--text-tertiary)", fontSize: 12 }}>없음</div>}
                        {months.map((m) => (
                            <button
                                key={m}
                                onClick={() => { onPick(m); setOpen(false); }}
                                className="tabular"
                                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: m === month ? "var(--accent-soft)" : "transparent", color: "var(--text-primary)", padding: "5px 12px", cursor: "pointer", font: "inherit", fontWeight: m === month ? 700 : 400 }}
                            >
                                {m.replace("-", ".")}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// 조준(현재 위치로 이동) 아이콘 — 핀이 "현재 종목 위치로 스크롤"임을 나타낸다.
export function LocateIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="1.5" fill="var(--accent-primary)" stroke="none" />
            <line x1="12" y1="1.5" x2="12" y2="4.5" />
            <line x1="12" y1="19.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4.5" y2="12" />
            <line x1="19.5" y1="12" x2="22.5" y2="12" />
        </svg>
    );
}

export function DateHeader({ date }: { date: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, background: "var(--bg-secondary)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            <span className="tabular" style={{ flexShrink: 0 }}>{fmtDateHeader(date)}</span>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
        </div>
    );
}

export function Name({ name, code, color, strong }: { name: string | null; code: string; color?: string; strong?: boolean }): JSX.Element {
    return (
        <span style={{ minWidth: 0, color: color ?? "var(--text-primary)", fontWeight: strong ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name ?? code}
        </span>
    );
}

export function PointRow({ p, related, current, hyps = [], onClick }: { p: ReviewPointListItem; related?: boolean; current?: boolean; hyps?: string[]; onClick: () => void }): JSX.Element {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                textAlign: "left",
                border: "none",
                borderLeft: `3px solid ${current ? "var(--accent-primary)" : related ? "var(--accent-soft)" : "transparent"}`,
                borderBottom: "1px solid var(--border-subtle)",
                padding: "3px 10px 3px 22px",
                cursor: "pointer",
                font: "inherit",
                background: current ? "var(--bg-active)" : related ? "var(--accent-soft)" : "transparent",
            }}
        >
            <span className="tabular" style={{ flexShrink: 0, width: 40, color: current ? "var(--accent-primary)" : "var(--text-secondary)", fontWeight: current ? 700 : 400, fontSize: 12 }}>
                {p.time.slice(0, 5)}
            </span>
            {p.memo && (
                <span title={p.memo} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)", fontSize: 12 }}>
                    {p.memo}
                </span>
            )}
            {hyps.length > 0 && <HypBadge texts={hyps} />}
        </button>
    );
}

// 타점에 연결된 가설 개수 배지 — hover 시 가설 텍스트 목록 팝오버(body 로 portal, 행 위로 안 잘리게).
function HypBadge({ texts }: { texts: string[] }): JSX.Element {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    return (
        <span
            onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setPos(null)}
            title={`연결된 가설 ${texts.length}개`}
            style={{
                flexShrink: 0,
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                height: 15,
                padding: "0 6px",
                borderRadius: 10,
                background: "var(--accent-soft)",
                color: "var(--accent-primary)",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "15px",
                cursor: "default",
            }}
        >
            H<span className="tabular">{texts.length}</span>
            {pos && <HypPopover texts={texts} pos={pos} />}
        </span>
    );
}

function HypPopover({ texts, pos }: { texts: string[]; pos: { x: number; y: number } }): JSX.Element {
    return createPortal(
        <div
            style={{
                position: "fixed",
                left: pos.x + 14,
                top: pos.y - 8,
                maxWidth: 320,
                background: "var(--bg-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
                padding: "6px 8px",
                zIndex: 200,
                pointerEvents: "none",
            }}
        >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 4 }}>연결된 가설 {texts.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {texts.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 5, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                        <span style={{ flexShrink: 0, color: "var(--accent-primary)" }}>·</span>
                        <span>{t}</span>
                    </div>
                ))}
            </div>
        </div>,
        document.body,
    );
}
