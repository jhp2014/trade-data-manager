import { useState } from "react";
import { AMOUNT_BUCKETS_EOK, type DeltaHit, type RelationKind } from "@trade-data-manager/market/domain";
import { fmtEok } from "../../lib/format.js";

// 보드 등락률 — 소수 1자리(부호 포함). 차트는 2자리(fmtRate) 유지, 보드만 간결하게.
function fmtRate1(v: number): string {
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";
import { AMOUNT_BUCKET_COLORS } from "../../chart/chartUtils.js";

/** 관련 테마 1건(하단 InfoLine 렌더용) — 포함관계 종류 + 그 테마 주도주/전체. */
export interface RelatedInfo {
    theme: string;
    kind: RelationKind;
    movers: number;
    total: number;
}

export const AXIS_LO = -5; // 눕힌 캔들 축 하한
export const AXIS_HI = 30; // 캔들/분포 축 상한

// 카드 종목 표시 단계 — market-eye: 접힘(분포바만) → 주도주만 → 전체.
type ListMode = "collapsed" | "movers" | "all";

export interface BoardStock {
    code: string;
    name: string;
    market: string | null;
    themes: string[];
    changeRate: number;
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 거래대금(원) — EOD=일봉, 복기=누적
    isMover: boolean;
    /** 1분 델타 주목 신호(복기 보드만). EOD 는 없음. */
    signal?: DeltaHit | null;
    /** 필터 조건 불일치(흐림 모드) — 행을 흐릿하게. */
    dim?: boolean;
    /** 거래대금 구간별 EOD 카운트(길이 7) — 이슈 보드만. 거래대금 hover 시 막대그래프. */
    buckets?: number[];
}

// ── 아이콘(market-eye SVG) ────────────────────────────────────
function StarIcon({ filled }: { filled?: boolean }): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.6 14.3 8.3l6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3L2.5 9.2l6.3-.9z" />
        </svg>
    );
}
function HideIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
    );
}
function DragIcon(): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
    );
}

const iconBtn: React.CSSProperties = { display: "inline-flex", padding: "2px", background: "none", color: "var(--text-tertiary)", lineHeight: 0, cursor: "pointer" };

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
}): JSX.Element {
    const [mode, setMode] = useState<ListMode>(initialMode);
    const movers = stocks.filter((s) => s.isMover || s.signal); // 신호 종목은 등락률 낮아도 주도주로 승격
    const rest = stocks.filter((s) => !(s.isMover || s.signal));
    const hot = stocks.filter((s) => s.signal).length;
    const hasFocus = stocks.some((s) => s.code === focusCode);
    const rankOf = new Map(stocks.map((s, i) => [s.code, i + 1]));
    const cycle = (): void => setMode((m) => (m === "collapsed" ? "movers" : m === "movers" ? "all" : "collapsed"));
    const stop = (e: React.MouseEvent): void => e.stopPropagation();
    return (
        <div
            className={hot > 0 ? "board-blink" : undefined}
            style={{
                border: `1px solid ${selected || hasFocus ? "var(--accent-primary)" : "var(--border-default)"}`,
                borderRadius: 8,
                background: "var(--bg-primary)",
                overflow: "hidden",
            }}
        >
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
                {dragHandle && (
                    <button {...dragHandle} onClick={stop} title="드래그로 순서 변경" style={{ ...iconBtn, cursor: "grab", touchAction: "none" }}>
                        <DragIcon />
                    </button>
                )}
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
                    <span style={{ marginLeft: "auto", display: "flex", gap: 2, flexShrink: 0 }}>
                        {onHide && (
                            <button onClick={(e) => { stop(e); onHide(theme); }} title="숨기기" style={iconBtn}>
                                <HideIcon />
                            </button>
                        )}
                        {onToggleFav && (
                            <button onClick={(e) => { stop(e); onToggleFav(theme); }} title={isFav ? "즐겨찾기 해제" : "즐겨찾기"} style={{ ...iconBtn, color: isFav ? "var(--warning)" : "var(--text-tertiary)" }}>
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

// ── 종목 행 — grid: [등수+이름+테마칩(1fr)] [등락률 58] [거래대금 52] [캔들 28] ──
// 등락률·거래대금은 고정폭 우측정렬이라 행끼리 세로줄이 맞는다. 좁아지면 이름/칩이 ellipsis·clip.
function StockRow({
    s,
    rank,
    selected,
    onPick,
    boundary,
    home,
}: {
    s: BoardStock;
    rank: number | null; // null = 순위 미표시(개별/미분류)
    selected: boolean;
    onPick: (code: string) => void;
    boundary?: boolean;
    home?: string; // 카드 테마(칩에서 제외). 개별/미분류는 undefined → 전체 테마 칩.
}): JSX.Element {
    const up = s.changeRate >= 0;
    const chips = home ? s.themes.filter((t) => t !== home) : s.themes;
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
    return (
        <button
            onClick={() => onPick(s.code)}
            style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 48px 46px 28px",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: "none",
                borderTop: boundary ? "2px solid var(--border-strong)" : undefined,
                borderBottom: "1px solid var(--border-subtle)",
                padding: "3px 10px",
                cursor: "pointer",
                background: selected ? "var(--bg-active)" : "transparent",
                font: "inherit",
                overflow: "hidden",
                opacity: s.dim ? 0.35 : 1,
            }}
        >
            {/* col1: 등수 + 이름(ellipsis) + 테마 칩(먼저 clip) */}
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {rank != null && (
                    <span className="tabular" style={{ flexShrink: 0, width: 16, textAlign: "center", color: rank <= 3 ? "var(--accent-primary)" : "var(--text-tertiary)", fontSize: 11, fontWeight: 700 }}>
                        {rank}
                    </span>
                )}
                <span style={{ flexShrink: 1, minWidth: 0, color: "var(--text-primary)", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                </span>
                {chips.length > 0 && (
                    <span style={{ display: "inline-flex", gap: 3, minWidth: 0, overflow: "hidden", flexShrink: 100 }}>
                        {chips.map((t) => (
                            <span key={t} style={{ flexShrink: 0, fontSize: 9, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", borderRadius: 4, padding: "0 4px", whiteSpace: "nowrap" }}>
                                {t}
                            </span>
                        ))}
                    </span>
                )}
            </span>
            {/* col2: 등락률(고정폭 우측정렬, 1자리) */}
            <span className="tabular" style={{ textAlign: "right", whiteSpace: "nowrap", color: up ? "var(--rise)" : "var(--fall)", fontWeight: 600, fontSize: 11 }}>
                {fmtRate1(s.changeRate)}
            </span>
            {/* col3: 거래대금(신호 시 델타로 덮음). hover 시 거래대금 구간별 막대그래프(이슈). */}
            <span
                className="tabular"
                style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, fontWeight: s.signal ? 600 : 400, color: s.signal ? "var(--rise)" : "var(--text-tertiary)" }}
                onMouseEnter={s.buckets ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                onMouseMove={s.buckets ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                onMouseLeave={s.buckets ? () => setHoverPos(null) : undefined}
            >
                {s.signal ? `+${fmtEok(s.signal.tvDelta)}` : fmtEok(s.amount)}
            </span>
            {hoverPos && s.buckets && <BucketChart buckets={s.buckets} pos={hoverPos} />}
            {/* col4: 눕힌 캔들(고정 28px) */}
            <Candle s={s} />
        </button>
    );
}

/** 거래대금 구간별 누적 개수 막대그래프 — 거래대금 hover 시. 막대 위 횟수, 아래 구간 하한(억). */
function BucketChart({ buckets, pos }: { buckets: number[]; pos: { x: number; y: number } }): JSX.Element {
    const max = Math.max(1, ...buckets);
    const H = 42;
    return (
        <div
            style={{
                position: "fixed",
                left: pos.x + 14, // 차트 툴팁처럼 커서 오른쪽으로 오프셋, y 는 살짝 위로 — 커서/행을 가리지 않게
                top: pos.y - 28,
                display: "flex",
                gap: 3,
                alignItems: "flex-end",
                background: "rgba(20,20,24,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                padding: "6px 8px",
                zIndex: 200,
                pointerEvents: "none",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
        >
            {buckets.map((c, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 16 }}>
                    <span className="tabular" style={{ fontSize: 8, color: "#e4e4e7", height: 10, lineHeight: "10px" }}>{c > 0 ? c : ""}</span>
                    <div style={{ width: 11, height: Math.max(2, (c / max) * H), background: AMOUNT_BUCKET_COLORS[i], borderRadius: 1 }} />
                    <span className="tabular" style={{ fontSize: 7, color: "#a0a0a0" }}>{AMOUNT_BUCKETS_EOK[i]}</span>
                </div>
            ))}
        </div>
    );
}

/** 눕힌 일봉 캔들 — 축 AXIS_LO~AXIS_HI, 고정폭 28px. 양봉(종가≥시가) 빨강, 음봉 파랑. */
function Candle({ s }: { s: BoardStock }): JSX.Element {
    const span = AXIS_HI - AXIS_LO;
    const x = (p: number): number => Math.max(0, Math.min(100, ((p - AXIS_LO) / span) * 100));
    const up = s.changeRate >= s.openPct;
    const color = up ? "var(--rise)" : "var(--fall)";
    const bodyL = x(Math.min(s.openPct, s.changeRate));
    const bodyR = x(Math.max(s.openPct, s.changeRate));
    const wickL = x(s.lowPct);
    const wickR = x(s.highPct);
    return (
        <span style={{ position: "relative", width: 28, height: 14, flexShrink: 0 }}>
            <span style={{ position: "absolute", left: `${x(0)}%`, top: 0, height: "100%", width: 1, background: "var(--border-strong)" }} />
            <span style={{ position: "absolute", left: `${wickL}%`, width: `${Math.max(wickR - wickL, 0.5)}%`, top: 6, height: 2, background: color, opacity: 0.55, borderRadius: 1 }} />
            <span style={{ position: "absolute", left: `${bodyL}%`, width: `${Math.max(bodyR - bodyL, 2)}%`, top: 3, height: 8, background: color, borderRadius: 1 }} />
        </span>
    );
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
        <div onClick={onCycle} title={`클릭: ${next}`} style={{ position: "relative", height: 28, margin: "3px 10px", cursor: "pointer" }}>
            {/* 표시단계 하이라이트 밴드(점·눈금 뒤) */}
            {bandFrom != null && (
                <div style={{ position: "absolute", left: `${x(bandFrom)}%`, width: `${100 - x(bandFrom)}%`, top: 3, height: 12, background: "var(--accent-soft)", borderRadius: 3, zIndex: 0 }} />
            )}
            <div style={{ position: "absolute", left: 0, right: 0, top: 9, height: 1, background: "var(--border-default)" }} />
            {ticks.map((t) => (
                <div key={`t${t}`} style={{ position: "absolute", left: `${x(t)}%`, top: 5, width: 1, height: 9, background: "var(--border-default)", transform: "translateX(-50%)" }} />
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
                            top: 9,
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
            <span className="tabular" style={{ position: "absolute", left: 0, top: 16, fontSize: 9, color: lblHot(0) ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: lblHot(0) ? 700 : 400 }}>0%</span>
            {ticks.map((t, i) => (
                <span
                    key={`l${t}`}
                    className="tabular"
                    style={{ position: "absolute", left: `${x(t)}%`, top: 16, fontSize: 9, color: lblHot(t) ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: lblHot(t) ? 700 : 400, whiteSpace: "nowrap", transform: i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
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
