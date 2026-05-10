import type { CaptureConfig } from "../../capture.config";
import type { LineSpec } from "../types/capture";

export function parseLineColumns(
    row: Record<string, string>,
    config: Pick<CaptureConfig, "lineColors">,
): { lines: LineSpec[]; parseError?: string } {
    const lines: LineSpec[] = [];

    for (const [col, raw] of Object.entries(row)) {
        if (!col.startsWith("line_")) continue;
        if (!raw || raw.trim() === "") continue;

        const tokens = raw.split("|");
        const values: number[] = [];
        let hasError = false;

        for (const token of tokens) {
            const trimmed = token.trim();
            if (trimmed === "") continue;
            const n = Number(trimmed);
            if (!Number.isFinite(n)) {
                hasError = true;
                break;
            }
            values.push(n);
        }

        if (hasError) {
            return {
                lines: [],
                parseError: `line_ 컬럼 '${col}'에 비숫자 토큰이 포함되어 있습니다: "${raw}"`,
            };
        }

        if (values.length === 0) continue;

        const color = config.lineColors[col] ?? config.lineColors["_default"] ?? "#8e8e93";
        lines.push({ column: col, values, color });
    }

    return { lines };
}
