"use client";

import { kstHHmm } from "@trade-data-manager/chart-utils";
import { RISE_COLOR, FALL_COLOR } from "@/lib/colors";
import { fmtAmount } from "./ThemeRowList";

interface MinuteOhlcTooltipProps {
    time: number;
    /** 종가(현재) 등락률 % */
    close: number;
    /** 고가 등락률 % */
    high: number;
    /** 저가 등락률 % */
    low: number;
    /** 시가 등락률 % (변동폭 부호 판정용) */
    open: number;
    /** 해당 분봉 거래대금 (KRW) */
    amount: number;
}

/** % 값 색상: 양수 빨강, 음수 파랑, 0 회색. */
function rateColor(v: number) {
    if (v > 0) return RISE_COLOR;
    if (v < 0) return FALL_COLOR;
    return "#a0a0a0";
}

function fmtRate(v: number) {
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function MinuteOhlcTooltip({ time, close, high, low, open, amount }: MinuteOhlcTooltipProps) {
    // 변동폭 = 고가-저가. 캔들 방향 부호: 양봉(종가≥시가) +, 음봉 -.
    const span = high - low;
    const swing = close >= open ? span : -span;

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
            <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6 }}>
                Time: {kstHHmm(time)}
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "auto auto",
                    gap: "3px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                }}
            >
                {cell("현재", close)}
                {cell("고가", high)}
                {cell("저가", low)}
                {cell("변동폭", swing)}
                <div style={{ color: "#a0a0a0" }}>거래대금</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>
                    {fmtAmount(amount)}
                </div>
            </div>
        </>
    );
}
