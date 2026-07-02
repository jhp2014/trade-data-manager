import { useRef, useState } from "react";
import type { Grouped, ThemeGroup } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock } from "./BoardCard.js";

// 보드 본문 공용 — NavRail + 카드(즐겨찾기 상단 / 나머지 / 개별·미분류) + 숨김 Rail. 두 보드 공유.
// 즐겨찾기(★)·숨김(👁)은 세션 휘발 로컬 상태. 자동숨김=현재 시점 포함관계(비sticky — 복기 스크럽에
// 따라 동적으로 숨김/복원). 사용자 override(userHidden)가 자동숨김보다 우선. 드래그 정렬은 후속(4b).
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
    const [selected, setSelected] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]); // 즐겨찾기 순서
    const [userHidden, setUserHidden] = useState<Map<string, boolean>>(new Map()); // 수동 숨김/해제 override

    const register = (theme: string, el: HTMLElement | null): void => {
        if (el) cardRefs.current.set(theme, el);
        else cardRefs.current.delete(theme);
    };
    const pickTheme = (theme: string): void => {
        setSelected((cur) => (cur === theme ? null : theme));
        cardRefs.current.get(theme)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const toggleFav = (theme: string): void =>
        setFavorites((prev) => (prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]));
    const hide = (theme: string): void => setUserHidden((prev) => new Map(prev).set(theme, true));
    const unhide = (theme: string): void => setUserHidden((prev) => new Map(prev).set(theme, false));
    // 자동숨김 = 현재 시점 포함관계(상위 테마에 통째 포함). 사용자 override 우선.
    const isHidden = (theme: string): boolean =>
        userHidden.has(theme) ? userHidden.get(theme)! : (parents.get(theme)?.length ?? 0) > 0;

    const themeByName = new Map(grouped.themes.map((g) => [g.theme, g]));
    const favCards = favorites
        .map((t) => themeByName.get(t))
        .filter((g): g is ThemeGroup<BoardStock> => !!g && !isHidden(g.theme));
    const restCards = grouped.themes.filter((g) => !favorites.includes(g.theme) && !isHidden(g.theme));
    const hiddenThemes = grouped.themes.filter((g) => isHidden(g.theme));

    const empty = grouped.themes.length === 0 && grouped.individuals.length === 0 && grouped.unclassified.length === 0;

    const renderCard = (g: ThemeGroup<BoardStock>): JSX.Element => (
        <div key={g.theme} ref={(el) => register(g.theme, el)} style={{ scrollMarginTop: 8 }}>
            <ThemeCard
                theme={g.theme}
                stocks={g.stocks}
                parents={parents.get(g.theme) ?? []}
                focusCode={focusCode}
                onPick={onPick}
                selected={selected === g.theme}
                onSelect={pickTheme}
                isFav={favorites.includes(g.theme)}
                onToggleFav={toggleFav}
                onHide={hide}
            />
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <NavRail grouped={grouped} selected={selected} onPick={pickTheme} isHidden={isHidden} />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                    {favCards.map(renderCard)}
                    {favCards.length > 0 && restCards.length > 0 && (
                        <div style={{ height: 1, background: "var(--border-default)", margin: "0 2px" }} />
                    )}
                    {restCards.map(renderCard)}
                    {grouped.individuals.length > 0 && (
                        <ThemeCard theme="개별 종목" stocks={grouped.individuals} parents={[]} focusCode={focusCode} onPick={onPick} />
                    )}
                    {grouped.unclassified.length > 0 && (
                        <ThemeCard theme="미분류" stocks={grouped.unclassified} parents={[]} focusCode={focusCode} onPick={onPick} />
                    )}
                    {empty && <BoardCenter text="표시할 종목 없음" />}
                </div>
            </div>
            {hiddenThemes.length > 0 && <HiddenRail themes={hiddenThemes} parents={parents} onUnhide={unhide} />}
        </div>
    );
}

/** 하단 sticky 숨김 Rail — 숨긴 테마 칩(클릭 = 복원). 포함관계 자동숨김은 ⊂ 표기. */
function HiddenRail({
    themes,
    parents,
    onUnhide,
}: {
    themes: ThemeGroup<BoardStock>[];
    parents: Map<string, string[]>;
    onUnhide: (t: string) => void;
}): JSX.Element {
    return (
        <div
            style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                padding: "5px 8px",
                borderTop: "1px solid var(--border-default)",
                background: "var(--bg-primary)",
                flexShrink: 0,
            }}
        >
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0, alignSelf: "center" }}>숨김</span>
            {themes.map((g) => {
                const par = parents.get(g.theme) ?? [];
                return (
                    <button
                        key={g.theme}
                        onClick={() => onUnhide(g.theme)}
                        title={`복원: ${g.theme}`}
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
                            color: "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    >
                        {par.length > 0 && <span title={`⊂ ${par.join(" · ")}`}>⊂</span>}
                        <span>{g.theme}</span>
                        <span className="tabular">{g.stocks.length}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** 상단 sticky 테마칩 내비 — 클릭 시 그 테마 선택 + 카드로 스크롤. 숨긴 테마는 흐릿. */
function NavRail({
    grouped,
    selected,
    onPick,
    isHidden,
}: {
    grouped: Grouped<BoardStock>;
    selected: string | null;
    onPick: (t: string) => void;
    isHidden: (t: string) => boolean;
}): JSX.Element | null {
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
                const on = selected === g.theme;
                const dim = isHidden(g.theme);
                return (
                    <button
                        key={g.theme}
                        onClick={() => onPick(g.theme)}
                        title={`이동: ${g.theme}`}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            flexShrink: 0,
                            padding: "2px 8px",
                            borderRadius: 12,
                            border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                            background: on ? "var(--accent-soft)" : "var(--bg-secondary)",
                            fontSize: 11,
                            whiteSpace: "nowrap",
                            opacity: dim ? 0.45 : 1,
                            cursor: "pointer",
                        }}
                    >
                        <span style={{ color: on ? "var(--accent-hover)" : "var(--text-secondary)" }}>{g.theme}</span>
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
