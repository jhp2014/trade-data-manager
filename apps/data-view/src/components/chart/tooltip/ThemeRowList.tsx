"use client";

import { Fragment } from "react";

export interface OverlayTooltipRow {
    stockCode: string;
    stockName: string;
    color: string;
    isSelf: boolean;
    rate: number;
    amount: number;
    cumAmount: number;
}

function fmtAmount(v: number) {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
    return v.toFixed(0);
}

interface Props {
    rows: OverlayTooltipRow[];
}

export function ThemeRowList({ rows }: Props) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: "3px 10px", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <div />
            <div style={{ color: "#a0a0a0" }}>종목</div>
            <div style={{ color: "#a0a0a0", textAlign: "right" }}>변동률</div>
            <div style={{ color: "#a0a0a0", textAlign: "right" }}>분거래대금</div>
            <div style={{ color: "#a0a0a0", textAlign: "right" }}>누적</div>
            {rows.map((r) => {
                const rateColor = r.rate >= 0 ? "#ef4444" : "#3b82f6";
                const selfRowStyle: React.CSSProperties = r.isSelf
                    ? { background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }
                    : {};
                return (
                    <Fragment key={r.stockCode}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, alignSelf: "center", ...selfRowStyle }} />
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120, color: r.isSelf ? "#fff" : "#d4d4d8", fontWeight: r.isSelf ? 600 : undefined, ...selfRowStyle }}>
                            {r.stockName}
                        </div>
                        <div style={{ textAlign: "right", color: rateColor, fontWeight: r.isSelf ? 600 : undefined, ...selfRowStyle }}>
                            {r.rate >= 0 ? "+" : ""}{r.rate.toFixed(2)}%
                        </div>
                        <div style={{ textAlign: "right", color: "#d4d4d8", ...selfRowStyle }}>
                            {fmtAmount(r.amount)}
                        </div>
                        <div style={{ textAlign: "right", color: "#a0a0a0", ...selfRowStyle }}>
                            {fmtAmount(r.cumAmount)}
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}
