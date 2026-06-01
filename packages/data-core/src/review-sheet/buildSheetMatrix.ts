import { FEATURE_COLUMNS, FIXED_COLUMNS, toManualHeader } from "./columns";

export type ReviewExportRow = {
    reviewId: string | null;
    stockCode: string;
    stockName: string | null;
    tradeDate: string;
    tradeTime: string | null;
    lineTargets: number[];
    features: Record<string, string | null>;
    payload: Record<string, string | string[]>;
};

export function buildSheetMatrix(rows: ReviewExportRow[]): string[][] {
    const manualKeys = collectManualKeys(rows);
    const headers = [
        ...FIXED_COLUMNS,
        ...FEATURE_COLUMNS,
        ...manualKeys.map(toManualHeader),
    ];

    return [
        [...headers],
        ...rows.map((row) => [
            row.reviewId ?? "",
            row.stockCode,
            row.stockName ?? "",
            row.tradeDate,
            formatTime(row.tradeTime),
            row.lineTargets.join(" | "),
            ...FEATURE_COLUMNS.map((column) => row.features[column] ?? ""),
            ...manualKeys.map((key) => formatPayloadValue(row.payload[key])),
        ]),
    ];
}

function collectManualKeys(rows: ReviewExportRow[]): string[] {
    const keys = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row.payload)) {
            keys.add(key);
        }
    }
    return Array.from(keys).sort((a, b) => toManualHeader(a).localeCompare(toManualHeader(b)));
}

function formatPayloadValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value.join(" | ");
    return value ?? "";
}

function formatTime(value: string | null): string {
    if (!value) return "";
    return value.slice(0, 5);
}
