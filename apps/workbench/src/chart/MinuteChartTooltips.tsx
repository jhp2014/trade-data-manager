// 분봉 차트 툴팁 내용물 — 크로스헤어 OHLC 툴팁 + 타점 정보 박스.
// 위치/박스 크롬은 공용 tooltip.tsx, 여기선 분봉 전용 내용만.
import { kstHHmm } from "./chartUtils.js";
import { rateColor } from "./tooltip.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import type { MinutePoint } from "../lib/derive.js";

/**
 * 타점 정보 카드 — 세로선 우측에 뜨는 밝은 카드. 현재 타점 마커·저장 타점 hover 공용.
 * 헤더 = 담백 readout 한 줄("09:58 | +8.7% | 57억"). hypotheses 있으면 그 아래 연결 가설 텍스트.
 */
export function MarkerCard({ point, hypotheses }: { point: MinutePoint; hypotheses?: string[] }): JSX.Element {
    const sep = <span style={{ color: "rgba(0,0,0,0.2)" }}>|</span>;
    const hasHyp = hypotheses != null && hypotheses.length > 0;
    return (
        <div
            style={{
                display: "inline-block",
                maxWidth: 260,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                overflow: "hidden",
            }}
        >
            {/* 헤더 readout 한 줄 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 7px", fontWeight: 600, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text-secondary)" }}>{kstHHmm(point.time)}</span>
                {sep}
                <span style={{ color: rateColor(point.close) }}>{fmtRate(point.close)}</span>
                {sep}
                <span style={{ color: "var(--text-secondary)" }}>{fmtEok(point.amount)}</span>
            </div>
            {/* 연결된 가설 — hover 시에만 뜨므로 길이 제한(maxWidth)만 두고 wrap 허용. */}
            {hasHyp && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "3px 7px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {hypotheses!.map((h, i) => (
                        <div key={i} style={{ display: "flex", gap: 4, alignItems: "baseline", color: "var(--text-secondary)", fontWeight: 500, lineHeight: 1.35 }}>
                            <span style={{ color: "var(--accent-hover, #2563eb)", flexShrink: 0 }}>·</span>
                            <span>{h}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function OhlcTooltip({
    time,
    open,
    high,
    low,
    close,
    amount,
    cumAmount,
}: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    amount: number;
    cumAmount: number;
}): JSX.Element {
    const swing = close >= open ? high - low : -(high - low);
    const cell = (label: string, value: number) => (
        <>
            <div style={{ color: "#a0a0a0" }}>{label}</div>
            <div style={{ textAlign: "right", color: rateColor(value), fontVariantNumeric: "tabular-nums" }}>
                {fmtRate(value)}
            </div>
        </>
    );
    return (
        <>
            <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6 }}>{kstHHmm(time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                {cell("현재", close)}
                {cell("고가", high)}
                {cell("저가", low)}
                {cell("변동폭", swing)}
                <div style={{ color: "#a0a0a0" }}>거래대금</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(amount)}</div>
                <div style={{ color: "#a0a0a0" }}>누적</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(cumAmount)}</div>
            </div>
        </>
    );
}
