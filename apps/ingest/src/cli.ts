// ingest CLI(composition root 진입점). 실 키움/KIS/Postgres 와 붙여 검증·수집.
//
// 사용법:
//   start universe                        라이브 ka10099 → stock_master upsert-accumulate
//   start sweep-daily [limit]             유니버스 갱신 + 전종목(또는 limit) 일봉 수집
//   start candidates <YYYY-MM-DD>         그 거래일 프루닝 → 분봉 수집 후보 출력
//   start candidates-range <from> <to>    기간 날짜별 후보 수 분포(읽기 전용, API 안 침)
//   start sweep-minute <YYYY-MM-DD> [poolLimit]  그날 pool 분봉 수집 → 선별 적재(3단계)
//   start sweep-month <YYYY-MM> [poolLimit] [conc]  그 달 모든 거래일 분봉만(저수준)
//   start collect <YYYY-MM-DD> [poolLimit] [conc]   날짜 하나 = 일봉보장 + 분봉 파이프라인
//   start collect-month <YYYY-MM> [poolLimit] [conc] 한 달 = 일봉보장 + 그 달 분봉 파이프라인
//   start <종목코드> [분봉날짜 YYYY-MM-DD] 한 종목 일봉(1.5년·자가치유) + 분봉
import { seoulToday, isValidYearMonth } from "@trade-data-manager/market";
import { createIngestRuntime, type IngestRuntime } from "./composition.js";
import { sweepDailyCandles, sweepMinuteMonth, collectMonth, collectDate } from "./sweep.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runUniverse(rt: IngestRuntime): Promise<void> {
    console.log("▶ 유니버스 수집 (ka10099 코스피+코스닥)");
    const r = await rt.universe.ingestStockMasters();
    console.log(`  ✓ stock_master upsert=${r.saved}종목 (스윕 대상 코드 ${r.stockCodes.length}개)`);
}

function posInt(arg: string | undefined, label: string): number | undefined {
    if (!arg) return undefined;
    const n = Number(arg);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} 은 양의 정수여야 함: ${arg}`);
    return n;
}

async function runSweepDaily(rt: IngestRuntime, limitArg?: string, concurrencyArg?: string): Promise<void> {
    const limit = posInt(limitArg, "limit");
    const concurrency = posInt(concurrencyArg, "concurrency");
    const r = await sweepDailyCandles(rt, { limit, concurrency });
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

/** "YYYY-MM-DD" → 다음 날(UTC 기준 산술, 타임존 무관). */
function nextDate(date: string): string {
    const dt = new Date(`${date}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
}

async function runCandidatesRange(
    rt: IngestRuntime,
    from?: string,
    to?: string,
    rankN?: string,
    ratePct?: string,
): Promise<void> {
    if (!from || !to) throw new Error("사용법: start candidates-range <from> <to> [거래대금순위N] [고가등락률컷%]");
    // 컷 인자를 주면 그걸로 측정(튜닝용). floor 는 비활성(순위∪등락률 만 순수 측정).
    const options =
        rankN || ratePct
            ? {
                  amountRankN: rankN ? Number(rankN) : 100,
                  highRateCutPercent: ratePct ? Number(ratePct) : 15,
                  amountFloorWon: "999999999999999",
              }
            : undefined;
    console.log(`▶ 프루닝 분포: ${from} ~ ${to}${options ? ` (탑${options.amountRankN} ∪ ≥${options.highRateCutPercent}%)` : ""}`);
    let days = 0;
    let totalCandidates = 0;
    let minC = Infinity;
    let maxC = 0;
    for (let d = from; d <= to; d = nextDate(d)) {
        const r = await rt.candidates.selectCandidatesForDate(d, options);
        if (r.scanned === 0) continue; // 비거래일 — 스킵
        days++;
        totalCandidates += r.candidates.length;
        minC = Math.min(minC, r.candidates.length);
        maxC = Math.max(maxC, r.candidates.length);
        const pct = ((r.candidates.length / r.scanned) * 100).toFixed(0);
        console.log(`  ${d}  스캔 ${r.scanned}  후보 ${r.candidates.length} (${pct}%)`);
    }
    if (days === 0) {
        console.log("  거래일 데이터 없음.");
        return;
    }
    console.log(`  ─ ${days}거래일: 평균 ${(totalCandidates / days).toFixed(0)}종목/일 (최소 ${minC}, 최대 ${maxC})`);
}

async function runSweepMinute(
    rt: IngestRuntime,
    date?: string,
    poolLimitArg?: string,
    concurrencyArg?: string,
): Promise<void> {
    if (!date) throw new Error("사용법: start sweep-minute <YYYY-MM-DD> [poolLimit] [concurrency]");
    const poolLimit = posInt(poolLimitArg, "poolLimit");
    const concurrency = posInt(concurrencyArg, "concurrency");
    console.log(`▶ 분봉 스윕: ${date}${poolLimit ? ` (pool limit ${poolLimit})` : ""}`);
    const r = await rt.minuteSweep.sweepMinutesForDate(date, {
        poolLimit,
        concurrency,
        onFetch: (done, total, code) => {
            if (done % 50 === 0 || done === total) console.log(`  [${done}/${total}] ${code}`);
        },
    });
    console.log(`  ✓ pool ${r.poolSize} → fetch ${r.fetched} → 저장 ${r.stored} (실패 ${r.failed.length})`);
    if (r.failed.length) console.log(`  실패: ${r.failed.slice(0, 20).map((f) => f.stockCode).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
}

async function runCollect(
    rt: IngestRuntime,
    date?: string,
    poolLimitArg?: string,
    concurrencyArg?: string,
): Promise<void> {
    if (!date) throw new Error("사용법: start collect <YYYY-MM-DD> [poolLimit] [concurrency]");
    if (!DATE_RE.test(date)) throw new Error(`잘못된 날짜(YYYY-MM-DD): ${date}`);
    if (date > seoulToday()) throw new Error(`미래 날짜는 수집 불가: ${date}`);
    console.log(`▶ 수집 파이프라인: ${date}`);
    await collectDate(rt, date, {
        poolLimit: posInt(poolLimitArg, "poolLimit"),
        concurrency: posInt(concurrencyArg, "concurrency"),
    });
}

function assertYearMonth(yearMonth: string | undefined, usage: string): string {
    if (!yearMonth) throw new Error(usage);
    if (!isValidYearMonth(yearMonth)) throw new Error(`잘못된 년월(YYYY-MM, 2000~2100): ${yearMonth}`);
    if (yearMonth > seoulToday().slice(0, 7)) throw new Error(`미래 년월은 수집 불가: ${yearMonth}`);
    return yearMonth;
}

async function runSweepMonth(
    rt: IngestRuntime,
    yearMonthArg?: string,
    poolLimitArg?: string,
    concurrencyArg?: string,
): Promise<void> {
    const yearMonth = assertYearMonth(yearMonthArg, "사용법: start sweep-month <YYYY-MM> [poolLimit] [concurrency]");
    const r = await sweepMinuteMonth(rt, yearMonth, {
        poolLimit: posInt(poolLimitArg, "poolLimit"),
        concurrency: posInt(concurrencyArg, "concurrency"),
    });
    console.log(`  ─ ${r.tradingDays}거래일, 총 저장 ${r.totalStored}종목·일`);
    if (r.tradingDays === 0) {
        console.log("  ⚠ 거래일 0 — 그 달 일봉이 DB에 없을 수 있음(collect-month 쓰거나 더 과거 월).");
    }
}

async function runCollectMonth(
    rt: IngestRuntime,
    yearMonthArg?: string,
    poolLimitArg?: string,
    concurrencyArg?: string,
): Promise<void> {
    const yearMonth = assertYearMonth(yearMonthArg, "사용법: start collect-month <YYYY-MM> [poolLimit] [concurrency]");
    console.log(`▶ 월 수집 파이프라인: ${yearMonth}`);
    const r = await collectMonth(rt, yearMonth, {
        poolLimit: posInt(poolLimitArg, "poolLimit"),
        concurrency: posInt(concurrencyArg, "concurrency"),
    });
    console.log(`  ─ ${r.tradingDays}거래일, 총 저장 ${r.totalStored}종목·일`);
    if (r.tradingDays === 0) {
        console.log("  ⚠ 거래일 0 — 그 달이 일봉 커버리지(약 1.5년) 밖일 수 있음.");
    }
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
    const [arg1, arg2, arg3, arg4, arg5] = process.argv.slice(2);
    if (!arg1) {
        console.error(
            "사용법:\n" +
                "  start universe\n" +
                "  start sweep-daily [limit]\n" +
                "  start candidates <YYYY-MM-DD>\n" +
                "  start candidates-range <from> <to>\n" +
                "  start sweep-minute <YYYY-MM-DD> [poolLimit]\n" +
                "  start sweep-month <YYYY-MM> [poolLimit] [concurrency]\n" +
                "  start collect <YYYY-MM-DD> [poolLimit] [concurrency]\n" +
                "  start collect-month <YYYY-MM> [poolLimit] [concurrency]\n" +
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
                await runSweepDaily(rt, arg2, arg3);
                break;
            case "candidates":
                await runCandidates(rt, arg2);
                break;
            case "candidates-range":
                await runCandidatesRange(rt, arg2, arg3, arg4, arg5);
                break;
            case "sweep-minute":
                await runSweepMinute(rt, arg2, arg3, arg4);
                break;
            case "sweep-month":
                await runSweepMonth(rt, arg2, arg3, arg4);
                break;
            case "collect":
                await runCollect(rt, arg2, arg3, arg4);
                break;
            case "collect-month":
                await runCollectMonth(rt, arg2, arg3, arg4);
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
