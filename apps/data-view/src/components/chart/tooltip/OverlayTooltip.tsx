"use client";

import { kstHHmm } from "@/lib/chartTime";
import { ThemeRowList, type OverlayTooltipRow } from "./ThemeRowList";

interface OverlayTooltipProps {
    time: number;
    rows: OverlayTooltipRow[];
}

export function OverlayTooltip({ time, rows }: OverlayTooltipProps) {
    return (
        <>
            <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Time: {kstHHmm(time)}</span>
                <span>{rows.length}종목</span>
            </div>
            <ThemeRowList rows={rows} />
        </>
    );
}
