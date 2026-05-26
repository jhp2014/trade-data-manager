import type { Pool } from "pg";
import type { LineSpec } from "./capture";

declare global {
    interface Window {
        __CHART_READY__?: boolean;
        __CAPTURE_LINES__?: LineSpec[];
    }

    // eslint-disable-next-line no-var
    var __captureDbPool: Pool | undefined;
}

export {};
