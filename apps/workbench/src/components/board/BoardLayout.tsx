import { useRef } from "react";
import type { Grouped } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock } from "./BoardCard.js";

// 보드 본문 공용 — NavRail(상단 sticky 테마칩 내비) + 카드(테마·개별·미분류). 두 보드가 공유.
// 패널은 자기 헤더(EOD 카운트 / 복기 스크러버)를 이 위에 얹는다.
export function BoardLayout({
    grouped,
    parents,
    focusCode,
    onPick,
}: {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    focusCode: string;
    onPick: (code: string) => void;
}): JSX.Element {
    const cardRefs = useRef(new Map<string, HTMLElement>());
    const goto = (theme: string): void =>
        cardRefs.current.get(theme)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const register = (theme: string, el: HTMLElement | null): void => {
        if (el) cardRefs.current.set(theme, el);
        else cardRefs.current.delete(theme);
    };

    const empty = grouped.themes.length === 0 && grouped.individuals.length === 0 && grouped.unclassified.length === 0;
    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <NavRail grouped={grouped} onGoto={goto} />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                    {grouped.themes.map((g) => (
                        <div key={g.theme} ref={(el) => register(g.theme, el)} style={{ scrollMarginTop: 8 }}>
                            <ThemeCard theme={g.theme} stocks={g.stocks} parents={parents.get(g.theme) ?? []} focusCode={focusCode} onPick={onPick} />
                        </div>
                    ))}
                    {grouped.individuals.length > 0 && (
                        <ThemeCard theme="개별 종목" stocks={grouped.individuals} parents={[]} focusCode={focusCode} onPick={onPick} />
                    )}
                    {grouped.unclassified.length > 0 && (
                        <ThemeCard theme="미분류" stocks={grouped.unclassified} parents={[]} focusCode={focusCode} onPick={onPick} />
                    )}
                    {empty && <BoardCenter text="표시할 종목 없음" />}
                </div>
            </div>
        </div>
    );
}

/** 상단 sticky 테마칩 내비 — 클릭 시 해당 카드로 스크롤. 가로 스크롤(칩 많으면). */
function NavRail({ grouped, onGoto }: { grouped: Grouped<BoardStock>; onGoto: (t: string) => void }): JSX.Element | null {
    if (grouped.themes.length === 0) return null;
    return (
        <div
            style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                padding: "6px 8px",
                borderBottom: "1px solid var(--border-default)",
                background: "var(--bg-primary)",
                flexShrink: 0,
            }}
        >
            {grouped.themes.map((g) => {
                const movers = g.stocks.filter((s) => s.isMover || s.signal).length;
                const hot = g.stocks.filter((s) => s.signal).length;
                return (
                    <button
                        key={g.theme}
                        onClick={() => onGoto(g.theme)}
                        title={`이동: ${g.theme}`}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            flexShrink: 0,
                            padding: "2px 8px",
                            borderRadius: 12,
                            border: "1px solid var(--border-default)",
                            background: "var(--bg-secondary)",
                            fontSize: 11,
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                        }}
                    >
                        <span style={{ color: "var(--text-secondary)" }}>{g.theme}</span>
                        <span className="tabular" style={{ color: "var(--text-tertiary)" }}>
                            {movers}/{g.stocks.length}
                        </span>
                        {hot > 0 && (
                            <span className="tabular" style={{ color: "var(--rise)" }}>
                                🔥{hot}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
