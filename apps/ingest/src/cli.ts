// ingest CLI(composition root 진입점). 실 키움/KIS/Postgres 와 붙여 검증·수집.
//
// 사용법:
//   pnpm --filter @trade-data-manager/ingest start universe
//       → 라이브 ka10099(코스피+코스닥) 유니버스 → stock_master upsert-accumulate
//   pnpm --filter @trade-data-manager/ingest start <종목코드> [분봉날짜 YYYY-MM-DD]
//       → 한 종목 일봉(기본 1.5년·자가치유) + 분봉(날짜 생략 시 오늘 KST, 비거래일이면 0)
import { seoulToday } from "@trade-data-manager/market";
import { createIngestRuntime, type IngestRuntime } from "./composition.js";

async function runUniverse(rt: IngestRuntime): Promise<void> {
    console.log("▶ 유니버스 수집 (ka10099 코스피+코스닥)");
    const r = await rt.universe.ingestStockMasters();
    console.log(`  ✓ stock_master upsert=${r.saved}종목 (스윕 대상 코드 ${r.stockCodes.length}개)`);
}

async function runStock(rt: IngestRuntime, stockCode: string, minuteDate: string): Promise<void> {
    console.log(`▶ 일봉 수집: ${stockCode} (기본 1.5년 범위)`);
    const daily = await rt.ingest.ingestDailyCandles(stockCode);
    console.log(`  ✓ healed=${daily.healed} saved=${daily.saved}`);

    console.log(`▶ 분봉 수집: ${stockCode} @ ${minuteDate}`);
    const minute = await rt.ingest.ingestMinuteCandles(stockCode, minuteDate);
    console.log(`  ✓ saved=${minute.saved}${minute.saved === 0 ? " (비거래일이면 0 정상)" : ""}`);
}

async function main(): Promise<void> {
    const [arg1, arg2] = process.argv.slice(2);
    if (!arg1) {
        console.error(
            "사용법:\n" +
                "  start universe\n" +
                "  start <종목코드> [분봉날짜 YYYY-MM-DD]",
        );
        process.exit(1);
    }

    const rt = createIngestRuntime();
    try {
        if (arg1 === "universe") {
            await runUniverse(rt);
        } else {
            await runStock(rt, arg1, arg2 ?? seoulToday());
        }
        console.log("✅ 완료");
    } catch (err) {
        console.error("\n❌ ingest 실패");
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
        process.exitCode = 1;
    } finally {
        await rt.close();
    }
}

void main();
