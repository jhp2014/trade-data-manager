// ingest CLI — 얇은 옵션 명령들이 두 inbound 유스케이스(collect/preview) 위에 앉는다.
//
//   collect <from> [to] [--overwrite]   범위 수집(to 생략=하루)
//   today [--overwrite]                  오늘
//   month <YYYY-MM> [--overwrite]        그 달 전체
//   backfill [개월=12] [--overwrite]     현재부터 N개월 과거까지 전체
// (overwrite = 그 날짜 분봉을 비우고 새로 — orphan 방지)
import {
    seoulToday,
    isValidYearMonth,
    enumerateMonthDates,
    subtractMonths,
    type DateRange,
} from "@trade-data-manager/market";
import { createIngestRuntime, type IngestRuntime } from "./composition.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function posInt(arg: string | undefined, label: string): number | undefined {
    if (!arg) return undefined;
    const n = Number(arg);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} 은 양의 정수여야 함: ${arg}`);
    return n;
}

function assertDate(d: string, label: string): void {
    if (!DATE_RE.test(d)) throw new Error(`잘못된 ${label}(YYYY-MM-DD): ${d}`);
    if (d > seoulToday()) throw new Error(`미래 날짜는 수집 불가: ${d}`);
}

async function runCollect(rt: IngestRuntime, range: DateRange, overwrite: boolean): Promise<void> {
    console.log(`▶ 수집: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    const r = await rt.collector.collect(range, {
        overwrite,
        onProgress: (e) => {
            if (e.phase === "universe") console.log("  유니버스 갱신…");
            else if (e.phase === "daily" && (e.done! % 500 === 0 || e.done === e.total)) {
                console.log(`  일봉 [${e.done}/${e.total}]`);
            } else if (e.phase === "minute" && e.done === e.total) {
                console.log(`  분봉 ${e.date} (${e.total} fetch)`);
            }
        },
    });
    console.log(
        `  ✓ 유니버스 ${r.universeCount} · 일봉 ${r.dailyRefreshed ? "수집" : "생략"} · ` +
            `거래일 ${r.tradingDays} · 건너뜀 ${r.skippedDays} · 저장 ${r.totalStored}종목·일`,
    );
}

const USAGE =
    "사용법:\n" +
    "  collect <from> [to] [--overwrite]\n" +
    "  today [--overwrite]\n" +
    "  month <YYYY-MM> [--overwrite]\n" +
    "  backfill [개월=12] [--overwrite]\n" +
    "  marketcap [YYYY-MM-DD=오늘]      당일 시총 입력(전일종가×현재주식수)";

async function main(): Promise<void> {
    const raw = process.argv.slice(2);
    const overwrite = raw.includes("--overwrite");
    const [cmd, a1, a2] = raw.filter((a) => !a.startsWith("--"));
    if (!cmd) {
        console.error(USAGE);
        process.exit(1);
    }

    const rt = createIngestRuntime();
    try {
        switch (cmd) {
            case "collect": {
                if (!a1) throw new Error("사용법: collect <from> [to] [--overwrite]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runCollect(rt, { from: a1, to }, overwrite);
                break;
            }
            case "today": {
                const t = seoulToday();
                await runCollect(rt, { from: t, to: t }, overwrite);
                break;
            }
            case "month": {
                if (!a1 || !isValidYearMonth(a1)) throw new Error(`잘못된 년월(YYYY-MM, 2000~2100): ${a1}`);
                if (a1 > seoulToday().slice(0, 7)) throw new Error(`미래 년월은 수집 불가: ${a1}`);
                const dates = enumerateMonthDates(a1);
                await runCollect(rt, { from: dates[0], to: dates[dates.length - 1] }, overwrite);
                break;
            }
            case "backfill": {
                const months = posInt(a1, "개월") ?? 12;
                const to = seoulToday();
                await runCollect(rt, { from: subtractMonths(to, months), to }, overwrite);
                break;
            }
            case "marketcap": {
                const date = a1 ?? seoulToday();
                assertDate(date, "date");
                console.log(`▶ 당일 시총 입력: ${date} (전일종가×현재주식수)`);
                const r = await rt.marketCapRecorder.record(date);
                console.log(`  ✓ 유니버스 ${r.universe} · 저장 ${r.stored}종목`);
                break;
            }
            default:
                console.error(`알 수 없는 명령: ${cmd}\n${USAGE}`);
                process.exitCode = 1;
                return;
        }
        console.log("✅ 완료");
    } catch (err) {
        console.error("\n❌ 실패");
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
        process.exitCode = 1;
    } finally {
        await rt.close();
    }
}

void main();
