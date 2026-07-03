import type { ThemeGroup } from "@trade-data-manager/market/domain";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";
import type { BoardStock } from "./boardTypes.js";

// 보드 상·하단 Rail — NavRail(상단 테마칩 내비) / HiddenRail(하단 숨김 복원). 둘 다 가로 스크롤 칩 줄.
// BoardLayout 이 소유한 선택/숨김 상태를 콜백으로 받아 렌더만 한다.

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
export function HiddenRail({ themes, parents, onUnhide }: { themes: ThemeGroup<BoardStock>[]; parents: Map<string, string[]>; onUnhide: (t: string) => void }): JSX.Element {
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
export function NavRail({
    themes,
    selected,
    onPick,
    focusRow,
}: {
    themes: ThemeGroup<BoardStock>[];
    selected: string | null;
    onPick: (t: string) => void;
    // 2번째 줄 = 현재 종목의 테마(숨김 포함, dim). 3번째 줄 = HOT(주목 시그널, 있을 때만 — 복기보드만).
    focusRow?: { themes: ThemeGroup<BoardStock>[]; isHidden: (t: string) => boolean; onPick: (t: string) => void };
}): JSX.Element | null {
    const hotOf = (g: ThemeGroup<BoardStock>): number => g.stocks.filter((s) => s.signal).length;
    const hotThemes = themes.filter((g) => hotOf(g) > 0).sort((a, b) => hotOf(b) - hotOf(a));
    if (themes.length === 0 && !focusRow && hotThemes.length === 0) return null;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", flexShrink: 0 }}>
            {themes.length > 0 && (
                <ScrollRow>
                    {themes.map((g) => (
                        <NavChip key={g.theme} g={g} on={selected === g.theme} onClick={() => onPick(g.theme)} />
                    ))}
                </ScrollRow>
            )}
            {/* 2번째 줄 = 현재 종목의 테마(보드 로스터 기준). 종목이 로스터에 없으면 None 칩 하나. */}
            {focusRow &&
                (focusRow.themes.length > 0 ? (
                    <ScrollRow>
                        {focusRow.themes.map((g) => (
                            <NavChip key={g.theme} g={g} on={selected === g.theme} onClick={() => focusRow.onPick(g.theme)} dim={focusRow.isHidden(g.theme)} />
                        ))}
                    </ScrollRow>
                ) : (
                    <div style={{ display: "flex" }}>
                        <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 11, color: "var(--text-tertiary)", opacity: 0.6 }}>None</span>
                    </div>
                ))}
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

function NavChip({ g, on, onClick, hotOnly, dim }: { g: ThemeGroup<BoardStock>; on: boolean; onClick: () => void; hotOnly?: boolean; dim?: boolean }): JSX.Element {
    const movers = g.stocks.filter((s) => s.isMover || s.signal).length;
    const hot = g.stocks.filter((s) => s.signal).length;
    return (
        <button
            onClick={onClick}
            title={dim ? `이동: ${g.theme} (숨김)` : `이동: ${g.theme}`}
            style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "2px 8px", borderRadius: 8, border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`, background: on ? "var(--accent-soft)" : "var(--bg-secondary)", fontSize: 11, whiteSpace: "nowrap", cursor: "pointer", opacity: dim ? 0.45 : 1 }}
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
