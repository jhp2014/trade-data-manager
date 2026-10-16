// 분봉 차트 툴팁 내용 — 크로스헤어 OHLC. 위치·박스는 공용 tooltip.tsx.
import { kstHHmm } from "./chartUtils.js";
import { rateColor } from "./tooltip.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import { CHART_LABEL, CHART_VALUE } from "./palette.js";

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
            <div style={{ color: CHART_LABEL }}>{label}</div>
            <div style={{ textAlign: "right", color: rateColor(value), fontVariantNumeric: "tabular-nums" }}>
                {fmtRate(value)}
            </div>
        </>
    );
    return (
        <>
            <div style={{ fontSize: 11, color: CHART_LABEL, marginBottom: 6 }}>{kstHHmm(time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                {cell("현재", close)}
                {cell("고가", high)}
                {cell("저가", low)}
                {cell("변동폭", swing)}
                <div style={{ color: CHART_LABEL }}>거래대금</div>
                <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(amount)}</div>
                <div style={{ color: CHART_LABEL }}>누적</div>
                <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(cumAmount)}</div>
            </div>
        </>
    );
}
