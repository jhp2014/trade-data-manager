import {
    chromium,
    type Browser,
    type Page,
} from "playwright";
import type { CaptureConfig } from "../../capture.config";
import type { CaptureJob, CaptureResult } from "../types/capture";
import type { LineSpec } from "../types/capture";
import { logger } from "../lib/logger";

export interface PlaywrightDriver {
    capture: (job: CaptureJob) => Promise<CaptureResult>;
    close: () => Promise<void>;
}

export async function createPlaywrightDriver(
    config: Pick<
        CaptureConfig,
        | "viewport"
        | "deviceScaleFactor"
        | "navTimeoutMs"
        | "readyTimeoutMs"
        | "readySignal"
        | "emptySelector"
        | "concurrency"
    >,
    baseUrl: string,
): Promise<PlaywrightDriver> {
    const browser: Browser = await chromium.launch({ headless: true });

    if (config.concurrency === 1) {
        // 단일 페이지 재사용
        const context = await browser.newContext({
            viewport: config.viewport,
            deviceScaleFactor: config.deviceScaleFactor,
        });
        const page = await context.newPage();

        return {
            capture: (job) => captureJob(page, job, baseUrl, config),
            close: async () => {
                await context.close();
                await browser.close();
            },
        };
    }

    // concurrency > 1: 각 캡처마다 새 페이지 (호출부에서 Promise.all로 병렬 실행)
    const context = await browser.newContext({
        viewport: config.viewport,
        deviceScaleFactor: config.deviceScaleFactor,
    });

    return {
        capture: async (job) => {
            const page = await context.newPage();
            try {
                return await captureJob(page, job, baseUrl, config);
            } finally {
                await page.close();
            }
        },
        close: async () => {
            await context.close();
            await browser.close();
        },
    };
}

async function captureJob(
    page: Page,
    job: CaptureJob,
    baseUrl: string,
    config: Pick<CaptureConfig, "navTimeoutMs" | "readyTimeoutMs" | "readySignal" | "emptySelector">,
): Promise<CaptureResult> {
    const url = `${baseUrl}/capture/${job.stockCode}/${job.tradeDate}/${job.variant}`;

    try {
        await page.goto(url, { waitUntil: "networkidle", timeout: config.navTimeoutMs });

        // pre-ready 또는 empty 마커 중 먼저 도착하는 쪽 대기
        await Promise.race([
            page.waitForSelector('[data-pre-ready="true"]', { timeout: config.readyTimeoutMs }),
            page.waitForSelector(config.emptySelector, { timeout: config.readyTimeoutMs }),
        ]);

        // empty 체크
        const emptyEl = await page.$(config.emptySelector);
        if (emptyEl) {
            const reason = await emptyEl.getAttribute("data-reason");
            logger.warn(`[capture] skip: ${job.stockCode} ${job.variant} (${reason ?? "empty"})`);
            return { status: "skipped", reason: reason ?? "empty" };
        }

        // 라인 데이터 주입
        await page.evaluate((lines: LineSpec[]) => {
            (window as unknown as { __CAPTURE_LINES__: LineSpec[] }).__CAPTURE_LINES__ = lines;
            window.dispatchEvent(new Event("capture-lines-ready"));
        }, job.lines);

        // 차트 ready 대기
        await page.waitForFunction(config.readySignal, { timeout: config.readyTimeoutMs });

        // 캡처
        await page.locator("#capture-root").screenshot({
            path: job.outputPath,
            omitBackground: false,
        });

        logger.info(`[capture] saved: ${job.outputPath}`);
        return { status: "success" };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[capture] fail: ${job.stockCode} ${job.variant} (${message})`);
        return { status: "failed", error: message };
    }
}

export async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<CaptureResult>,
): Promise<CaptureResult[]> {
    const results: CaptureResult[] = new Array(items.length);
    let idx = 0;

    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i]);
        }
    }

    const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
    await Promise.all(workers);
    return results;
}
