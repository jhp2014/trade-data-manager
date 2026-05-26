export interface DailyCandle {
    time: number;
    krx: { open: number; high: number; low: number; close: number };
    nxt: { open: number; high: number; low: number; close: number };
    volumeKrx?: number;
    amountKrx?: number;
    volumeNxt?: number;
    amountNxt?: number;
    prevCloseKrx?: number;
    prevCloseNxt?: number;
}

export type { MinuteCandle } from "@trade-data-manager/chart-utils";
