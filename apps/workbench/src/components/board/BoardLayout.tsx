import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { relatedThemes, type Grouped, type ThemeGroup } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock, type RelatedInfo } from "./BoardCard.js";
import { NavRail, HiddenRail, type FocusBadge } from "./BoardRails.js";
import { boardNavOrder, stepInList } from "./boardNavOrder.js";
import type { BoardNav } from "./boardNav.js";

// 꼬리 카드(개별·미분류) — 머리 문구와 **스크롤 주소를 갈라 둔다**: 주소를 테마 이름 그대로 쓰면
// 큐레이션에 같은 이름의 테마가 실제로 있을 때 cardRefs 에서 서로를 덮어 엉뚱한 카드로 스크롤한다.
const INDIVIDUAL_CARD = "개별 종목";
const UNCLASSIFIED_CARD = "미분류";
const INDIVIDUAL_REF = "tail:individuals";
const UNCLASSIFIED_REF = "tail:unclassified";

// 보드 본문 공용 — NavRail + 카드(현재 종목 밴드 / 즐겨찾기 / 나머지 / 개별·미분류) + 숨김 Rail. 두 보드 공유.
// 즐겨찾기(★)·숨김(👁)은 세션 휘발 로컬 상태. 자동숨김=현재 시점 포함관계(비sticky — 복기 스크럽에
// 따라 동적으로 숨김/복원). 사용자 override(userHidden)가 자동숨김보다 우선. 드래그 정렬은 후속(4b).
// 상단 '현재 종목' 밴드: 다른 패널(외부 origin)이 종목을 바꾸면 그 종목의 보이는 테마 전부를 승격+스크롤,
// 이 보드에서 직접 고른 내부 선택은 제자리(밴드 불변). selfOrigin vs focusOrigin(스토어 lastFocusOrigin)로 구분.
export function BoardLayout({
    grouped,
    parents,
    focusCode,
    onPick,
    selfOrigin,
    focusOrigin,
    excludedByFilter,
    absentLabel,
    showIndividuals = true,
    showUnclassified = true,
    nav,
}: {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    focusCode: string;
    onPick: (code: string) => void;
    selfOrigin: string; // 이 보드 패널의 고유 id(useId). focusOrigin 과 같으면 내가 바꾼 것.
    focusOrigin: string | null; // 마지막 Focus 변경 출처(store.lastFocusOrigin).
    excludedByFilter: Map<string, string[]>; // 필터 hide 로 빠진 코드→사유(포커스 배지 "필터 제외" 판정용).
    absentLabel: string; // 로스터에 아예 없을 때 배지 문구(복기="랭킹 밖" / 테마="보드 밖").
    showIndividuals?: boolean;
    showUnclassified?: boolean;
    nav?: BoardNav; // 주면 w/s 순회의 후보가 된다(카드 순서대로 걷기 — boardNavOrder).
}): JSX.Element {
    const cardRefs = useRef(new Map<string, HTMLElement>());
    const [selected, setSelected] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]); // 즐겨찾기 순서
    const [userHidden, setUserHidden] = useState<Map<string, boolean>>(new Map()); // 수동 숨김/해제 override
    const [promoted, setPromoted] = useState<string[]>([]); // 외부 선택으로 상단 승격된 테마(보드순). 내부 선택엔 불변.

    const [scrollTarget, setScrollTarget] = useState<string | null>(null);
    const register = (theme: string, el: HTMLElement | null): void => {
        if (el) cardRefs.current.set(theme, el);
        else cardRefs.current.delete(theme);
    };
    // 카드 헤더 클릭 = 선택만(스크롤 X). NavRail/레일/관련칩 클릭 = 선택 + 그 카드로 스크롤.
    const selectTheme = (theme: string): void => setSelected((cur) => (cur === theme ? null : theme));
    const gotoTheme = (theme: string): void => {
        setSelected(theme);
        setScrollTarget(theme);
    };
    // scrollTarget 의 카드 ref 가 마운트되면 스크롤(숨김 복원 직후처럼 지연 마운트도 처리).
    useEffect(() => {
        if (!scrollTarget) return;
        const el = cardRefs.current.get(scrollTarget);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setScrollTarget(null);
        }
    });
    const toggleFav = (theme: string): void =>
        setFavorites((prev) => (prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]));
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const onDragEnd = (e: DragEndEvent): void => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const from = favorites.indexOf(String(active.id));
        const to = favorites.indexOf(String(over.id));
        if (from >= 0 && to >= 0) setFavorites(arrayMove(favorites, from, to));
    };
    const hide = (theme: string): void => setUserHidden((prev) => new Map(prev).set(theme, true));
    const unhide = (theme: string): void => setUserHidden((prev) => new Map(prev).set(theme, false));
    const unhideGoto = (theme: string): void => {
        unhide(theme);
        gotoTheme(theme);
    };
    // 꼬리 카드(개별·미분류)도 **스크롤 대상**이다 — 순회가 목록 끝으로 걸어 들어가면 여기서 멈춘다.
    // 테마 카드와 같은 이름 공간(cardRefs 키)을 쓴다: 카드 머리에 적히는 그 문구가 곧 주소다.
    const inTail = (list: readonly BoardStock[]): boolean => !!focusCode && list.some((s) => s.code === focusCode);
    const focusInIndividuals = showIndividuals && inTail(grouped.individuals);
    const focusInUnclassified = showUnclassified && inTail(grouped.unclassified);
    // 자동숨김 = 현재 시점 포함관계(상위 테마에 통째 포함). 사용자 override 우선.
    const isHidden = (theme: string): boolean =>
        userHidden.has(theme) ? userHidden.get(theme)! : (parents.get(theme)?.length ?? 0) > 0;
    // 관련테마 칩 클릭: 숨김이면 해제하고 그 카드로, 아니면 그냥 이동.
    const gotoRelated = (theme: string): void => (isHidden(theme) ? unhideGoto : gotoTheme)(theme);

    // ── w/s 순회 — 카드 순서 × 멤버 순서(첫 등장만). 승격 밴드는 순서에 안 들어간다(boardNavOrder 머리 주석).
    //    고른 종목은 **바깥 출처**로 넘긴다(nav.pick) — 그래야 아래 승격 effect 가 그 카드를 펼치고 스크롤한다.
    if (nav) {
        nav.navRef.current = (dir): void => {
            const order = boardNavOrder(grouped, { favorites, isHidden, showIndividuals, showUnclassified });
            const next = stepInList(order, focusCode || null, dir);
            if (next) nav.pick(next);
        };
    }

    // 외부(다른 패널) 선택이면 그 종목이 속한 '보이는' 테마 전부를 상단 밴드로 승격 + 스크롤.
    // 내부(이 보드에서 클릭)면 밴드 유지·스크롤 X(제자리). 코드 변경 시에만 그 시점 스냅샷으로 재계산.
    useEffect(() => {
        if (!focusCode) {
            setPromoted([]);
            return;
        }
        if (focusOrigin === selfOrigin) return; // 내부 선택 → 제자리(밴드 불변)
        const themes = grouped.themes.filter((g) => !isHidden(g.theme) && g.stocks.some((s) => s.code === focusCode)).map((g) => g.theme);
        setPromoted(themes);
        // 테마 카드에 없으면 꼬리 카드(개별·미분류)로 — 없었다면 순회가 목록 끝에서 아무 말도 안 한다.
        const target = themes[0] ?? (focusInIndividuals ? INDIVIDUAL_REF : focusInUnclassified ? UNCLASSIFIED_REF : null);
        if (target) setScrollTarget(target);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusCode]);

    // 마운트(리스트→테마 전환 포함) 시 현재 종목 테마로 스크롤 + 승격(펼침) — origin 무관(전환은 의도적).
    useEffect(() => {
        if (!focusCode) return;
        const themes = grouped.themes.filter((g) => !isHidden(g.theme) && g.stocks.some((s) => s.code === focusCode)).map((g) => g.theme);
        if (themes.length > 0) {
            setPromoted(themes);
            setScrollTarget(themes[0]);
        } else if (focusInIndividuals || focusInUnclassified) {
            setScrollTarget(focusInIndividuals ? INDIVIDUAL_REF : UNCLASSIFIED_REF); // 꼬리에 있으면 거기로(걷기 경로와 같은 사다리)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const themeByName = new Map(grouped.themes.map((g) => [g.theme, g]));
    // 현재 종목이 속한 테마(숨김 포함) — 공통 focusCode 를 보드 로스터와 대조해 파생. NavRail 2번째 줄용.
    const containsFocus = (g: ThemeGroup<BoardStock>): boolean => !!focusCode && g.stocks.some((s) => s.code === focusCode);
    const focusThemes = grouped.themes.filter(containsFocus); // 보드 로스터 기준(숨김 포함). 비면 아래 배지로.
    // 현재 종목이 보이는 테마 카드에 없을 때 NavRail 2번째 줄에 띄울 상태 배지 — None 을 4갈래로 구분.
    const focusBadge = ((): FocusBadge | null => {
        if (!focusCode || focusThemes.length > 0) return null;
        if (grouped.unclassified.some((s) => s.code === focusCode)) return { text: "미분류", tone: "present" };
        if (grouped.individuals.some((s) => s.code === focusCode)) return { text: "개별", tone: "present" };
        const reasons = excludedByFilter.get(focusCode);
        if (reasons) return { text: "필터 제외", tone: "excluded", title: reasons.length ? `필터 제외: ${reasons.join(", ")}` : undefined };
        return { text: absentLabel, tone: "absent" };
    })();
    // 상단 승격 밴드 — 외부 선택으로 올라온 테마(보드순 유지, 숨김/소멸 제외). fav/rest 에서 빠져 중복 카드 방지.
    const promotedCards = grouped.themes.filter((g) => promoted.includes(g.theme) && !isHidden(g.theme));
    const promotedSet = new Set(promotedCards.map((g) => g.theme));
    const favCards = favorites
        .map((t) => themeByName.get(t))
        .filter((g): g is ThemeGroup<BoardStock> => !!g && !isHidden(g.theme) && !promotedSet.has(g.theme));
    const restCards = grouped.themes.filter((g) => !favorites.includes(g.theme) && !isHidden(g.theme) && !promotedSet.has(g.theme));
    const hiddenThemes = grouped.themes.filter((g) => isHidden(g.theme));

    const empty = grouped.themes.length === 0 && grouped.individuals.length === 0 && grouped.unclassified.length === 0;

    // 관련 테마(하단 InfoLine) — 카드 멤버들이 걸친 다른 ≥2 테마 + 포함관계. domain 순수함수.
    const byThemeStocks = new Map(grouped.themes.map((g) => [g.theme, g.stocks]));
    const relatedOf = (g: ThemeGroup<BoardStock>): RelatedInfo[] =>
        relatedThemes(g.theme, g.stocks, byThemeStocks, parents).map((r) => {
            const roster = byThemeStocks.get(r.theme) ?? [];
            return { theme: r.theme, kind: r.kind, movers: roster.filter((s) => s.isMover || s.signal).length, total: roster.length };
        });

    // 밴드 카드(현재 종목)는 all 로 열어 선택 종목이 주도주가 아니어도 카드에 바로 보이게 한다. key 에 -promoted 를
    // 붙여 승격 진입/이탈 시 리마운트되게 한다(같은 부모에서 key 가 같으면 React 가 인스턴스를 재사용해 initialMode 가 안 먹음).
    const renderCard = (g: ThemeGroup<BoardStock>, promotedCard = false): JSX.Element => {
        return (
            <div key={promotedCard ? `${g.theme}-promoted` : g.theme} ref={(el) => register(g.theme, el)} style={{ scrollMarginTop: 8 }}>
                <ThemeCard
                    theme={g.theme}
                    stocks={g.stocks}
                    focusCode={focusCode}
                    onPick={onPick}
                    selected={selected === g.theme}
                    onSelect={selectTheme}
                    isFav={favorites.includes(g.theme)}
                    onToggleFav={toggleFav}
                    onHide={hide}
                    related={relatedOf(g)}
                    onGoto={gotoRelated}
                    isHidden={isHidden}
                    initialMode={promotedCard ? "all" : "collapsed"}
                />
            </div>
        );
    };

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <NavRail
                themes={[...favCards, ...restCards]}
                selected={selected}
                onPick={gotoTheme}
                focusRow={focusCode ? { themes: focusThemes, isHidden, onPick: gotoRelated, badge: focusBadge } : undefined}
            />
            {/* overflowAnchor none: 카드 펼침(분포바 클릭)에 스크롤이 튀지 않게 — 연속 클릭 유지. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowAnchor: "none" }}>
                {/* 폭이 커지면 카드는 일정폭까지만, 그 이상은 좌우 여백. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, maxWidth: 760, width: "100%", margin: "0 auto" }}>
                    {promotedCards.length > 0 && (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 2px" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: "var(--text-tertiary)" }}>현재 종목</span>
                                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                            {promotedCards.map((g) => renderCard(g, true))}
                            {(favCards.length > 0 || restCards.length > 0) && (
                                <div style={{ height: 1, background: "var(--border-default)", margin: "0 2px" }} />
                            )}
                        </>
                    )}
                    {favCards.length > 0 && (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={favCards.map((g) => g.theme)} strategy={verticalListSortingStrategy}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {favCards.map((g) => (
                                        <SortableThemeCard
                                            key={g.theme}
                                            g={g}
                                            related={relatedOf(g)}
                                            focusCode={focusCode}
                                            onPick={onPick}
                                            selected={selected === g.theme}
                                            onSelect={selectTheme}
                                            onToggleFav={toggleFav}
                                            onHide={hide}
                                            onGoto={gotoRelated}
                                            isHidden={isHidden}
                                            register={register}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                    {favCards.length > 0 && restCards.length > 0 && (
                        <div style={{ height: 1, background: "var(--border-default)", margin: "0 2px" }} />
                    )}
                    {restCards.map((g) => renderCard(g))}
                    {showIndividuals && grouped.individuals.length > 0 && (
                        <div key={`ind-${focusInIndividuals}`} ref={(el) => register(INDIVIDUAL_REF, el)} style={{ scrollMarginTop: 8 }}>
                            <ThemeCard theme={INDIVIDUAL_CARD} stocks={grouped.individuals} focusCode={focusCode} onPick={onPick} showRank={false} subordinate initialMode={focusInIndividuals ? "all" : "collapsed"} />
                        </div>
                    )}
                    {showUnclassified && grouped.unclassified.length > 0 && (
                        <div key={`unc-${focusInUnclassified}`} ref={(el) => register(UNCLASSIFIED_REF, el)} style={{ scrollMarginTop: 8 }}>
                            <ThemeCard theme={UNCLASSIFIED_CARD} stocks={grouped.unclassified} focusCode={focusCode} onPick={onPick} showRank={false} subordinate initialMode={focusInUnclassified ? "all" : "collapsed"} />
                        </div>
                    )}
                    {empty && <BoardCenter text="표시할 종목 없음" />}
                </div>
            </div>
            {hiddenThemes.length > 0 && <HiddenRail themes={hiddenThemes} parents={parents} onUnhide={unhideGoto} />}
        </div>
    );
}

/** 즐겨찾기 카드 래퍼 — @dnd-kit 세로 정렬 + 드래그 핸들. 스크롤 타깃 ref 도 겸한다. */
function SortableThemeCard(props: {
    g: ThemeGroup<BoardStock>;
    related: RelatedInfo[];
    focusCode: string;
    onPick: (code: string) => void;
    selected: boolean;
    onSelect: (theme: string) => void;
    onToggleFav: (theme: string) => void;
    onHide: (theme: string) => void;
    onGoto: (theme: string) => void;
    isHidden: (theme: string) => boolean;
    register: (theme: string, el: HTMLElement | null) => void;
}): JSX.Element {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.g.theme });
    return (
        <div
            ref={(el) => {
                setNodeRef(el);
                props.register(props.g.theme, el);
            }}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.6 : undefined,
                zIndex: isDragging ? 5 : undefined,
                scrollMarginTop: 8,
            }}
        >
            <ThemeCard
                theme={props.g.theme}
                stocks={props.g.stocks}
                focusCode={props.focusCode}
                onPick={props.onPick}
                selected={props.selected}
                onSelect={props.onSelect}
                isFav
                onToggleFav={props.onToggleFav}
                onHide={props.onHide}
                dragHandle={{ ...attributes, ...listeners }}
                related={props.related}
                onGoto={props.onGoto}
                isHidden={props.isHidden}
            />
        </div>
    );
}
