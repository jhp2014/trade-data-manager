// ingest CLI — 얇은 명령들. core 유스케이스는 영역별로 단일 목적이고, "무엇을 같이 돌릴지"는 여기서 조립한다.
//
//   backfill [일수=5] [--overwrite]              일상 한방: 최근 N일 캔들 + 당일 시총 + 뉴스 (영역별 격리)
//   backfill-candles <from> [to] [--overwrite]   일봉+분봉 (과거 시딩은 --overwrite)
//   backfill-daily <from> [to] [--overwrite]     일봉만(차트용 딥 히스토리)
//   backfill-marketcap <from> [to]               전종목 과거 시총(역산)
//   backfill-news <from> [to]                    시황 뉴스 헤드라인
//   backfill-ipo                                 최근 1년 상장 공모가 enrichment
//   marketcap                                    당일 시총만(ka10099)
// (overwrite = 일봉 강제 재수집 + 그 날짜 분봉 비우고 새로 — 없으면 skip-if-present)
import {
    seoulToday,
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

/** "YYYY-MM-DD" 에서 days 만큼 과거로(UTC 날짜 산술 — TZ 무관). */
function minusDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

/** 캔들(일봉+분봉) 백필. */
async function runBackfillCandles(rt: IngestRuntime, range: DateRange, overwrite: boolean): Promise<void> {
    console.log(`▶ 캔들 백필: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    printCollectResult(await rt.collector.backfill(range, collectOptions(overwrite)));
}

/** 일봉만 백필(분봉 없이) — 차트용 딥 히스토리 시딩. stockMaster 갱신 포함. */
async function runBackfillDaily(rt: IngestRuntime, range: DateRange, overwrite: boolean): Promise<void> {
    console.log(`▶ 일봉 백필: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    const r = await rt.collector.backfillDaily(range, collectOptions(overwrite));
    console.log(`  ✓ 유니버스 ${r.universeCount} · 일봉 ${r.dailyRefreshed ? "수집" : "생략"}`);
}

/** 전종목 과거 시총 백필(역산). */
async function runBackfillMarketCap(rt: IngestRuntime, range: DateRange): Promise<void> {
    console.log(`▶ 시총 백필: ${range.from} ~ ${range.to} (전종목 역산)`);
    const r = await rt.marketCapBackfiller.backfill(range, {
        onProgress: (p) => {
            if (p.done % 200 === 0 || p.done === p.total) console.log(`  [${p.done}/${p.total}]`);
        },
    });
    console.log(`  ✓ 종목 ${r.universe} · 저장 ${r.stored}행 · 실패 ${r.failed.length}`);
    if (r.failed.length) console.log(`    실패: ${r.failed.slice(0, 20).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
}

/** 시황 뉴스 헤드라인 백필. */
async function runBackfillNews(rt: IngestRuntime, range: DateRange): Promise<void> {
    console.log(`▶ 뉴스 백필: ${range.from} ~ ${range.to} (시황 피드 연속 워크)`);
    const r = await rt.newsBackfiller.backfill(range, {
        onProgress: (p) => {
            if (p.pages % 50 === 0) console.log(`  [page ${p.pages}] ~${p.anchorDate} · ${p.headlines}건`);
        },
    });
    console.log(`  ✓ 페이지 ${r.pages} · 헤드라인 ${r.headlines}건 저장`);
}

/** 당일 시총 입력(ka10099 라이브) — 그날 칸에 전일종가×현재주식수. */
async function runMarketCapRecord(rt: IngestRuntime, date: string): Promise<void> {
    console.log(`▶ 당일 시총: ${date} (전일종가×현재주식수)`);
    const r = await rt.marketCapRecorder.record(date);
    console.log(`  ✓ 유니버스 ${r.universe} · 저장 ${r.stored}종목`);
}

/** 공모가 enrichment — 최근 1년 상장 & ipoPrice 빈 종목만 채운다(steady-state 는 신규상장 소수). */
async function runBackfillIpo(rt: IngestRuntime): Promise<void> {
    console.log(`▶ 공모가 enrichment (최근 1년 상장 & null 만)`);
    const r = await rt.ipoPriceEnricher.enrichAll();
    console.log(`  ✓ 대상 ${r.needing} · 채움 ${r.filled} · 실패 ${r.failed.length}`);
    if (r.failed.length) console.log(`    실패: ${r.failed.slice(0, 20).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
}

/** 한 영역 실행을 격리 — 실패해도 나머지 영역은 진행(복기 데이터는 필수, 뉴스 등은 best-effort). */
async function runArea(label: string, fn: () => Promise<void>, failures: string[]): Promise<void> {
    try {
        await fn();
    } catch (err) {
        failures.push(label);
        console.error(`  ⚠ ${label} 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** 일상 백필(한 방) — 최근 N일 캔들 + 당일 시총 + 뉴스. skip-if-present 라 넉넉히 잡아도 안전(주말·중복 자연 처리). */
async function runDaily(rt: IngestRuntime, daysBack: number, overwrite: boolean): Promise<void> {
    const to = seoulToday();
    const range: DateRange = { from: minusDays(to, daysBack), to };
    console.log(`▶ 일상 백필: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    const failures: string[] = [];
    await runArea("캔들", () => runBackfillCandles(rt, range, overwrite), failures);
    await runArea("공모가", () => runBackfillIpo(rt), failures); // candles 가 stockMaster 갱신한 뒤 신규상장 null 채움
    await runArea("시총", () => runMarketCapRecord(rt, to), failures);
    await runArea("뉴스", () => runBackfillNews(rt, range), failures);
    if (failures.length) throw new Error(`일부 영역 실패: ${failures.join(", ")}`);
}

const USAGE =
    "사용법:\n" +
    "  backfill [일수=5] [--overwrite]              일상 한방: 최근 N일 캔들 + 당일 시총 + 뉴스 (skip-if-present)\n" +
    "  backfill-candles <from> [to] [--overwrite]   일봉+분봉 (to 생략=하루, 과거 시딩은 --overwrite)\n" +
    "  backfill-daily <from> [to] [--overwrite]     일봉만(분봉 없이) — 차트용 딥 히스토리\n" +
    "  backfill-marketcap <from> [to]               전종목 과거 시총 백필(역산)\n" +
    "  backfill-news <from> [to]                     시황 뉴스 헤드라인 백필(to 생략=오늘)\n" +
    "  backfill-ipo                                  최근 1년 상장 종목 공모가 enrichment(null만)\n" +
    "  marketcap                                    당일 시총만(오늘 칸, 전일종가×현재주식수)\n" +
    "  news-search <검색어...> [--from <시각>] [--to <시각>] [--limit N]\n" +
    "                                               텔레그램 등록 방 전체 검색(최신순). 검색어 여러 개=AND(종목+키워드).\n" +
    "                                               시각=YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM (예: --from 2026-06-25T09:00).";

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
            case "backfill": {
                // 일상 한방 — 최근 N일(기본 5, 주말 넉넉) 캔들+당일시총+뉴스. skip-if-present 라 재실행 안전.
                const days = posInt(a1, "일수") ?? 5;
                await runDaily(rt, days, overwrite);
                break;
            }
            case "backfill-candles": {
                if (!a1) throw new Error("사용법: backfill-candles <from> [to] [--overwrite]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runBackfillCandles(rt, { from: a1, to }, overwrite);
                break;
            }
            case "backfill-daily": {
                if (!a1) throw new Error("사용법: backfill-daily <from> [to] [--overwrite]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runBackfillDaily(rt, { from: a1, to }, overwrite);
                break;
            }
            case "backfill-marketcap": {
                if (!a1) throw new Error("사용법: backfill-marketcap <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runBackfillMarketCap(rt, { from: a1, to });
                break;
            }
            case "backfill-news": {
                if (!a1) throw new Error("사용법: backfill-news <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? seoulToday();
                assertDate(to, "to");
                await runBackfillNews(rt, { from: a1, to });
                break;
            }
            case "backfill-ipo": {
                await runBackfillIpo(rt);
                break;
            }
            case "marketcap": {
                // 당일 전용 — ka10099 라이브(전일종가×현재주식수). 과거/빠뜨린 날은 backfill-marketcap(역산).
                await runMarketCapRecord(rt, seoulToday());
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
