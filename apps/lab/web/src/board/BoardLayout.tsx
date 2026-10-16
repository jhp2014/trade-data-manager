// 테마 보드 본문 — 카드(현재 종목 띠 / 나머지 / 개별·미분류).
// workbench components/board/BoardLayout.tsx 에서 옮겼다. 바뀐 점:
//   · 테마 고르기(즐겨찾기·선택 강조)는 없다 — 머리 클릭 = 그 카드 접기/펼치기, 관련 테마 칩 클릭 = 그 카드로 스크롤.
//   · 승격 출처 — 이 보드에서 직접 고른 종목이면 제자리(isSelfPick), 다른 곳(경로 줄·차트·다른 패널)에서 바뀌면
//     그 종목이 든 테마 카드들을 맨 위 "현재 종목" 띠로 올리고 스크롤한다.
//   · 위 칩 줄(테마 바로가기·현재 종목 테마·1분 신호 테마)과 포함관계 자동 숨김은 뺐다 — 카드는 전부 보이고,
//     1분 신호는 카드 테두리 깜빡임이, 현재 종목이 카드 밖인 자리는 패널 헤더(ThemeBoardPanel)가 보인다.
//   · 즐겨찾기·드래그·수동 숨김·w/s 순회·필터는 뺐다.
import { useEffect, useRef, useState } from "react";
import { ThemeCard } from "./BoardCard.js";
import { Center } from "../ui/chrome.js";
import { relatedThemes, type Grouped, type ThemeGroup } from "./domain.js";
import { focusPlace } from "./viewModel.js";
import type { BoardStock, OnInspect, RelatedInfo } from "./boardTypes.js";

// 꼬리 카드(개별·미분류) — 머리 문구와 스크롤 주소를 갈라 둔다(같은 이름의 진짜 테마가 있으면 주소가 겹친다).
const INDIVIDUAL_CARD = "개별 종목";
const UNCLASSIFIED_CARD = "미분류";
const INDIVIDUAL_REF = "tail:individuals";
const UNCLASSIFIED_REF = "tail:unclassified";
/** "현재 종목" 띠 머리 — 띠로 스크롤할 땐 첫 카드가 아니라 여기로(띠 글자가 위로 가려지지 않게). */
const BAND_REF = "band:current";

export function BoardLayout({
    grouped,
    parents,
    focusCode,
    onPick,
    isSelfPick,
    onInspect,
    unclassifiedName = UNCLASSIFIED_CARD,
}: {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    focusCode: string;
    onPick: (code: string) => void;
    /** 지금 종목이 이 보드에서 직접 고른 것인가 — 그렇다면 승격·스크롤하지 않는다(제자리). */
    isSelfPick: (code: string) => boolean;
    /** 종목 줄 우클릭 — 있으면 브라우저 메뉴 대신 이것을 부른다. */
    onInspect?: OnInspect;
    /** 미분류 꼬리 카드 이름(이력 소속이면 「테마 이력 없음」). */
    unclassifiedName?: string;
}): JSX.Element {
    const cardRefs = useRef(new Map<string, HTMLElement>());
    const [promoted, setPromoted] = useState<string[]>([]); // 다른 곳에서 바뀐 종목의 테마들(맨 위 띠)
    const [scrollTarget, setScrollTarget] = useState<string | null>(null);

    const register = (key: string, el: HTMLElement | null): void => {
        if (el) cardRefs.current.set(key, el);
        else cardRefs.current.delete(key);
    };
    useEffect(() => {
        if (!scrollTarget) return;
        const el = cardRefs.current.get(scrollTarget);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setScrollTarget(null);
        }
    });

    const gotoTheme = (theme: string): void => setScrollTarget(theme);

    // 꼬리 카드 판정은 헤더(현재 종목 자리)와 같은 함수로 — 둘이 엇갈리지 않게.
    const place = focusPlace(grouped, focusCode);
    const focusInIndividuals = place === "개별";
    const focusInUnclassified = place === "미분류";
    const focusThemes = (): string[] => grouped.themes.filter((g) => g.stocks.some((s) => s.code === focusCode)).map((g) => g.theme);

    // 종목이 바뀌면 — 다른 곳에서 바꿨을 때만 그 종목의 테마 전부를 띠로 올리고 스크롤.
    useEffect(() => {
        if (!focusCode) {
            setPromoted([]);
            return;
        }
        if (isSelfPick(focusCode)) return;
        const themes = focusThemes();
        setPromoted(themes);
        const target = themes.length > 0 ? BAND_REF : focusInIndividuals ? INDIVIDUAL_REF : focusInUnclassified ? UNCLASSIFIED_REF : null;
        if (target) setScrollTarget(target);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusCode]);

    // 처음 그릴 때(날짜 전환·보기 전환 포함)도 현재 종목의 테마로 — 출처와 무관.
    useEffect(() => {
        if (!focusCode) return;
        const themes = focusThemes();
        if (themes.length > 0) {
            setPromoted(themes);
            setScrollTarget(BAND_REF);
        } else if (focusInIndividuals || focusInUnclassified) {
            setScrollTarget(focusInIndividuals ? INDIVIDUAL_REF : UNCLASSIFIED_REF);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const promotedCards = grouped.themes.filter((g) => promoted.includes(g.theme));
    const promotedSet = new Set(promotedCards.map((g) => g.theme));
    const restCards = grouped.themes.filter((g) => !promotedSet.has(g.theme));
    const empty = grouped.themes.length === 0 && grouped.individuals.length === 0 && grouped.unclassified.length === 0;

    const byThemeStocks = new Map(grouped.themes.map((g) => [g.theme, g.stocks]));
    const relatedOf = (g: ThemeGroup<BoardStock>): RelatedInfo[] =>
        relatedThemes(g.theme, g.stocks, byThemeStocks, parents).map((r) => {
            const roster = byThemeStocks.get(r.theme) ?? [];
            return { theme: r.theme, kind: r.kind, common: g.stocks.filter((s) => s.themes.includes(r.theme)).length, total: roster.length };
        });

    // 띠 카드는 펼쳐 현재 종목이 보이게 한다. key 를 갈라 띠 진입·이탈 때 다시 마운트(펼침 반영).
    const renderCard = (g: ThemeGroup<BoardStock>, promotedCard = false): JSX.Element => (
        <div key={`${g.theme}${promotedCard ? "-promoted" : ""}`} ref={(el) => register(g.theme, el)} data-band={promotedCard ? "current" : undefined} style={{ scrollMarginTop: 8 }}>
            <ThemeCard
                theme={g.theme}
                stocks={g.stocks}
                focusCode={focusCode}
                onPick={onPick}
                onInspect={onInspect}
                related={relatedOf(g)}
                onGoto={gotoTheme}
                initialMode={promotedCard ? "open" : "collapsed"}
            />
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {/* overflowAnchor none: 카드 펼침에 스크롤이 튀지 않게. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowAnchor: "none" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, maxWidth: 760, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
                    {promotedCards.length > 0 && (
                        <>
                            <div ref={(el) => register(BAND_REF, el)} style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 2px", scrollMarginTop: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: "var(--text-tertiary)" }}>현재 종목</span>
                                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                            {promotedCards.map((g) => renderCard(g, true))}
                            {restCards.length > 0 && <div style={{ height: 1, background: "var(--border-default)", margin: "0 2px" }} />}
                        </>
                    )}
                    {restCards.map((g) => renderCard(g))}
                    {grouped.individuals.length > 0 && (
                        <div key={`ind-${focusInIndividuals}`} ref={(el) => register(INDIVIDUAL_REF, el)} style={{ scrollMarginTop: 8 }}>
                            <ThemeCard theme={INDIVIDUAL_CARD} stocks={grouped.individuals} focusCode={focusCode} onPick={onPick} onInspect={onInspect} showRank={false} initialMode={focusInIndividuals ? "open" : "collapsed"} />
                        </div>
                    )}
                    {grouped.unclassified.length > 0 && (
                        <div key={`unc-${focusInUnclassified}`} ref={(el) => register(UNCLASSIFIED_REF, el)} style={{ scrollMarginTop: 8 }}>
                            <ThemeCard theme={unclassifiedName} stocks={grouped.unclassified} focusCode={focusCode} onPick={onPick} onInspect={onInspect} showRank={false} initialMode={focusInUnclassified ? "open" : "collapsed"} />
                        </div>
                    )}
                    {empty && <Center>표시할 종목 없음</Center>}
                </div>
            </div>
        </div>
    );
}
