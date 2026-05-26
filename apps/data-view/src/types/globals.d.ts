import type { Pool } from "pg";

declare global {
    // eslint-disable-next-line no-var
    var __dataViewDbPool: Pool | undefined;
}

export {};
