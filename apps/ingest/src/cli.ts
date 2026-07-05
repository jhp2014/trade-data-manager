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
    type CollectOptions,
    type CollectResult,
    type NewsItem,
} from "@trade-data-manager/market";
import { createIngestRuntime, type IngestRuntime } from "./composition.js";

/** 절대시간 → "MM-DD HH:MM"(Asia/Seoul). 검색결과 표시용. */
function seoulStamp(at: Date): string {
    const parts = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 검색 결과를 최신순으로 출력(본문 대표 줄 + 링크 별도). */
function printNews(items: NewsItem[]): void {
    for (const it of items) {
        // 본문 = URL만인 줄은 건너뛴 첫 텍스트 줄(메시지가 링크로 시작해도 제목이 보이게).
        const headline =
            it.text
                .split("\n")
                .map((l) => l.trim())
                .find((l) => l.length > 0 && !/^https?:\/\/\S+$/.test(l)) ?? "(링크)";
        console.log(`\n[${it.channel}] ${seoulStamp(it.at)}`);
        console.log(`  ${headline.slice(0, 120)}`);
        if (it.url) console.log(`  🔗 ${it.url}`);
    }
}

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

/** `--name value` 의 value 를 꺼낸다(없거나 다음이 또 플래그면 undefined). */
function flagValue(raw: string[], name: string): string | undefined {
    const i = raw.indexOf(name);
    if (i === -1) return undefined;
    const v = raw[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
}

/** "YYYY-MM-DD" → 그 날 Asia/Seoul 자정/끝(절대시간 Date). */
const seoulStart = (d: string): Date => new Date(`${d}T00:00:00+09:00`);
const seoulEnd = (d: string): Date => new Date(`${d}T23:59:59+09:00`);

/**
 * 검색 시간경계 파싱(Asia/Seoul). "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:MM[:SS]"(공백 대신 T — 따옴표 불필요).
 * 날짜만이면 kind 에 따라 그 날 시작/끝. 시각 포함이면 그 정확한 순간.
 */
function parseSeoulBound(s: string, kind: "from" | "to", label: string): Date {
    const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (!m) throw new Error(`잘못된 ${label}(YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM): ${s}`);
    const [, date, hh, mm, ss] = m;
    if (date > seoulToday()) throw new Error(`미래 날짜는 불가: ${date}`);
    if (hh === undefined) return kind === "from" ? seoulStart(date) : seoulEnd(date);
    return new Date(`${date}T${hh}:${mm}:${ss ?? "00"}+09:00`);
}

function collectOptions(overwrite: boolean): CollectOptions {
    return {
        overwrite,
        onProgress: (e) => {
            if (e.phase === "daily" && (e.done! % 500 === 0 || e.done === e.total)) {
                console.log(`  일봉 [${e.done}/${e.total}]`);
            } else if (e.phase === "minute" && e.done === e.total) {
                console.log(`  분봉 ${e.date} (${e.total} fetch)`);
            }
        },
    };
}

function printCollectResult(r: CollectResult): void {
    console.log(
        `  ✓ 유니버스 ${r.universeCount} · 일봉 ${r.dailyRefreshed ? "수집" : "생략"} · ` +
            `거래일 ${r.tradingDays} · 건너뜀 ${r.skippedDays} · 저장 ${r.totalStored}종목·일`,
    );
}

/** collect: 최신 거래일(오늘) — 일봉 최근2년 유지 + 오늘 분봉. */
async function runCollectToday(rt: IngestRuntime, overwrite: boolean): Promise<void> {
    console.log(`▶ 오늘 수집${overwrite ? " (overwrite)" : ""}`);
    printCollectResult(await rt.collector.collectToday(collectOptions(overwrite)));
}

/** backfill: 과거 구간 — 일봉 깊이 시딩 + 구간 분봉. */
async function runBackfill(rt: IngestRuntime, range: DateRange, overwrite: boolean): Promise<void> {
    console.log(`▶ 백필: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    printCollectResult(await rt.collector.backfill(range, collectOptions(overwrite)));
}

const USAGE =
    "사용법:\n" +
    "  collect <from> [to] [--overwrite]\n" +
    "  today [--overwrite]\n" +
    "  month <YYYY-MM> [--overwrite]\n" +
    "  backfill [개월=12] [--overwrite]\n" +
    "  marketcap                        당일 시총 입력(오늘 칸, 전일종가×현재주식수)\n" +
    "  marketcap-backfill <from> [to]   전종목 과거 시총 백필(역산)\n" +
    "  raw-daily <from> [to]            전종목 원주가(미수정) 일봉 백필(append-only, daily_candles_raw)\n" +
    "  news <from> [to]                 시황 뉴스 헤드라인 백필(to 생략=오늘)\n" +
    "  news-search <검색어...> [--from <시각>] [--to <시각>] [--limit N]\n" +
    "                                   텔레그램 등록 방 전체 검색(최신순). 검색어 여러 개=AND(종목+키워드).\n" +
    "                                   시각=YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM (예: --from 2026-06-25T09:00).";

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
                await runBackfill(rt, { from: a1, to }, overwrite);
                break;
            }
            case "today": {
                await runCollectToday(rt, overwrite);
                break;
            }
            case "month": {
                if (!a1 || !isValidYearMonth(a1)) throw new Error(`잘못된 년월(YYYY-MM, 2000~2100): ${a1}`);
                if (a1 > seoulToday().slice(0, 7)) throw new Error(`미래 년월은 수집 불가: ${a1}`);
                const dates = enumerateMonthDates(a1);
                await runBackfill(rt, { from: dates[0], to: dates[dates.length - 1] }, overwrite);
                break;
            }
            case "backfill": {
                const months = posInt(a1, "개월") ?? 12;
                const to = seoulToday();
                await runBackfill(rt, { from: subtractMonths(to, months), to }, overwrite);
                break;
            }
            case "marketcap": {
                // 당일 전용 — ka10099 라이브 스냅샷은 "지금"의 전일종가만 주므로 오늘 칸에만 유효.
                // 과거/빠뜨린 날은 marketcap-backfill(역산)로 채운다.
                const date = seoulToday();
                console.log(`▶ 당일 시총 입력: ${date} (전일종가×현재주식수)`);
                const r = await rt.marketCapRecorder.record(date);
                console.log(`  ✓ 유니버스 ${r.universe} · 저장 ${r.stored}종목`);
                break;
            }
            case "marketcap-backfill": {
                if (!a1) throw new Error("사용법: marketcap-backfill <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                console.log(`▶ 시총 백필: ${a1} ~ ${to} (전종목 역산)`);
                const r = await rt.marketCapBackfiller.backfill(
                    { from: a1, to },
                    {
                        onProgress: (p) => {
                            if (p.done % 200 === 0 || p.done === p.total) console.log(`  [${p.done}/${p.total}]`);
                        },
                    },
                );
                console.log(`  ✓ 종목 ${r.universe} · 저장 ${r.stored}행 · 실패 ${r.failed.length}`);
                if (r.failed.length) {
                    console.log(`    실패: ${r.failed.slice(0, 20).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
                }
                break;
            }
            case "raw-daily": {
                if (!a1) throw new Error("사용법: raw-daily <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? seoulToday();
                assertDate(to, "to");
                console.log(`▶ 원주가 일봉 백필: ${a1} ~ ${to} (전종목, append-only)`);
                const r = await rt.rawDailyBackfiller.backfill(
                    { from: a1, to },
                    {
                        onProgress: (done, total) => {
                            if (done % 200 === 0 || done === total) console.log(`  [${done}/${total}]`);
                        },
                    },
                );
                console.log(`  ✓ 종목 ${r.universe} · 수집 ${r.fetched} · 실패 ${r.failed.length}`);
                if (r.failed.length) {
                    console.log(`    실패: ${r.failed.slice(0, 20).map((f) => f.stockCode).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
                }
                break;
            }
            case "news": {
                if (!a1) throw new Error("사용법: news <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? seoulToday();
                assertDate(to, "to");
                console.log(`▶ 뉴스 백필: ${a1} ~ ${to} (시황 피드 연속 워크)`);
                const r = await rt.newsBackfiller.backfill(
                    { from: a1, to },
                    {
                        onProgress: (p) => {
                            if (p.pages % 50 === 0) console.log(`  [page ${p.pages}] ~${p.anchorDate} · ${p.headlines}건`);
                        },
                    },
                );
                console.log(`  ✓ 페이지 ${r.pages} · 헤드라인 ${r.headlines}건 저장`);
                break;
            }
            case "news-search": {
                // cmd 이후 토큰 중 플래그(--x)와 그 값을 뺀 나머지 = 검색어
                // (여러 단어면 Telegram 이 AND → 종목+키워드 동시검색).
                const valueFlags = new Set(["--from", "--to", "--limit"]);
                const terms: string[] = [];
                for (let i = 1; i < raw.length; i++) {
                    const t = raw[i];
                    if (t.startsWith("--")) {
                        if (valueFlags.has(t)) i++; // 그 플래그의 값 토큰도 건너뜀
                        continue;
                    }
                    terms.push(t);
                }
                const query = terms.join(" ").trim();
                if (!query) {
                    throw new Error(
                        "사용법: news-search <검색어...> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N]",
                    );
                }
                const from = flagValue(raw, "--from");
                const to = flagValue(raw, "--to");
                const since = from ? parseSeoulBound(from, "from", "from") : undefined;
                const until = to ? parseSeoulBound(to, "to", "to") : undefined;
                const limitPerChannel = posInt(flagValue(raw, "--limit"), "limit") ?? 50;
                const period = from || to ? ` · 기간 ${from ?? "~"}~${to ?? "~"}` : "";
                console.log(`▶ 텔레그램 뉴스 검색: "${query}" (방당 최대 ${limitPerChannel}건${period})`);

                const searcher = await rt.newsSearcher();
                const items = await searcher.search(query, { since, until, limitPerChannel });
                printNews(items);
                console.log(`\n  ✓ 총 ${items.length}건`);
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
