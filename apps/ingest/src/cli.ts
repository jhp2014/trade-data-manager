// ingest CLI — 얇은 명령들. core 유스케이스는 영역별로 단일 목적이고, "무엇을 같이 돌릴지"는 여기서 조립한다.
//
//   backfill [일수=5] [--overwrite]              일상 한방: 어제까지 N일 캔들·뉴스·일별속성 + 공모가 (오늘 제외·영역별 격리)
//   backfill-candles <from> [to] [--overwrite]   일봉+분봉 (과거 시딩은 --overwrite)
//   backfill-daily <from> [to]                   일봉만(딥 히스토리) — 받은 구간 그대로, to 생략=어제
//   backfill-minutes-toss <from> [to]            옛 분봉만(토스, 2025-07 앞) — 키가 개발 폴더에만 있어 거기서 돌린다
//   daily-stats <from> [to]                      일별 종목 속성(KRX): 시총·상장주식수·소속부
//   backfill-news <from> [to]                    시황 뉴스 헤드라인
//   backfill-ipo                                 최근 1년 상장 공모가 enrichment
//   telegram-sync [--dry-run]                    텔레그램 뉴스 방 아카이브 일일 수집(신규 + 48h 수정 재훑기)
//   telegram-backfill [since=2023-01-01] [--channel 낱말,...] [--dry-run]  과거 채움(저장된 최소 id 아래로 이어감, 중단 재개 가능)
// (overwrite = 일봉 강제 재수집 + 그 날짜 분봉 비우고 새로 — 없으면 skip-if-present)
import {
    seoulToday,
    type DateRange,
    type CollectOptions,
    type CollectResult,
    type NewsItem,
    type ChannelArchiveOptions,
    type ChannelArchiveResult,
    type ChannelMessage,
    type ChannelMessageStore,
} from "@trade-data-manager/market";
import { TOSS_BROKEN_MINUTE_DATES } from "@trade-data-manager/broker";
import { NEWS_CHANNELS, type TelegramChannel } from "@trade-data-manager/telegram";
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

/** 하루가 끝나는 시각(KST) — 넥스트레이드 애프터마켓 마감 20:00. 그 전엔 오늘 봉이 미완성이다. */
const DAY_CLOSE_HOUR_KST = 20;

/**
 * 캔들 수집 to 가 오늘이면 20:00(KST) 이후만 허용. 장중 오늘 봉은 미완성인데 원주가 일봉은 append-only 라
 * 한 번 쓰면 그 값으로 굳는다(07-03 사건). 수정주가 일봉·분봉도 그날 하루 미완성으로 남는다.
 */
function assertDayClosed(to: string): void {
    if (to !== seoulToday()) return;
    const hourKst = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
    if (hourKst < DAY_CLOSE_HOUR_KST) {
        throw new Error(`오늘(${to}) 봉은 ${DAY_CLOSE_HOUR_KST}:00(KST) 이후에만 수집 — 지금은 미완성. to 를 어제로 주거나 마감 후 실행`);
    }
}

/** `--name value` 의 value 를 꺼낸다(없거나 다음이 또 플래그면 undefined). */
function flagValue(raw: string[], name: string): string | undefined {
    const i = raw.indexOf(name);
    if (i === -1) return undefined;
    const v = raw[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
}

/**
 * `--channel 특징주,급등일보` → 등록 방 중 고른 것. 낱말마다 표시명 부분일치 또는 peer 일치로 정확히 한 방이어야 한다
 * (못 찾거나 여럿이면 throw — 엉뚱한 방을 몇 시간 내려가지 않게).
 */
function pickChannels(spec: string): TelegramChannel[] {
    const picked: TelegramChannel[] = [];
    for (const word of spec.split(",").map((w) => w.trim()).filter(Boolean)) {
        const hits = NEWS_CHANNELS.filter((c) => c.peer === word || c.label.includes(word));
        if (hits.length !== 1) {
            const why = hits.length === 0 ? "없음" : `여럿(${hits.map((c) => c.label).join(", ")})`;
            throw new Error(`--channel "${word}": 등록 방 ${why} — ${NEWS_CHANNELS.map((c) => c.label).join(", ")}`);
        }
        if (!picked.includes(hits[0])) picked.push(hits[0]);
    }
    if (picked.length === 0) throw new Error("--channel 값이 비었습니다");
    return picked;
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

/** 토스로 채운 구간의 끝(이 날까지는 --overwrite 금지). */
const OLDEST_KIWOOM_REPLACEABLE_BEFORE = "2025-06-30";

/** 캔들(일봉+분봉) 백필. */
async function runBackfillCandles(rt: IngestRuntime, range: DateRange, overwrite: boolean): Promise<void> {
    // overwrite 는 그날 분봉을 먼저 지우는데, 키움은 옛 날짜를 안 준다 — 토스로 넣은 분봉이 복구 없이 사라진다.
    if (overwrite && range.from <= OLDEST_KIWOOM_REPLACEABLE_BEFORE) {
        throw new Error(`--overwrite 불가: ${OLDEST_KIWOOM_REPLACEABLE_BEFORE} 이전 분봉은 키움으로 다시 받을 수 없다 — from 을 그 뒤로`);
    }
    console.log(`▶ 캔들 백필: ${range.from} ~ ${range.to}${overwrite ? " (overwrite)" : ""}`);
    printCollectResult(await rt.collector.backfill(range, collectOptions(overwrite)));
}

/** 일봉만 백필(분봉 없이) — [from,to] 그대로 전 종목 시딩. stockMaster 갱신 포함. 항상 받는다(덮어써도 해가 없다). */
async function runBackfillDaily(rt: IngestRuntime, range: DateRange): Promise<void> {
    console.log(`▶ 일봉 백필: ${range.from} ~ ${range.to}`);
    const r = await rt.collector.backfillDaily(range, collectOptions(false));
    console.log(`  ✓ 유니버스 ${r.universeCount} · 일봉 수집`);
}

/** 토스 1분봉 바닥(실측) ~ 키움 분봉 시작 전날. 이 뒤로 돌리면 키움이 넣은 KRX 칸이 null 로 덮인다. */
const TOSS_MINUTE_FROM = "2022-11-23";
const TOSS_MINUTE_UNTIL = "2025-06-30";
const TOSS_MINUTE_CONCURRENCY = 16; // 간격은 클라이언트가 지킨다 — 응답 대기로 놀지 않을 만큼만
const TOSS_ABORT_FAILURES = 5;

/** 옛 분봉 백필(토스). 재실행 = 빠진 종목만 이어받기. 상폐 종목은 토스에 없어 매번 실패로 세지만 정상이다. */
async function runBackfillMinutesToss(rt: IngestRuntime, range: DateRange): Promise<void> {
    if (range.from < TOSS_MINUTE_FROM || range.to > TOSS_MINUTE_UNTIL || range.from > range.to) {
        throw new Error(`토스 분봉 백필 범위는 ${TOSS_MINUTE_FROM} ~ ${TOSS_MINUTE_UNTIL} 안이어야 함: ${range.from} ~ ${range.to}`);
    }
    console.log(`▶ 분봉 백필(토스): ${range.from} ~ ${range.to}`);
    // 토스 거래량이 깨진 날은 빼고 앞뒤 구간만 돈다(어댑터도 그날을 거절하지만, 그러면 실패로 세져 중단 판정에 걸린다).
    const broken = [...TOSS_BROKEN_MINUTE_DATES].filter((d) => d >= range.from && d <= range.to).sort();
    if (broken.length) console.log(`  건너뜀(토스 분봉 거래량 깨짐): ${broken.join(", ")}`);
    let notFound = 0;
    let otherFailed = 0;
    let empty = 0;
    const r = { tradingDays: 0, skippedDays: 0, totalStored: 0 };
    for (const segment of rangesAround(range, broken)) {
        const part = await rt.tossMinuteCollector().collect(segment, {
            concurrency: TOSS_MINUTE_CONCURRENCY,
            onDayDone: (day) => {
                const other = day.failed.filter((f) => !f.error.includes("stock-not-found"));
                const dayEmpty = day.fetched - day.stored; // 받았는데 체결 봉이 없다 — 후보(200억·10%)면 그 자체로 이상 신호
                notFound += day.failed.length - other.length;
                otherFailed += other.length;
                empty += dayEmpty;
                console.log(
                    `  ${day.date} 대상 ${day.poolSize} · 저장 ${day.stored} · 빈 응답 ${dayEmpty} · 상폐 ${day.failed.length - other.length} · 실패 ${other.length}` +
                        (other.length ? ` — ${other.slice(0, 5).map((f) => f.stockCode).join(",")}: ${other[0].error}` : ""),
                );
                // 받은 게 없고 실패가 몰렸다 = 키·IP·장애 — 몇 시간 헛돌지 않게 멈춘다(재실행하면 이어받는다).
                // 상폐 수와 무관하게 판정하고, 재실행 때 재현성 실패 몇 개로는 멈추지 않는다.
                if (day.stored === 0 && other.length >= TOSS_ABORT_FAILURES) {
                    throw new Error(`${day.date} 저장 0 · 실패 ${other.length} — 중단: ${other[0].error}`);
                }
            },
        });
        r.tradingDays += part.tradingDays;
        r.skippedDays += part.skippedDays;
        r.totalStored += part.totalStored;
    }
    console.log(`  ✓ 받은 날 ${r.tradingDays} · 건너뜀 ${r.skippedDays} · 저장 ${r.totalStored}종목·일 · 빈 응답 ${empty} · 상폐 ${notFound} · 실패 ${otherFailed}`);
}

/** [from,to] 에서 뺄 날(오름차순)을 도려낸 구간들. */
function rangesAround(range: DateRange, excluded: string[]): DateRange[] {
    const shift = (date: string, days: number): string => {
        const t = new Date(`${date}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() + days);
        return t.toISOString().slice(0, 10);
    };
    const out: DateRange[] = [];
    let from = range.from;
    for (const d of excluded) {
        if (from < d) out.push({ from, to: shift(d, -1) });
        from = shift(d, 1);
    }
    if (from <= range.to) out.push({ from, to: range.to });
    return out;
}

/** 일별 종목 속성 수집(KRX) — 시총·상장주식수·소속부. 백필과 당일이 같은 진입점(범위 길이만 다름). */
async function runDailyStats(rt: IngestRuntime, range: DateRange): Promise<void> {
    console.log(`▶ 일별 종목 속성(KRX): ${range.from} ~ ${range.to}`);
    const r = await rt.dailyStatCollector.collect(range, {
        onProgress: (p) => {
            if (p.done % 20 === 0 || p.done === p.total) console.log(`  [${p.done}/${p.total}] ${p.date}`);
        },
    });
    console.log(`  ✓ 거래일 ${r.dates} · 저장 ${r.stored}행 · 실패 ${r.failed.length}`);
    // 누락은 정상 경로가 아니다 — 소스가 그날 거래한 종목을 빠뜨렸다는 뜻이라 0 이 아니면 드러나야 한다.
    if (r.gaps.inherited > 0) console.log(`  ⚠ 소스 누락 ${r.gaps.inherited}행 승계 (상장 마지막 날 — 직전 상장주식수 × 그날 종가)`);
    if (r.gaps.unresolved > 0) console.log(`  ⚠ 못 채운 구멍 ${r.gaps.unresolved}행 — 주식수가 바뀌었을 수 있어 안 채웠다(손으로 확인)`);
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

/** 공모가 enrichment — 최근 1년 상장 & ipoPrice 빈 종목만 채운다(steady-state 는 신규상장 소수). */
async function runBackfillIpo(rt: IngestRuntime): Promise<void> {
    console.log(`▶ 공모가 enrichment (최근 1년 상장 & null 만)`);
    const r = await rt.ipoPriceEnricher.enrichAll();
    console.log(`  ✓ 대상 ${r.needing} · 채움 ${r.filled} · 실패 ${r.failed.length}`);
    if (r.failed.length) console.log(`    실패: ${r.failed.slice(0, 20).join(", ")}${r.failed.length > 20 ? " …" : ""}`);
}

/**
 * dry-run 저장소 — DB 에 안 쓰고 받은 메시지를 모아 화면에 찍는다(개발 워크트리에서 배선·매핑 확인용).
 * 커서·범위는 비어 있는 것으로 답하므로 sync/backfill 다 "처음"처럼 돈다 — maxPagesPerChannel 로 1페이지만.
 */
class DryRunStore implements ChannelMessageStore {
    readonly received: ChannelMessage[] = [];
    async upsertChannel() {}
    async saveMessages(ms: ChannelMessage[]) {
        this.received.push(...ms);
    }
    async bounds() {
        return null;
    }
    async cursor() {
        return { syncedMaxId: null, syncedAt: null };
    }
    async markSynced() {}
}

function printArchiveResult(r: ChannelArchiveResult): void {
    for (const c of r.channels) {
        const tail = c.error ? `✗ ${c.error}` : `${c.completed ? "✓" : "…미완주"} 페이지 ${c.pages} · 저장 ${c.saved}`;
        const oldest = c.oldestAt ? ` · 최과거 ${seoulStamp(c.oldestAt)}` : "";
        console.log(`  [${c.label}] ${tail}${oldest}`);
    }
    const failed = r.channels.filter((c) => c.error).map((c) => c.label);
    if (failed.length) throw new Error(`방 실패: ${failed.join(", ")}`);
}

const archiveProgress: ChannelArchiveOptions["onProgress"] = (p) => {
    if (p.pages % 50 === 0) {
        console.log(`  [${p.label}] page ${p.pages} · ${p.saved}건${p.oldestAt ? ` · ~${seoulStamp(p.oldestAt)}` : ""}`);
    }
};

/** 텔레그램 방 아카이브 — sync(일일) / backfill(since). dry-run 이면 인메모리 저장소 + 방당 1페이지. */
async function runTelegramArchive(
    rt: IngestRuntime,
    mode: { kind: "sync" } | { kind: "backfill"; since: string; channels?: readonly TelegramChannel[] },
    dryRun: boolean,
): Promise<void> {
    const label =
        mode.kind === "sync" ? "텔레그램 아카이브 sync(신규 + 48h 재훑기)" : `텔레그램 아카이브 backfill ${mode.since}~`;
    const only = mode.kind === "backfill" && mode.channels ? ` [${mode.channels.map((c) => c.label).join(", ")}]` : "";
    console.log(`▶ ${label}${only}${dryRun ? " (dry-run: DB 안 씀, 방당 1페이지)" : ""}`);
    const store = dryRun ? new DryRunStore() : undefined;
    const collector = await rt.channelArchive(store, mode.kind === "backfill" ? mode.channels : undefined);
    const opts: ChannelArchiveOptions = { onProgress: archiveProgress, maxPagesPerChannel: dryRun ? 1 : undefined };
    const r =
        mode.kind === "sync" ? await collector.sync(opts) : await collector.backfill(seoulStart(mode.since), opts);
    if (store) {
        for (const m of store.received.slice(0, 5)) {
            const { raw, ...rest } = m;
            console.log(`  ${JSON.stringify({ ...rest, rawBytes: JSON.stringify(raw).length })}`);
        }
        console.log(`  (dry-run: 총 ${store.received.length}건 수신, 위는 앞 5건 · raw 생략)`);
    }
    printArchiveResult(r);
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

/**
 * 일상 백필(한 방) — 어제까지 최근 N일의 완성된 날만 캔들·뉴스·일별속성 + 공모가.
 * **오늘은 제외**한다: 장중이면 오늘 분봉이 미완성인데 skip-if-present 라 한 번 저장되면 박제돼버림.
 * 그래서 오늘 데이터는 내일 실행 때 완성본으로 딱 한 번 들어간다(언제 돌리든 타이밍 무관, robust).
 * skip-if-present + 넉넉한 창이라 놓친 날도 따라잡음. 일별속성(KRX)도 같은 범위 — 거래일은 일봉이 정한다.
 */
async function runDaily(rt: IngestRuntime, daysBack: number, overwrite: boolean): Promise<void> {
    const today = seoulToday();
    // 캔들·뉴스: 어제까지(오늘 미완성 제외). from 은 오늘 기준 N일 전.
    const range: DateRange = { from: minusDays(today, daysBack), to: minusDays(today, 1) };
    console.log(`▶ 일상 백필: ${range.from} ~ ${range.to} (오늘 ${today} 제외)${overwrite ? " (overwrite)" : ""}`);
    const failures: string[] = [];
    await runArea("캔들", () => runBackfillCandles(rt, range, overwrite), failures);
    await runArea("공모가", () => runBackfillIpo(rt), failures); // candles 가 stockMaster 갱신한 뒤 신규상장 null 채움
    await runArea("일별속성", () => runDailyStats(rt, range), failures); // KRX 날짜 fan-out — 거래일은 일봉이 정한다
    await runArea("뉴스", () => runBackfillNews(rt, range), failures); // 어제까지 — 하루치 온전하게
    if (failures.length) throw new Error(`일부 영역 실패: ${failures.join(", ")}`);
}

const USAGE =
    "사용법:\n" +
    "  backfill [일수=5] [--overwrite]              일상 한방: 어제까지 N일 캔들·뉴스·일별속성 + 공모가 (오늘 제외, skip-if-present)\n" +
    "  backfill-candles <from> [to] [--overwrite]   일봉+분봉 (to 생략=하루, 과거 시딩은 --overwrite)\n" +
    "  backfill-daily <from> [to]                   일봉만(분봉 없이) — 받은 구간 그대로 전 종목, to 생략=어제\n" +
    "  backfill-minutes-toss <from> [to]            옛 분봉만(토스, 2025-07 앞) — 일봉 후보 그대로, 재실행=이어받기(to 생략=하루)\n" +
    "  daily-stats <from> [to]                      일별 종목 속성(KRX) — 시총·상장주식수·소속부(to 생략=하루)\n" +
    "  backfill-news <from> [to]                     시황 뉴스 헤드라인 백필(to 생략=오늘)\n" +
    "  backfill-ipo                                  최근 1년 상장 종목 공모가 enrichment(null만)\n" +
    "  telegram-sync [--dry-run]                     텔레그램 뉴스 방 아카이브 일일 수집(신규 + 48h 수정 재훑기)\n" +
    "  telegram-backfill [since=2023-01-01] [--channel 낱말,...] [--dry-run]\n" +
    "                                               과거 채움 — 저장된 최소 id 아래로 이어감(중단 후 재실행 = 재개).\n" +
    "                                               --channel = 그 방만(표시명 부분일치·peer, 예: --channel \"특징주,급등일보\")\n" +
    "  news-search <검색어...> [--from <시각>] [--to <시각>] [--limit N]\n" +
    "                                               텔레그램 등록 방 전체 검색(최신순). 검색어 여러 개=AND(종목+키워드).\n" +
    "                                               시각=YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM (예: --from 2026-06-25T09:00).";

async function main(): Promise<void> {
    const raw = process.argv.slice(2);
    const overwrite = raw.includes("--overwrite");
    const dryRun = raw.includes("--dry-run");
    // 값을 받는 플래그의 값 토큰은 위치 인자가 아니다(news-search 는 제 플래그를 따로 거른다).
    const [cmd, a1, a2] = raw.filter((a, i) => !a.startsWith("--") && raw[i - 1] !== "--channel");
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
                assertDayClosed(to);
                await runBackfillCandles(rt, { from: a1, to }, overwrite);
                break;
            }
            case "backfill-daily": {
                if (!a1) throw new Error("사용법: backfill-daily <from> [to]");
                assertDate(a1, "from");
                // to 생략 = 어제(오늘 미완성 제외 — runDaily 와 같은 경계). 수정주가 받기 기준일은 to 와 무관하게 늘 오늘.
                const to = a2 ?? minusDays(seoulToday(), 1);
                assertDate(to, "to");
                assertDayClosed(to);
                if (a1 > to) throw new Error(`from(${a1}) 이 to(${to}) 보다 뒤 — 오늘 봉은 다음 일상 수집이 받는다`);
                if (overwrite) console.log("  (backfill-daily 는 항상 받는다 — --overwrite 무시)");
                await runBackfillDaily(rt, { from: a1, to });
                break;
            }
            case "backfill-minutes-toss": {
                if (!a1) throw new Error("사용법: backfill-minutes-toss <from> [to]");
                if (overwrite) throw new Error("backfill-minutes-toss 는 --overwrite 를 받지 않는다 — 재실행이 곧 이어받기");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runBackfillMinutesToss(rt, { from: a1, to });
                break;
            }
            case "daily-stats": {
                if (!a1) throw new Error("사용법: daily-stats <from> [to]");
                assertDate(a1, "from");
                const to = a2 ?? a1;
                assertDate(to, "to");
                await runDailyStats(rt, { from: a1, to });
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
            case "telegram-sync": {
                await runTelegramArchive(rt, { kind: "sync" }, dryRun);
                break;
            }
            case "telegram-backfill": {
                const since = a1 ?? "2023-01-01";
                assertDate(since, "since");
                // 오입력은 조용히 넘기지 않는다 — 모르는 플래그(--channel= · --channels 오타)면 9방 전부, 남는 위치 인자
                // (PowerShell 이 따옴표 없는 a,b 를 인자 둘로 쪼갬)면 앞 방만 몇 시간 내려간다.
                const unknown = raw.filter((a) => a.startsWith("--") && a !== "--channel" && a !== "--dry-run");
                if (unknown.length) throw new Error(`telegram-backfill: 모르는 플래그 ${unknown.join(" ")}`);
                if (a2 !== undefined) throw new Error(`telegram-backfill: 남는 인자 "${a2}" — 방 여럿은 따옴표로: --channel "특징주,급등일보"`);
                const spec = flagValue(raw, "--channel");
                if (raw.includes("--channel") && !spec) throw new Error('--channel 뒤에 방 낱말이 필요합니다(예: --channel "특징주,급등일보")');
                const channels = spec ? pickChannels(spec) : undefined;
                await runTelegramArchive(rt, { kind: "backfill", since, channels }, dryRun);
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
