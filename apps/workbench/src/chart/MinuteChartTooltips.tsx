// 분봉 차트 툴팁 내용물 — 크로스헤어 OHLC 툴팁 + 타점 정보 박스.
// 위치/박스 크롬은 공용 tooltip.tsx, 여기선 분봉 전용 내용만.
import { kstHHmm } from "./chartUtils.js";
import { rateColor } from "./tooltip.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import type { MinutePoint } from "../lib/derive.js";

/** 현재 타점(시간선) 상단 담백 readout — 박스 툴팁 대신 한 줄 가로. "09:58 | +8.7% | 57억". */
export function MarkerReadout({ point }: { point: MinutePoint }): JSX.Element {
    const sep = <span style={{ color: "rgba(0,0,0,0.2)" }}>|</span>;
    return (
        <div
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
        >
            <span style={{ color: "var(--text-secondary)" }}>{kstHHmm(point.time)}</span>
            {sep}
            <span style={{ color: rateColor(point.close) }}>{fmtRate(point.close)}</span>
            {sep}
            <span style={{ color: "var(--text-secondary)" }}>{fmtEok(point.amount)}</span>
        </div>
    );
}

/** 타점 정보 박스 — 저장 타점 hover 공용. 지금은 등락률·거래대금만, 나중에 항목 확장. */
export function PointInfoBox({ point, accent = false }: { point: MinutePoint; accent?: boolean }): JSX.Element {
    return (
        <div
            style={{
                background: "rgba(20,20,24,0.95)",
                color: "#fff",
                border: `1px solid ${accent ? "rgba(37,99,235,0.7)" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 6,
                padding: "7px 10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                whiteSpace: "nowrap",
            }}
        >
            <div style={{ fontSize: 10, color: "#a0a0a0", marginBottom: 4 }}>{kstHHmm(point.time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 12px", fontSize: 11, fontWeight: 600 }}>
                <div style={{ color: "#a0a0a0" }}>등락률</div>
                <div style={{ textAlign: "right", color: rateColor(point.close), fontVariantNumeric: "tabular-nums" }}>{fmtRate(point.close)}</div>
                <div style={{ color: "#a0a0a0" }}>거래대금</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(point.amount)}</div>
            </div>
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
