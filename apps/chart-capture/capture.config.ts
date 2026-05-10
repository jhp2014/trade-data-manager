export interface CaptureConfig {
    inputDir: string;
    outputDir: string;
    processedSubdir: "processed";
    failedSubdir: "failed";
    dailyLookbackDays: number;
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    captureBox: { width: number; height: number };
    dailyMinuteRatio: [number, number];
    filenameTemplate: string;
    dateFormat: string;
    variants: ReadonlyArray<"KRX" | "NXT">;
    overwrite: boolean;
    stockNameMaxLength: number;
    lineColors: Record<string, string>;
    concurrency: number;
    navTimeoutMs: number;
    readyTimeoutMs: number;
    readySignal: string;
    emptySelector: string;
    nextPort: number;
    nextStartTimeoutMs: number;
    externalServerUrl?: string;
    devMode: boolean;
}

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`[chart-capture] 환경변수 ${key}가 설정되지 않았습니다.`);
    return v;
}

function envInt(key: string, fallback: number): number {
    const v = process.env[key];
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(overrides: Partial<CaptureConfig> = {}): CaptureConfig {
    return {
        inputDir: overrides.inputDir ?? requireEnv("CAPTURE_INPUT_DIR"),
        outputDir: overrides.outputDir ?? requireEnv("CAPTURE_OUTPUT_DIR"),
        processedSubdir: "processed",
        failedSubdir: "failed",
        dailyLookbackDays: envInt("CAPTURE_LOOKBACK_DAYS", 300),
        viewport: {
            width: envInt("CAPTURE_VIEWPORT_W", 2560),
            height: envInt("CAPTURE_VIEWPORT_H", 1440),
        },
        deviceScaleFactor: envInt("CAPTURE_DPR", 1),
        captureBox: {
            width: envInt("CAPTURE_BOX_W", 2400),
            height: envInt("CAPTURE_BOX_H", 1400),
        },
        dailyMinuteRatio: [1, 1],
        filenameTemplate: "{tradeDate}_{stockCode}_{stockName}_{variant}.png",
        dateFormat: "YYYY.MM.DD",
        variants: ["KRX", "NXT"],
        overwrite: true,
        stockNameMaxLength: 50,
        lineColors: {
            line_target: "#ff3b30",
            line_stop: "#0a84ff",
            line_entry: "#34c759",
            _default: "#8e8e93",
        },
        concurrency: overrides.concurrency ?? envInt("CAPTURE_CONCURRENCY", 1),
        navTimeoutMs: 15000,
        readyTimeoutMs: 15000,
        readySignal: "window.__CHART_READY__ === true",
        emptySelector: '[data-empty="true"]',
        nextPort: overrides.nextPort ?? envInt("CAPTURE_NEXT_PORT", 3939),
        nextStartTimeoutMs: 30000,
        externalServerUrl: overrides.externalServerUrl,
        devMode: overrides.devMode ?? false,
        // overrides 중 자유 필드 병합 (단, 타입 리터럴 필드는 위에서 고정)
        ...(overrides.variants ? { variants: overrides.variants } : {}),
        ...(overrides.filenameTemplate ? { filenameTemplate: overrides.filenameTemplate } : {}),
        ...(overrides.dateFormat ? { dateFormat: overrides.dateFormat } : {}),
        ...(overrides.lineColors ? { lineColors: overrides.lineColors } : {}),
        ...(overrides.overwrite !== undefined ? { overwrite: overrides.overwrite } : {}),
        ...(overrides.stockNameMaxLength ? { stockNameMaxLength: overrides.stockNameMaxLength } : {}),
        ...(overrides.dailyLookbackDays ? { dailyLookbackDays: overrides.dailyLookbackDays } : {}),
    };
}
