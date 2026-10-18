// 테마 카드 — 머리(테마명·종목 수) + 종목 줄 + 관련 테마 줄. 머리 클릭이 접기/펼치기다.
// workbench components/board/BoardCard.tsx 에서 옮겼다(즐겨찾기·수동 숨김·드래그는 뺐다).
import { useState } from "react";
import { ScrollRow } from "../ui/ScrollRow.js";
import { StockRow } from "./StockRow.js";
import type { BoardStock, ListMode, OnInspect, RelatedInfo } from "./boardTypes.js";

export function ThemeCard({
    theme,
    stocks,
    focusCode,
    onPick,
    onInspect,
    related,
    onGoto,
    showRank = true,
    initialMode = "collapsed",
}: {
    theme: string;
    stocks: BoardStock[];
    focusCode: string;
    onPick: (code: string) => void;
    onInspect?: OnInspect;
    showRank?: boolean; // 개별/미분류 카드는 순위 미표시
    related?: RelatedInfo[]; // 하단 관련 테마(카드에만, 개별/미분류 없음)
    onGoto?: (theme: string) => void; // 관련 테마 클릭 = 이동
    initialMode?: ListMode; // 처음 펼침(기본 접힘). 현재 종목이 든 승격 카드는 펼쳐 연다.
}): JSX.Element {
    const [mode, setMode] = useState<ListMode>(initialMode);
    const movers = stocks.filter((s) => s.isMover || s.signal); // 신호 종목은 등락률 낮아도 주도주로 승격
    const rest = stocks.filter((s) => !(s.isMover || s.signal));
    const hot = stocks.some((s) => s.signal); // 1분 신호 종목이 있으면 카드 테두리가 깜빡인다
    const hasFocus = stocks.some((s) => s.code === focusCode);
    const rankOf = new Map(stocks.map((s, i) => [s.code, i + 1]));
    const toggle = (): void => setMode((m) => (m === "collapsed" ? "open" : "collapsed"));
    // 왼쪽 띠 = 상태: 현재 종목 포함 → 액센트 / 그 외(개별·미분류 포함) → 회색 실선.
    const railBg = hasFocus ? "var(--accent-primary)" : "var(--border-strong)";
    return (
        <div className={hot ? "board-blink" : undefined} style={{ display: "flex", background: "var(--bg-primary)", overflow: "hidden" }}>
            <div style={{ flexShrink: 0, width: 3, alignSelf: "stretch", background: railBg }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    onClick={toggle}
                    title={mode === "open" ? "카드 접기" : "카드 펼치기"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                    }}
                >
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{theme}</span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12, flexShrink: 0 }} title="종목 수">
                        {stocks.length}
                    </span>
                </div>

                {/* 주도주 | 나머지 — 선 대신 틈으로 가른다(줄 구분선을 뺀 것과 같은 결). */}
                {mode === "open" && (
                    <div style={{ paddingBottom: 2 }}>
                        {movers.map((s) => (
                            <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} onInspect={onInspect} home={theme} inCard />
                        ))}
                        {movers.length > 0 && rest.length > 0 && <div data-boundary style={{ height: 6 }} />}
                        {rest.map((s) => (
                            <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} onInspect={onInspect} home={theme} inCard />
                        ))}
                    </div>
                )}

                {related && related.length > 0 && onGoto && <InfoLine home={theme} homeTotal={stocks.length} related={related} onGoto={onGoto} />}
            </div>
        </div>
    );
}

/**
 * 카드 하단 관련 테마 — 포함관계는 박스-인-박스 `[부모 N [자식 M]]`(각 테마의 종목 수 — 관계는 그림이 말한다),
 * 부분 겹침은 알약 `테마 2/5`(이 카드에 함께 든 종목 / 그 테마 종목 — 얼마나 걸쳐 있나). market-eye InfoLine.
 */
function InfoLine({ home, homeTotal, related, onGoto }: { home: string; homeTotal: number; related: RelatedInfo[]; onGoto: (theme: string) => void }): JSX.Element {
    return (
        <ScrollRow
            gap={6}
            onClick={(e) => e.stopPropagation()}
            style={{ padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}
        >
            {related.map((r) => {
                const count = (text: string) => (
                    <span className="tabular" style={{ fontSize: 10, fontWeight: 800, opacity: 0.6, marginLeft: 4 }}>
                        {text}
                    </span>
                );
                if (r.kind === "overlap") {
                    return (
                        <button key={r.theme} onClick={() => onGoto(r.theme)} title={`관련 테마 — 「${r.theme}」 ${r.total}종목 중 ${r.common}종목이 이 카드에도 있다`} style={overlapPill}>
                            {r.theme}
                            {count(`${r.common}/${r.total}`)}
                        </button>
                    );
                }
                // 포함관계 — [부모 [자식]]. 강조(accent)는 항상 상대 테마(r.theme).
                const relIsChild = r.kind === "child"; // 상대가 안쪽 자식
                const parentName = relIsChild ? home : r.theme;
                const childName = relIsChild ? r.theme : home;
                return (
                    <button
                        key={r.theme}
                        onClick={() => onGoto(r.theme)}
                        title={r.kind === "parent" ? "이 테마가 속한 상위 테마" : "이 테마에 포함된 하위 테마"}
                        style={relNestStyle(relIsChild)}
                    >
                        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, color: relIsChild ? "var(--text-secondary)" : "var(--accent-primary)" }}>
                            {parentName}
                            {count(String(relIsChild ? homeTotal : r.total))}
                        </span>
                        <span style={relBoxStyle(relIsChild)}>
                            {childName}
                            {count(String(relIsChild ? r.total : homeTotal))}
                        </span>
                    </button>
                );
            })}
        </ScrollRow>
    );
}

const overlapPill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "2px 8px",
    background: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
};
function relNestStyle(relIsChild: boolean): React.CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        gap: 5,
        border: relIsChild ? "1px solid var(--border-default)" : "1px solid transparent",
        background: relIsChild ? "none" : "var(--accent-soft)",
        borderRadius: 8,
        padding: "2px 5px 2px 8px",
        cursor: "pointer",
        whiteSpace: "nowrap",
    };
}
function relBoxStyle(relIsChild: boolean): React.CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 6,
        padding: "2px 8px",
        color: relIsChild ? "var(--accent-primary)" : "var(--text-secondary)",
        background: relIsChild ? "var(--accent-soft)" : "var(--bg-primary)",
    };
}
