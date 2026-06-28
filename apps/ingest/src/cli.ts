// ingest CLI(composition root 진입점). 실 키움/KIS/Postgres 와 붙여 검증·수집.
//
// 사용법:
//   start universe                        라이브 ka10099 → stock_master upsert-accumulate
//   start sweep-daily [limit]             유니버스 갱신 + 전종목(또는 limit) 일봉 수집
//   start candidates <YYYY-MM-DD>         그 거래일 프루닝 → 분봉 수집 후보 출력
//   start <종목코드> [분봉날짜 YYYY-MM-DD] 한 종목 일봉(1.5년·자가치유) + 분봉
import { seoulToday } from "@trade-data-manager/market";
import { createIngestRuntime, type IngestRuntime } from "./composition.js";
import { sweepDailyCandles } from "./sweep.js";

async function runUniverse(rt: IngestRuntime): Promise<void> {
    console.log("▶ 유니버스 수집 (ka10099 코스피+코스닥)");
    const r = await rt.universe.ingestStockMasters();
    console.log(`  ✓ stock_master upsert=${r.saved}종목 (스윕 대상 코드 ${r.stockCodes.length}개)`);
}

async function runSweepDaily(rt: IngestRuntime, limitArg?: string): Promise<void> {
    const limit = limitArg ? Number(limitArg) : undefined;
    if (limitArg && (!Number.isInteger(limit) || limit! <= 0)) {
        throw new Error(`limit 은 양의 정수여야 함: ${limitArg}`);
    }
    const r = await sweepDailyCandles(rt, { limit });
    console.log(`  ✓ ${r.ok}/${r.total} 성공 (healed ${r.healed}, 실패 ${r.failed.length})`);
    if (r.failed.length) console.log(`  실패 종목: ${r.failed.slice(0, 20).map((f) => f.stockCode).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
}

async function runCandidates(rt: IngestRuntime, date?: string): Promise<void> {
    if (!date) throw new Error("사용법: start candidates <YYYY-MM-DD>");
    console.log(`▶ 프루닝: ${date}`);
    const r = await rt.candidates.selectCandidatesForDate(date);
    console.log(`  ✓ 스캔 ${r.scanned}종목 → 후보 ${r.candidates.length}종목`);
    console.log(`  샘플: ${r.candidates.slice(0, 20).join(", ")}${r.candidates.length > 20 ? " …" : ""}`);
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
                "  start sweep-daily [limit]\n" +
                "  start candidates <YYYY-MM-DD>\n" +
                "  start <종목코드> [분봉날짜 YYYY-MM-DD]",
        );
        process.exit(1);
    }

    const rt = createIngestRuntime();
    try {
        switch (arg1) {
            case "universe":
                await runUniverse(rt);
                break;
            case "sweep-daily":
                await runSweepDaily(rt, arg2);
                break;
            case "candidates":
                await runCandidates(rt, arg2);
                break;
            default:
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
