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

export type BuildSheetMatrixOptions = {
    /** 주어지면 'reviewUrl' 컬럼을 추가해 각 타점의 앱 링크를 채운다. */
    baseUrl?: string;
};

export function buildSheetMatrix(
    rows: ReviewExportRow[],
    options: BuildSheetMatrixOptions = {},
): string[][] {
    const manualKeys = collectManualKeys(rows);
    const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "");
    const headers = [
        ...FIXED_COLUMNS,
        ...(baseUrl ? (["reviewUrl"] as const) : []),
        ...FEATURE_COLUMNS,
        ...manualKeys.map(toManualHeader),
    ];

    return [
        [...headers],
        ...rows.map((row) => [
            buildGroupId(row),
            row.reviewId ?? "",
            row.stockCode,
            row.stockName ?? "",
            row.tradeDate,
            formatTime(row.tradeTime),
            row.lineTargets.join(" | "),
            ...(baseUrl ? [buildReviewUrl(baseUrl, row)] : []),
            ...FEATURE_COLUMNS.map((column) => row.features[column] ?? ""),
            ...manualKeys.map((key) => formatPayloadValue(row.payload[key])),
        ]),
    ];
}

/** 복붙 탐색용 GroupId. "종목코드-거래일"(예: 005930-20240115). */
function buildGroupId(row: ReviewExportRow): string {
    return `${row.stockCode}-${row.tradeDate}`;
}

/** 앱 리뷰 화면 링크. tradeTime 이 없으면 09:00 으로 대체(앱 라우트 기본값과 동일). */
function buildReviewUrl(baseUrl: string, row: ReviewExportRow): string {
    const time = (row.tradeTime ?? "").slice(0, 5) || "09:00";
    return `${baseUrl}/review/${row.stockCode}/${row.tradeDate}/${time}`;
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
