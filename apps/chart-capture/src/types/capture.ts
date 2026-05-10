export interface LineSpec {
    column: string;
    values: number[];
    color: string;
}

export interface CaptureCsvRow {
    stockCode: string;
    tradeDate: string;
    lines: LineSpec[];
}

export interface CaptureJob {
    stockCode: string;
    stockName: string;
    tradeDate: string;
    variant: "KRX" | "NXT";
    outputPath: string;
    lines: LineSpec[];
}

export type CaptureStatus = "success" | "skipped" | "failed";

export interface CaptureResult {
    status: CaptureStatus;
    reason?: string;
    error?: string;
}

export interface JobResult {
    job: CaptureJob;
    result: CaptureResult;
}

export interface ParsedCsv {
    rows: CaptureCsvRow[];
    errors: Array<{ line: number; message: string }>;
}
