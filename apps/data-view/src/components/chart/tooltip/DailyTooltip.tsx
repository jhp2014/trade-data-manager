"use client";

import { kstYmd } from "@/lib/chartTime";

interface DailyTooltipProps {
    time: number;
    cursorKrxPct: number | null;
    cursorNxtPct: number | null;
    hoverHighKrxPct: number | null;
    hoverHighNxtPct: number | null;
    cursorAmountEok: string | null;
}

function fmtPct(v: number | null) {
    if (v === null) return <span style={{ color: "#a0a0a0" }}>—</span>;
    const color = v >= 0 ? "#ef4444" : "#3b82f6";
    return <span style={{ color }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}

export function DailyTooltip({ time, cursorKrxPct, cursorNxtPct, hoverHighKrxPct, hoverHighNxtPct, cursorAmountEok }: DailyTooltipProps) {
    return (
        <>
            <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6 }}>{kstYmd(time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", fontSize: 12 }}>
                <div style={{ color: "#a0a0a0" }}>Today KRX %</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(cursorKrxPct)}</div>
                <div style={{ color: "#a0a0a0" }}>Today NXT %</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(cursorNxtPct)}</div>
                <div style={{ color: "#a0a0a0" }}>Cursor Candle KRX %</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(hoverHighKrxPct)}</div>
                <div style={{ color: "#a0a0a0" }}>Cursor Candle NXT %</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(hoverHighNxtPct)}</div>
                <div style={{ color: "#a0a0a0" }}>Cursor Candle Amount</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cursorAmountEok ?? "—"}</div>
            </div>
        </>
    );
}
