import { useState } from "react";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";
import { StarIcon, HideIcon, iconBtn } from "./boardIcons.js";
import { StockRow } from "./StockRow.js";
import { AXIS_HI, fmtRate1, type BoardStock, type ListMode, type RelatedInfo } from "./boardTypes.js";

// 보드 카드 공용 타입은 boardTypes 에서 정의 — 기존 소비자를 위해 여기서 재노출.
export type { BoardStock, RelatedInfo } from "./boardTypes.js";
export { AXIS_LO, AXIS_HI } from "./boardTypes.js";

export function ThemeCard({
    theme,
    stocks,
    focusCode,
    onPick,
    selected,
    onSelect,
    isFav,
    onToggleFav,
    onHide,
    dragHandle,
    related,
    onGoto,
    isHidden,
    showRank = true,
    initialMode = "collapsed",
    subordinate = false,
}: {
    theme: string;
    stocks: BoardStock[];
    focusCode: string;
    onPick: (code: string) => void;
    showRank?: boolean; // 개별/미분류 카드는 순위 미표시
    selected?: boolean;
    onSelect?: (theme: string) => void;
    isFav?: boolean;
    onToggleFav?: (theme: string) => void;
    onHide?: (theme: string) => void;
    dragHandle?: Record<string, unknown>;
    related?: RelatedInfo[]; // 하단 관련 테마(카드에만, 개별/미분류 없음)
    onGoto?: (theme: string) => void; // 관련 테마 클릭 = 이동
    isHidden?: (theme: string) => boolean; // 숨긴 테마면 관련칩 흐릿
    initialMode?: ListMode; // 최초 펼침 단계(기본 접힘). 현재 종목 자동승격 카드는 movers 로 열림.
    subordinate?: boolean; // 개별/미분류 카드 — 좌측 라인을 점선으로(정식 테마 아님 표시).
}): JSX.Element {
    const [mode, setMode] = useState<ListMode>(initialMode);
    const movers = stocks.filter((s) => s.isMover || s.signal); // 신호 종목은 등락률 낮아도 주도주로 승격
    const rest = stocks.filter((s) => !(s.isMover || s.signal));
    const hot = stocks.filter((s) => s.signal).length;
    const hasFocus = stocks.some((s) => s.code === focusCode);
    const rankOf = new Map(stocks.map((s, i) => [s.code, i + 1]));
    const cycle = (): void => setMode((m) => (m === "collapsed" ? "movers" : m === "movers" ? "all" : "collapsed"));
    const stop = (e: React.MouseEvent): void => e.stopPropagation();
    // 좌측 라인 = 상태 인코딩(직교): 현재종목 포함 → teal / 개별·미분류 → 점선 / 그 외 → 회색.
    // 클릭 선택은 라인이 아니라 헤더 틴트로만 표시(selected ? accent-soft). 즐겨찾기 카드는 이 라인이 드래그 핸들.
    const railBg = hasFocus
        ? "var(--accent-primary)"
        : subordinate
            ? "repeating-linear-gradient(var(--border-default) 0 4px, transparent 4px 8px)"
            : "var(--border-strong)";
    return (
        <div className={`board-card${hot > 0 ? " board-blink" : ""}`} style={{ display: "flex", background: "var(--bg-primary)", overflow: "hidden" }}>
            <div
                {...(dragHandle ?? {})}
                title={dragHandle ? "드래그로 순서 변경" : undefined}
                style={{ flexShrink: 0, width: 3, alignSelf: "stretch", background: railBg, cursor: dragHandle ? "grab" : "default", touchAction: dragHandle ? "none" : undefined }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    onClick={onSelect ? () => onSelect(theme) : undefined}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        background: selected ? "var(--accent-soft)" : undefined,
                        cursor: onSelect ? "pointer" : undefined,
                    }}
                >
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{theme}</span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12, flexShrink: 0 }} title="주도주 / 전체">
                        {movers.length} / {stocks.length}
                    </span>
                    {hot > 0 && (
                        <span className="tabular" style={{ color: "var(--rise)", fontSize: 12, flexShrink: 0 }} title="지금 주목(1분 델타) 종목 수">
                            🔥{hot}
                        </span>
                    )}
                    {(onToggleFav || onHide) && (
                        <span className="card-actions" style={{ marginLeft: "auto", display: "flex", gap: 2, flexShrink: 0 }}>
                            {onHide && (
                                <button className="hover-only" onClick={(e) => { stop(e); onHide(theme); }} title="숨기기" style={iconBtn}>
                                    <HideIcon />
                                </button>
                            )}
                            {onToggleFav && (
                                <button className={isFav ? undefined : "hover-only"} onClick={(e) => { stop(e); onToggleFav(theme); }} title={isFav ? "즐겨찾기 해제" : "즐겨찾기"} style={{ ...iconBtn, color: isFav ? "var(--warning)" : "var(--text-tertiary)" }}>
                                    <StarIcon filled={isFav} />
                                </button>
                            )}
                        </span>
                    )}
                </div>

                <DistBar stocks={stocks} mode={mode} onCycle={cycle} />

                {mode !== "collapsed" && (
                    <div>
                        {movers.map((s) => (
                            <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} home={theme} />
                        ))}
                        {mode === "all" &&
                            rest.map((s, i) => (
                                <StockRow key={s.code} s={s} rank={showRank ? rankOf.get(s.code)! : null} selected={s.code === focusCode} onPick={onPick} boundary={i === 0 && movers.length > 0} home={theme} />
                            ))}
                    </div>
                )}

                {related && related.length > 0 && onGoto && <InfoLine home={theme} related={related} onGoto={onGoto} isHidden={isHidden} />}
            </div>
        </div>
    );
}

/** 카드 하단 관련 테마 — 포함관계는 박스-인-박스 `[부모 [자식]]`, 부분 겹침은 알약. market-eye InfoLine.
 *  숨긴 테마인 관련칩은 흐릿하게. */
function InfoLine({ home, related, onGoto, isHidden }: { home: string; related: RelatedInfo[]; onGoto: (theme: string) => void; isHidden?: (theme: string) => boolean }): JSX.Element {
    const scrollRef = useHorizontalWheel<HTMLDivElement>();
    return (
        <div
            ref={scrollRef}
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", gap: 6, padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", overflowX: "auto", scrollbarWidth: "none", whiteSpace: "nowrap" }}
        >
            {related.map((r) => {
                const dim = isHidden?.(r.theme) ? 0.45 : 1;
                const badge = (
                    <span className="tabular" style={{ fontSize: 10, fontWeight: 800, opacity: 0.6, marginLeft: 4 }}>
                        {r.movers}/{r.total}
                    </span>
                );
                if (r.kind === "overlap") {
                    return (
                        <button key={r.theme} onClick={() => onGoto(r.theme)} title="관련 테마" style={{ ...overlapPill, opacity: dim }}>
                            {r.theme}
                            {badge}
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
                        style={{ ...relNestStyle(relIsChild), opacity: dim }}
                    >
                        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, color: relIsChild ? "var(--text-secondary)" : "var(--accent-primary)" }}>
                            {parentName}
                            {!relIsChild && badge}
                        </span>
                        <span style={relBoxStyle(relIsChild)}>
                            {childName}
                            {relIsChild && badge}
                        </span>
                    </button>
                );
            })}
        </div>
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

// 표시단계 하이라이트 밴드 시작(%) — 주도주 강조 경계. 요약 임계(3~5%) 살짝 위(market-eye lead).
const LEAD = 6;

/** 분포 미니맵(수평선) — baseline + 점 + 눈금 + 축 라벨. 클릭=표시단계 순환.
 *  market-eye: 현재 표시단계 하이라이트 밴드(접힘=없음 / 주도주=lead~끝 / 전체=0~끝) + 활성구간 라벨 강조. */
function DistBar({ stocks, mode, onCycle }: { stocks: BoardStock[]; mode: ListMode; onCycle: () => void }): JSX.Element {
    const x = (r: number): number => Math.max(0, Math.min(100, (r / AXIS_HI) * 100));
    const ticks = [5, 10, 20, 30];
    const next = mode === "collapsed" ? "주도주만" : mode === "movers" ? "전체" : "접기";
    const bandFrom = mode === "all" ? 0 : mode === "movers" ? LEAD : null; // null = 밴드 없음(접힘)
    const lblHot = (v: number): boolean => mode === "all" || (mode === "movers" && v >= LEAD);
    return (
        <div onClick={onCycle} title={`클릭: ${next}`} style={{ position: "relative", height: 24, margin: "3px 10px", cursor: "pointer" }}>
            {/* 표시단계 하이라이트 밴드(점·눈금 뒤) */}
            {bandFrom != null && (
                <div style={{ position: "absolute", left: `${x(bandFrom)}%`, width: `${100 - x(bandFrom)}%`, top: 2, height: 12, background: "var(--accent-soft)", borderRadius: 3, zIndex: 0 }} />
            )}
            <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 1, background: "var(--border-default)" }} />
            {ticks.map((t) => (
                <div key={`t${t}`} style={{ position: "absolute", left: `${x(t)}%`, top: 4, width: 1, height: 8, background: "var(--border-subtle)", transform: "translateX(-50%)" }} />
            ))}
            {stocks
                .filter((s) => s.changeRate >= 0 && s.changeRate <= AXIS_HI)
                .map((s) => (
                    <div
                        key={s.code}
                        title={`${s.name} ${fmtRate1(s.changeRate)}`}
                        style={{
                            position: "absolute",
                            left: `${x(s.changeRate)}%`,
                            top: 8,
                            width: s.signal ? 8 : 6,
                            height: s.signal ? 8 : 6,
                            borderRadius: "50%",
                            transform: "translate(-50%, -50%)",
                            background: s.signal ? "#f59e0b" : s.isMover ? "var(--rise)" : "var(--fall)",
                            opacity: s.signal ? 1 : s.isMover ? 0.5 : 0.38,
                            zIndex: s.signal ? 3 : s.isMover ? 1 : 0,
                        }}
                    />
                ))}
            {/* 축 라벨(활성 구간 강조) */}
            <span className="tabular" style={{ position: "absolute", left: 0, top: 14, fontSize: 9, color: lblHot(0) ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: lblHot(0) ? 700 : 400 }}>0%</span>
            {ticks.map((t, i) => (
                <span
                    key={`l${t}`}
                    className="tabular"
                    style={{ position: "absolute", left: `${x(t)}%`, top: 14, fontSize: 9, color: lblHot(t) ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: lblHot(t) ? 700 : 400, whiteSpace: "nowrap", transform: i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
                >
                    {t}%
                </span>
            ))}
        </div>
    );
}

export function BoardCenter({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
            {text}
        </div>
    );
}
