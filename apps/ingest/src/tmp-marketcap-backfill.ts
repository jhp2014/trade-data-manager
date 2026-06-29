// 일회성: 날짜별 시총 백필. 기간(+선택 종목) 입력. 실행 후 삭제.
//   시총(D) = shares(D-1) × 원주가 KRX_close(D-1)  (전날 종가 시총을 그날 칸에).
//   shares 는 KIS 예탁원정보(현재총수 역산), 원주가 종가는 키움(upd_stkpc_tp:"0").
// 이후 시총은 이 백필이 아니라 당일당일 입력 운영으로 간다.
//
// 사용:
//   tsx src/tmp-marketcap-backfill.ts <from> <to>            → 그 기간 거래된 전종목
//   tsx src/tmp-marketcap-backfill.ts <from> <to> <종목코드>  → 단일종목
//
// 전종목 대상 = 그 기간 daily_candles 가 있는 종목(실제 거래분). 종목 실패는 격리(한 종목이 전체 안 막게).
// upsert 라 재실행 안전. 새 테이블(market.daily_market_cap)만 IF NOT EXISTS 로 보장(기존/분봉 테이블 무관).
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";
import {
    KisListInfoAdapter,
    KiwoomRawDailyAdapter,
    KiwoomCurrentSharesAdapter,
} from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyMarketCapRepository,
} from "@trade-data-manager/persistence";
import { MarketCapBackfillService, mapWithConcurrency, type DateRange } from "@trade-data-manager/market";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONCURRENCY = 16;

const [from, to, stockCode] = process.argv.slice(2);
if (!DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) {
    console.error("사용법: tmp-marketcap-backfill <from YYYY-MM-DD> <to YYYY-MM-DD> [종목코드]");
    process.exit(1);
}

const pool = createPoolFromEnv();
const db = createDb(pool);
const kiwoom = createKiwoom();
const kis = createKis();

const service = new MarketCapBackfillService({
    listInfo: new KisListInfoAdapter(kis.rest),
    rawDaily: new KiwoomRawDailyAdapter(kiwoom.rest),
    currentShares: new KiwoomCurrentSharesAdapter(kiwoom.rest),
    repo: new DrizzleDailyMarketCapRepository(db),
});

// 분봉 테이블/파티션을 건드리지 않는 단독 DDL — 새 테이블만 생성(이미 있으면 무동작).
const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS market.daily_market_cap (
    stock_code varchar(10) NOT NULL,
    trade_date date NOT NULL,
    market_cap bigint NOT NULL,
    PRIMARY KEY (stock_code, trade_date)
)`;

async function targetCodes(range: DateRange): Promise<string[]> {
    if (stockCode) return [stockCode];
    const { rows } = await pool.query(
        `SELECT DISTINCT stock_code FROM market.daily_candles
         WHERE trade_date BETWEEN $1 AND $2 ORDER BY stock_code`,
        [range.from, range.to],
    );
    return rows.map((r) => r.stock_code as string);
}

async function main(): Promise<void> {
    const t0 = Date.now();
    await pool.query(ENSURE_TABLE);
    const range: DateRange = { from, to };
    const codes = await targetCodes(range);
    console.log(`▶ 시총 백필 ${range.from}~${range.to} · 대상 ${codes.length}종목`);

    let done = 0;
    let stored = 0;
    let failed = 0;
    await mapWithConcurrency(codes, CONCURRENCY, async (code) => {
        try {
            const r = await service.backfill(code, range);
            stored += r.stored;
        } catch (e) {
            failed++;
            console.log(`FAIL\t${code}\t${e instanceof Error ? e.message : e}`);
        } finally {
            if (++done % 200 === 0 || done === codes.length) {
                console.log(`  [${done}/${codes.length}] 저장누계=${stored}행 실패=${failed}`);
            }
        }
    });
    console.log(`DONE\t종목=${codes.length}\t저장=${stored}행\t실패=${failed}\t${Math.round((Date.now() - t0) / 1000)}s`);
}

main()
    .catch((e) => {
        console.error("FAILED", e instanceof Error ? (e.stack ?? e.message) : e);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
