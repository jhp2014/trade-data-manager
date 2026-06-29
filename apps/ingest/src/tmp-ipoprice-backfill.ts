// 일회성: 공모가(ipoPrice) 백필. 그 기간에 상장한 종목만. 실행 후 삭제.
//   공모가 = KIS 예탁원정보의 상장일 유상증자 행 issue_price(recon 실측). stock_master.ipoPrice 갱신.
//
// 사용: tsx src/tmp-ipoprice-backfill.ts <from> <to>
//   상장일이 [from,to] 안인 종목만 대상(보통 수십 종목) → getListInfo → 공모가 추출 → 갱신.
import { createKis } from "@trade-data-manager/kis";
import { KisListInfoAdapter } from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleStockMasterRepository,
} from "@trade-data-manager/persistence";
import { IpoPriceBackfillService, mapWithConcurrency } from "@trade-data-manager/market";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONCURRENCY = 8;

const [from, to] = process.argv.slice(2);
if (!DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) {
    console.error("사용법: tmp-ipoprice-backfill <from YYYY-MM-DD> <to YYYY-MM-DD>");
    process.exit(1);
}

const pool = createPoolFromEnv();
const db = createDb(pool);
const kis = createKis();

const service = new IpoPriceBackfillService({
    listInfo: new KisListInfoAdapter(kis.rest),
    stockMasterRepo: new DrizzleStockMasterRepository(db),
});

async function main(): Promise<void> {
    const t0 = Date.now();
    const { rows } = await pool.query(
        `SELECT stock_code, to_char(listing_date,'YYYY-MM-DD') AS ld
         FROM market.stock_master
         WHERE listing_date BETWEEN $1 AND $2 ORDER BY listing_date`,
        [from, to],
    );
    console.log(`▶ 공모가 백필 · 상장일 ${from}~${to} · 대상 ${rows.length}종목`);

    let filled = 0;
    let none = 0;
    let failed = 0;
    await mapWithConcurrency(rows, CONCURRENCY, async (r) => {
        const code = r.stock_code as string;
        const ld = r.ld as string;
        try {
            const res = await service.backfill(code, ld);
            if (res.ipoPrice !== null) {
                filled++;
                console.log(`OK\t${code}\t${ld}\t공모가=${res.ipoPrice}`);
            } else {
                none++;
                console.log(`NONE\t${code}\t${ld}`);
            }
        } catch (e) {
            failed++;
            console.log(`FAIL\t${code}\t${e instanceof Error ? e.message : e}`);
        }
    });
    console.log(`DONE\t채움=${filled}\t없음=${none}\t실패=${failed}\t${Math.round((Date.now() - t0) / 1000)}s`);
}

main()
    .catch((e) => {
        console.error("FAILED", e instanceof Error ? (e.stack ?? e.message) : e);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
