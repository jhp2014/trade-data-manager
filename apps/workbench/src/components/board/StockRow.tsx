import { useState } from "react";
import { AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { fmtEok } from "../../lib/format.js";
import { useAssign } from "../../store/assign.js";
import { AMOUNT_BUCKET_COLORS } from "../../chart/chartUtils.js";
import { AXIS_LO, AXIS_HI, fmtRate1, type BoardStock } from "./boardTypes.js";

// ── 종목 행 — grid: [등수+이름+테마칩(1fr)] [등락률 58] [거래대금 52] [캔들 28] ──
// 등락률·거래대금은 고정폭 우측정렬이라 행끼리 세로줄이 맞는다. 좁아지면 이름/칩이 ellipsis·clip.
export function StockRow({
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
    const openAssign = useAssign((st) => st.open);
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
                <span
                    onContextMenu={(e) => {
                        e.preventDefault(); // 기본 브라우저 메뉴 차단(우클릭=테마 배정 팝업). 행 onClick 은 우클릭으로 안 뜸.
                        e.stopPropagation();
                        openAssign({ code: s.code, name: s.name });
                    }}
                    title="우클릭: 테마 배정"
                    style={{ flexShrink: 1, minWidth: 0, color: "var(--text-primary)", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
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
