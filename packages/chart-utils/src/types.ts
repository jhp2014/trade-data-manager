/**
 * 두 차트 앱(data-view, chart-capture)이 공유하는 최소 분봉 캔들 형태.
 * 각 앱은 이 타입을 재사용하거나 자체 타입에서 호환되도록 정의한다.
 */
export interface MinuteCandle {
    /** unix seconds (UTC) */
    time: number;
    krx: { open: number; high: number; low: number; close: number };
    nxt: { open: number; high: number; low: number; close: number };
    volume?: number;
    amount?: number;
    accAmount?: number;
}
