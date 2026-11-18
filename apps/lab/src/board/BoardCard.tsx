// 테마 카드 — 머리(테마명·종목 수) + 종목 줄 + 관련 테마 줄. 머리 클릭 = 접기/펼치기, w/s 부착 판에선 테마 이름 클릭 = w/s 선택 테마,
// 머리 우클릭 = 「테마 선택」 ON/OFF 메뉴(현재 종목이 든 테마에서만 켜진다 — 아니면 흐림). 다시 우클릭·머리 클릭·바깥 누름·Esc 로 닫힌다.
// workbench components/board/BoardCard.tsx 에서 옮겼다(즐겨찾기·수동 숨김·드래그는 뺐다).
import { useRef, useState } from "react";
import { FloatingSurface } from "../ui/popover/FloatingSurface.js";
import { MENU_PAD, MenuItem } from "../ui/popover/menu.js";
import { ScrollRow } from "../ui/ScrollRow.js";
import { StockRow } from "./StockRow.js";
import { cardSections } from "./themeNav.js";
import type { BoardStock, ListMode, RelatedInfo } from "./boardTypes.js";

export function ThemeCard({
    theme,
    stocks,
    focusCode,
    onPick,
    related,
    onGoto,
    showRank = true,
    initialMode = "collapsed",
    navSelected = false,
    onNavSelect,
    navMenu,
}: {
    theme: string;
    stocks: BoardStock[];
    focusCode: string;
    onPick: (code: string) => void;
    showRank?: boolean; // 개별/미분류 카드는 순위 미표시
    related?: RelatedInfo[]; // 하단 관련 테마(카드에만, 개별/미분류 없음)
    onGoto?: (theme: string) => void; // 관련 테마 클릭 = 이동
    initialMode?: ListMode; // 처음 펼침(기본 접힘). 현재 종목이 든 승격 카드는 펼쳐 연다.
    /** w/s 가 걷는 선택 테마인가 — 이름을 채운 알약으로(부착된 판에서만 켠다). */
    navSelected?: boolean;
    /** 테마 이름 클릭 = 이 테마를 w/s 선택 테마로(부착 판에서만 준다). 없으면 이름도 머리처럼 접기다. */
    onNavSelect?: () => void;
    /** 머리 우클릭 메뉴 「테마 선택」 — on = 이 테마가 선택 테마, enabled = 현재 종목이 이 테마에 있다. 부착 판에서만 준다(없으면 우클릭은 브라우저 몫). */
    navMenu?: { on: boolean; enabled: boolean; toggle: () => void };
}): JSX.Element {
    const [mode, setMode] = useState<ListMode>(initialMode);
    const headRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const { movers, rest } = cardSections(stocks);
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
                    ref={headRef}
                    // 메뉴가 열린 채 머리를 누르면 메뉴만 닫는다(머리는 메뉴의 앵커라 공용 층이 바깥으로 안 센다).
                    onClick={() => (menuOpen ? setMenuOpen(false) : toggle())}
                    onContextMenu={
                        navMenu
                            ? (e) => {
                                  e.preventDefault();
                                  setMenuOpen((v) => !v); // 다시 우클릭 = 닫기
                              }
                            : undefined
                    }
                    title={mode === "open" ? "카드 접기" : "카드 펼치기"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                    }}
                >
                    <span
                        data-theme-name={theme}
                        data-nav-theme={navSelected ? "selected" : undefined}
                        onClick={
                            onNavSelect
                                ? (e) => {
                                      e.stopPropagation(); // 부착 판에서 이름 = 선택, 머리 나머지 = 접기
                                      onNavSelect();
                                  }
                                : undefined
                        }
                        title={onNavSelect ? (navSelected ? "w/s 로 걷는 테마 (shift+w/s = 테마 바꾸기)" : "이 테마를 w/s 로 걷기") : undefined}
                        style={{
                            fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
                            // 선택 테마 = 채운 알약(진한 청록 + 흰 글씨) — 이름보다 한 단계 작게(12px · 줄 높이 18px)라 머리 줄에 위아래 틈이 남는다.
                            // 이름 줄 높이(13px × 1.5 = 19.5px)와의 차이를 위아래 margin 으로 메워 머리 줄 높이는 그대로 — 선택이 옮겨 갈 때
                            // 카드 높이가 바뀌면 그 아래가 흔들린다. 좌우 패딩만큼 왼쪽으로 당겨 글자 시작 자리도 그대로.
                            ...(navSelected
                                ? { color: "#fff", background: "var(--accent-primary)", borderRadius: 3, padding: "0 6px", margin: "0.75px 0 0.75px -6px", fontSize: 12, lineHeight: "18px" }
                                : { color: "var(--text-primary)" }),
                        }}
                    >
                        {theme}
                    </span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12, flexShrink: 0 }} title="종목 수">
                        {stocks.length}
                    </span>
                </div>
                {/* 메뉴는 머리 div 밖에 — portal 이어도 React 클릭이 머리(접기)로 버블하지 않게. */}
                {menuOpen && navMenu && (
                    <FloatingSurface anchorRef={headRef} place={{ side: "below", align: "start", gap: 2 }} onClose={() => setMenuOpen(false)} layout="column" width={220} padding={0}>
                        <div data-nav-menu="" style={{ padding: MENU_PAD }}>
                            <MenuItem
                                mark="radio"
                                on={navMenu.on}
                                disabled={!navMenu.enabled}
                                title={!navMenu.enabled ? "현재 종목이 이 테마에 없다" : navMenu.on ? "끄면 w/s 가 테마를 걷지 않는다(shift+w/s 로 다시 켠다)" : "이 테마를 w/s 로 걷는다"}
                                onClick={() => {
                                    navMenu.toggle();
                                    setMenuOpen(false);
                                }}
                            >
                                테마 선택
                            </MenuItem>
                        </div>
                    </FloatingSurface>
                )}

                {/* 주도주 | 나머지 — 선 대신 틈으로 가른다(줄 구분선을 뺀 것과 같은 결). */}
                {mode === "open" && (
                    <div style={{ paddingBottom: 2 }}>
                        {movers.map((s) => (
                            <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} home={theme} inCard />
                        ))}
                        {movers.length > 0 && rest.length > 0 && <div data-boundary style={{ height: 6 }} />}
                        {rest.map((s) => (
                            <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} home={theme} inCard />
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
