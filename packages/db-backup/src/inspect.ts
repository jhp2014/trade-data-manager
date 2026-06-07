import type { Client } from "pg";
import type { MonthFingerprint } from "./manifest";

/**
 * 테이블별 row count. 큰 정수도 안전하게 다루기 위해 문자열로 반환한다.
 * (테이블명은 policy 상수에서 오는 고정값이라 주입 위험 없음)
 */
export async function tableCounts(
    client: Client,
    tables: readonly string[],
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const t of tables) {
        const r = await client.query<{ c: string }>(`SELECT count(*)::text AS c FROM "${t}"`);
        out[t] = r.rows[0].c;
    }
    return out;
}

/** minute_candles 의 max(id) — 변경 감지용 (없으면 "0"). */
export async function minuteMaxId(client: Client): Promise<string> {
    const r = await client.query<{ m: string }>(
        `SELECT COALESCE(max(id), 0)::text AS m FROM minute_candles`,
    );
    return r.rows[0].m;
}

/**
 * ③ 분봉 과거월 지문(간단판): 월별 raw 컬럼 집계.
 * count + sum(시고저종) + sum(거래량) + sum(거래대금+누적거래대금).
 * 값/행이 빠지면 합이 줄어드는 성질을 이용해 손상·유실을 감지한다.
 */
export async function minuteMonthlyFingerprint(
    client: Client,
): Promise<Record<string, MonthFingerprint>> {
    const r = await client.query<{
        ym: string;
        rows: string;
        sum_ohlc: string;
        sum_volume: string;
        sum_amount: string;
    }>(`
        SELECT to_char(date_trunc('month', trade_date), 'YYYY-MM') AS ym,
               count(*)::text AS rows,
               COALESCE(sum(open_price + high_price + low_price + close_price), 0)::text AS sum_ohlc,
               COALESCE(sum(trading_volume), 0)::text AS sum_volume,
               COALESCE(sum(trading_amount + accumulated_trading_amount), 0)::text AS sum_amount
        FROM minute_candles
        GROUP BY 1
    `);
    const out: Record<string, MonthFingerprint> = {};
    for (const row of r.rows) {
        out[row.ym] = {
            rows: row.rows,
            sumOhlc: row.sum_ohlc,
            sumVolume: row.sum_volume,
            sumAmount: row.sum_amount,
        };
    }
    return out;
}
