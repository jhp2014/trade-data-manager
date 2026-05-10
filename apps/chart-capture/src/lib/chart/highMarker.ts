export const HIGH_MARKER_MIN_PCT = 10;

export function highMarkerColor(pct: number): string | null {
    if (pct < HIGH_MARKER_MIN_PCT) return null;
    if (pct < 15) return "#fbbf24";
    if (pct < 20) return "#fb923c";
    if (pct < 25) return "#ef4444";
    if (pct < 30) return "#a855f7";
    return "#7c3aed";
}
