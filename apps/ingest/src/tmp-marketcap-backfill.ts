// 일회성: 날짜별 시총 백필(특정 종목·기간). 실행 후 삭제.
//   시총(D) = shares(D-1) × 원주가 KRX_close(D-1)  (전날 종가 시총을 그날 칸에).
//   shares 는 KIS 예탁원정보(현재총수 역산), 원주가 종가는 키움(upd_stkpc_tp:"0").
// 이후 시총은 이 백필이 아니라 당일당일 입력 운영으로 간다.
//
// 사용: tsx src/tmp-marketcap-backfill.ts <종목코드> <from YYYY-MM-DD> <to YYYY-MM-DD>
//   예) tsx src/tmp-marketcap-backfill.ts 005930 2025-05-29 2026-06-29
//
// 분봉 백필이 도는 중에도 안전: 새 테이블(market.daily_market_cap)만 IF NOT EXISTS 로 보장(기존/분봉 테이블 무관).
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";
import { KisListInfoAdapter, KiwoomRawDailyAdapter } from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyMarketCapRepository,
} from "@trade-data-manager/persistence";
import { MarketCapBackfillService } from "@trade-data-manager/market";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const [stockCode, from, to] = process.argv.slice(2);
if (!stockCode || !DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) {
    console.error("사용법: tmp-marketcap-backfill <종목코드> <from YYYY-MM-DD> <to YYYY-MM-DD>");
    process.exit(1);
}

const pool = createPoolFromEnv();
const db = createDb(pool);
const kiwoom = createKiwoom();
const kis = createKis();

const service = new MarketCapBackfillService({
    listInfo: new KisListInfoAdapter(kis.rest),
    rawDaily: new KiwoomRawDailyAdapter(kiwoom.rest),
    repo: new DrizzleDailyMarketCapRepository(db),
});

// 분봉 테이블/파티션을 건드리지 않는 단독 DDL — 새 테이블만 생성(이미 있으면 무동작).
const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS market.daily_market_cap (
    stock_code varchar(10) NOT NULL,
    trade_date date NOT NULL,
    market_cap bigint NOT NULL,
    PRIMARY KEY (stock_code, trade_date)
)`;

async function main(): Promise<void> {
    const t0 = Date.now();
    await pool.query(ENSURE_TABLE);
    const r = await service.backfill(stockCode, { from, to });
    console.log(
        `DONE\t${r.stockCode}\t${r.range.from}~${r.range.to}\t` +
            `이벤트=${r.eventCount}\t총주식수=${r.totalShares}\t원주가일=${r.rawDays}\t저장=${r.stored}행\t` +
            `${Math.round((Date.now() - t0) / 1000)}s`,
    );
}

main()
    .catch((e) => {
        console.error("FAILED", e instanceof Error ? (e.stack ?? e.message) : e);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
