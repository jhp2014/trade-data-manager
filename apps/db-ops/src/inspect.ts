import type { Client } from "pg";
import type { MonthFingerprint } from "./manifest";

/** 스키마 한정 base 테이블 참조. key = `schema.table` (manifest count 키). */
export interface TableRef {
    schema: string;
    table: string;
    key: string;
}

/** 백업/검증 대상 스키마 (수집=market, 사람편집=curation). drizzle 부기 스키마는 제외. */
const TARGET_SCHEMAS = ["market", "curation"] as const;

/**
 * 대상 스키마의 최상위 base 테이블 목록.
 * relkind r(일반)+p(파티션 부모)만, relispartition=false 로 **자식 파티션은 제외**한다
 * (minute_candles/stock_news 는 월별 파티션 → 부모 하나만 세면 전 파티션 합산이 잡힘).
 * 런타임 열거라 스키마에 테이블이 늘어도 count 검증이 자동 커버한다.
 */
export async function listBaseTables(client: Client): Promise<TableRef[]> {
    const r = await client.query<{ schema: string; table: string }>(
        `SELECT n.nspname AS schema, c.relname AS "table"
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ANY($1)
            AND c.relkind IN ('r', 'p')
            AND c.relispartition = false
          ORDER BY 1, 2`,
        [TARGET_SCHEMAS],
    );
    return r.rows.map((x) => ({ schema: x.schema, table: x.table, key: `${x.schema}.${x.table}` }));
}

/**
 * 테이블별 row count. 큰 정수도 안전하게 다루기 위해 문자열로 반환한다.
 * (스키마/테이블명은 pg_class 열거나 policy 상수에서 오는 고정값이라 주입 위험 없음)
 */
export async function tableCounts(
    client: Client,
    refs: readonly TableRef[],
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const ref of refs) {
        const r = await client.query<{ c: string }>(
            `SELECT count(*)::text AS c FROM "${ref.schema}"."${ref.table}"`,
        );
        out[ref.key] = r.rows[0].c;
    }
    return out;
}

/**
 * 변경 감지용 신호: 분봉 최신 거래일(없으면 ""). minute_candles 는 append-only 라
 * "새 거래일이 적재됐나"를 값싸게(파티션 프루닝) 알려준다. (옛 surrogate max(id) 대체)
 */
export async function minuteMaxTradeDate(client: Client): Promise<string> {
    const r = await client.query<{ d: string | null }>(
        `SELECT max(trade_date)::text AS d FROM market.minute_candles`,
    );
    return r.rows[0].d ?? "";
}

/**
 * ③ 분봉 과거월 지문: 월별 저장 raw(UN) 집계. count + sum(시고저종 UN) + sum(거래량 UN).
 * 값/행이 빠지면 합이 줄어드는 성질로 손상·유실을 감지한다(신규 append 는 증가라 허용).
 * 거래대금은 현행 스키마에서 미저장(파생)이라 지문에서 빠지고, KRX 는 nullable(프리마켓)이라
 * 항상 존재하는 UN 만 쓴다.
 */
export async function minuteMonthlyFingerprint(
    client: Client,
): Promise<Record<string, MonthFingerprint>> {
    const r = await client.query<{
        ym: string;
        rows: string;
        sum_ohlc: string;
        sum_volume: string;
    }>(`
        SELECT to_char(date_trunc('month', trade_date), 'YYYY-MM') AS ym,
               count(*)::text AS rows,
               COALESCE(sum(open_un + high_un + low_un + close_un), 0)::text AS sum_ohlc,
               COALESCE(sum(volume_un), 0)::text AS sum_volume
        FROM market.minute_candles
        GROUP BY 1
    `);
    const out: Record<string, MonthFingerprint> = {};
    for (const row of r.rows) {
        out[row.ym] = {
            rows: row.rows,
            sumOhlc: row.sum_ohlc,
            sumVolume: row.sum_volume,
        };
    }
    return out;
}
