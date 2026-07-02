import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { relatedThemes, type Grouped, type ThemeGroup } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock, type RelatedInfo } from "./BoardCard.js";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";

// 보드 본문 공용 — NavRail + 카드(즐겨찾기 상단 / 나머지 / 개별·미분류) + 숨김 Rail. 두 보드 공유.
// 즐겨찾기(★)·숨김(👁)은 세션 휘발 로컬 상태. 자동숨김=현재 시점 포함관계(비sticky — 복기 스크럽에
// 따라 동적으로 숨김/복원). 사용자 override(userHidden)가 자동숨김보다 우선. 드래그 정렬은 후속(4b).
export function BoardLayout({
    grouped,
    parents,
    focusCode,
    onPick,
    showIndividuals = true,
    showUnclassified = true,
}: {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    focusCode: string;
    onPick: (code: string) => void;
    showIndividuals?: boolean;
    showUnclassified?: boolean;
}): JSX.Element {
    const cardRefs = useRef(new Map<string, HTMLElement>());
    const [selected, setSelected] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]); // 즐겨찾기 순서
    const [userHidden, setUserHidden] = useState<Map<string, boolean>>(new Map()); // 수동 숨김/해제 override

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
    // 자동숨김 = 현재 시점 포함관계(상위 테마에 통째 포함). 사용자 override 우선.
    const isHidden = (theme: string): boolean =>
        userHidden.has(theme) ? userHidden.get(theme)! : (parents.get(theme)?.length ?? 0) > 0;
    // 관련테마 칩 클릭: 숨김이면 해제하고 그 카드로, 아니면 그냥 이동.
    const gotoRelated = (theme: string): void => (isHidden(theme) ? unhideGoto : gotoTheme)(theme);

    const themeByName = new Map(grouped.themes.map((g) => [g.theme, g]));
    const favCards = favorites
        .map((t) => themeByName.get(t))
        .filter((g): g is ThemeGroup<BoardStock> => !!g && !isHidden(g.theme));
    const restCards = grouped.themes.filter((g) => !favorites.includes(g.theme) && !isHidden(g.theme));
    const hiddenThemes = grouped.themes.filter((g) => isHidden(g.theme));

    const empty = grouped.themes.length === 0 && grouped.individuals.length === 0 && grouped.unclassified.length === 0;

    // 관련 테마(하단 InfoLine) — 카드 멤버들이 걸친 다른 ≥2 테마 + 포함관계. domain 순수함수.
    const byThemeStocks = new Map(grouped.themes.map((g) => [g.theme, g.stocks]));
    const relatedOf = (g: ThemeGroup<BoardStock>): RelatedInfo[] =>
        relatedThemes(g.theme, g.stocks, byThemeStocks, parents).map((r) => {
            const roster = byThemeStocks.get(r.theme) ?? [];
            return { theme: r.theme, kind: r.kind, movers: roster.filter((s) => s.isMover || s.signal).length, total: roster.length };
        });

    const renderCard = (g: ThemeGroup<BoardStock>): JSX.Element => (
        <div key={g.theme} ref={(el) => register(g.theme, el)} style={{ scrollMarginTop: 8 }}>
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
            />
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <NavRail themes={[...favCards, ...restCards]} selected={selected} onPick={gotoTheme} />
            {/* overflowAnchor none: 카드 펼침(분포바 클릭)에 스크롤이 튀지 않게 — 연속 클릭 유지. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowAnchor: "none" }}>
                {/* 폭이 커지면 카드는 일정폭까지만, 그 이상은 좌우 여백. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, maxWidth: 760, width: "100%", margin: "0 auto" }}>
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
                    {restCards.map(renderCard)}
                    {showIndividuals && grouped.individuals.length > 0 && (
                        <ThemeCard theme="개별 종목" stocks={grouped.individuals} focusCode={focusCode} onPick={onPick} />
                    )}
                    {showUnclassified && grouped.unclassified.length > 0 && (
                        <ThemeCard theme="미분류" stocks={grouped.unclassified} focusCode={focusCode} onPick={onPick} />
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

/** 가로 스크롤 칩 줄(휠=가로). */
function ScrollRow({ children }: { children: React.ReactNode }): JSX.Element {
    const ref = useHorizontalWheel<HTMLDivElement>();
    return (
        <div ref={ref} style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
            {children}
        </div>
    );
}

function hiddenChipStyle(contained: boolean): React.CSSProperties {
    return {
        display: "flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        padding: contained ? "2px 5px 2px 8px" : "2px 8px",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-secondary)",
        fontSize: 11,
        whiteSpace: "nowrap",
        cursor: "pointer",
    };
}

/** 하단 sticky 숨김 Rail — 2줄(위=일반 숨김 / 아래=포함관계 숨김). 각 줄 가로 스크롤, 칩 클릭=복원. */
function HiddenRail({ themes, parents, onUnhide }: { themes: ThemeGroup<BoardStock>[]; parents: Map<string, string[]>; onUnhide: (t: string) => void }): JSX.Element {
    const normal = themes.filter((g) => (parents.get(g.theme)?.length ?? 0) === 0);
    const contained = themes.filter((g) => (parents.get(g.theme)?.length ?? 0) > 0);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "5px 8px", borderTop: "1px solid var(--border-default)", background: "var(--bg-primary)", flexShrink: 0 }}>
                {normal.length > 0 && (
                    <ScrollRow>
                        {normal.map((g) => {
                            const movers = g.stocks.filter((s) => s.isMover || s.signal).length;
                            const hot = g.stocks.filter((s) => s.signal).length;
                            return (
                                <button key={g.theme} onClick={() => onUnhide(g.theme)} title={`복원: ${g.theme}`} style={hiddenChipStyle(false)}>
                                    <span style={{ color: "var(--text-secondary)" }}>{g.theme}</span>
                                    <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{movers}/{g.stocks.length}</span>
                                    {hot > 0 && <span className="tabular" style={{ color: "var(--rise)" }}>🔥{hot}</span>}
                                </button>
                            );
                        })}
                    </ScrollRow>
                )}
                {contained.length > 0 && (
                    <ScrollRow>
                        {contained.map((g) => {
                            const par = parents.get(g.theme) ?? [];
                            return (
                                <button key={g.theme} onClick={() => onUnhide(g.theme)} title={`복원: ${g.theme} (⊂ ${par.join(" · ")})`} style={hiddenChipStyle(true)}>
                                    <span style={{ fontWeight: 700, color: "var(--text-tertiary)" }}>{par.join("·")}</span>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: "var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 6, padding: "2px 7px" }}>
                                        {g.theme}
                                        <span className="tabular" style={{ opacity: 0.7 }}>{g.stocks.length}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </ScrollRow>
                )}
        </div>
    );
}

/** 상단 sticky 테마칩 내비 — 2줄(위=보이는 테마 board순 / 아래=주목 hot 테마). 각 줄 가로 스크롤.
 *  숨긴 테마는 안 나옴(하단 숨김 Rail 에만). 칩 클릭 = 선택 + 카드로 스크롤. */
function NavRail({ themes, selected, onPick }: { themes: ThemeGroup<BoardStock>[]; selected: string | null; onPick: (t: string) => void }): JSX.Element | null {
    if (themes.length === 0) return null;
    const hotOf = (g: ThemeGroup<BoardStock>): number => g.stocks.filter((s) => s.signal).length;
    const hotThemes = themes.filter((g) => hotOf(g) > 0).sort((a, b) => hotOf(b) - hotOf(a));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", flexShrink: 0 }}>
            <ScrollRow>
                {themes.map((g) => (
                    <NavChip key={g.theme} g={g} on={selected === g.theme} onClick={() => onPick(g.theme)} />
                ))}
            </ScrollRow>
            {hotThemes.length > 0 && (
                <ScrollRow>
                    {hotThemes.map((g) => (
                        <NavChip key={g.theme} g={g} on={selected === g.theme} onClick={() => onPick(g.theme)} hotOnly />
                    ))}
                </ScrollRow>
            )}
        </div>
    );
}

function NavChip({ g, on, onClick, hotOnly }: { g: ThemeGroup<BoardStock>; on: boolean; onClick: () => void; hotOnly?: boolean }): JSX.Element {
    const movers = g.stocks.filter((s) => s.isMover || s.signal).length;
    const hot = g.stocks.filter((s) => s.signal).length;
    return (
        <button
            onClick={onClick}
            title={`이동: ${g.theme}`}
            style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "2px 8px", borderRadius: 8, border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`, background: on ? "var(--accent-soft)" : "var(--bg-secondary)", fontSize: 11, whiteSpace: "nowrap", cursor: "pointer" }}
        >
            <span style={{ color: on ? "var(--accent-hover)" : "var(--text-secondary)" }}>{g.theme}</span>
            {hotOnly ? (
                <span className="tabular" style={{ color: "var(--rise)" }}>🔥{hot}</span>
            ) : (
                <>
                    <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{movers}/{g.stocks.length}</span>
                    {hot > 0 && <span className="tabular" style={{ color: "var(--rise)" }}>🔥{hot}</span>}
                </>
            )}
        </button>
    );
}
