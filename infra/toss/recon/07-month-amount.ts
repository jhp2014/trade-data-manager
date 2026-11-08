// 정찰 7: 분봉 거래대금이 키움과 같은가 — 겹치는 달(기본 2025-07, 키움 분봉의 첫 달) 저장 종목-날 전부를 토스 원주가 분봉과 맞춘다.
// 대금은 저장하지 않고 읽을 때 만든다(core computeMinuteTradingAmount = ⌊(시+고+저+종)/4⌋ × 거래량) — 같은 식으로 양쪽을 계산해 봉·하루·순위 단위로 잰다.
// 05 와 다른 점: 표본 2×2 가 아니라 한 달 전부, 시각은 05 의 -1분 시험이 아니라 적재 어댑터와 같은 규칙(봉 끝 → 시작, 동시호가 봉은 마감 시각)으로 환산.
// 우리 쪽은 lab-api(읽기 전용) — 종목 목록 = /day-flow 의 universe, 봉 = /minutes(통합 칸, 거래량 0 채움 봉 제외). 먼저 개발 lab-api(3310)를 띄울 것.
//
// 실측(2026-11-08, 2025-07 전부 5,946 종목-날, 19분): 토스 404 28건(012510 등 5종목).
// · 지금도 NXT 거나 원래 KRX 만인 종목(5,148) — 하루 대금 합 −0.03%, 겹친 봉 277.8만 개 중 99.91% 다섯 칸 일치, 그날 순위 바뀜 80 · 30위 안 4 · 200억 경계 1.
//   차이 = ① 15:35 KRX 시간외 봉: NXT 종목은 토스에 아예 없고(대금 0.04%), 비 NXT 종목은 토스가 15:30 마감 봉에 합쳐 준다(1,505 종목-날, 하루 합은 같음)
//   ② 시가·종가 한 호가 차이 922칸(거래량 같음) ③ 장중 거래량 차이 55봉(전부 우리가 많음, 합 161억).
// · 그때 NXT 였는데 지금 빠진 종목(166종목 770 종목-날, 그달 대금의 11%) — 토스가 KRX 체결만 줘서 하루 대금 −51%(중앙 −49%). 2025-03~06 적재분의 「276종목」 한계와 같은 원인.
// 종목-날마다 한 줄씩 jsonl 에 이어 쓴다 — 끊겨도 다시 돌리면 끝난 것은 건너뛴다(처음부터 다시 재려면 파일을 지운다).
// 사용: pnpm --filter @trade-data-manager/toss exec tsx recon/07-month-amount.ts [from] [to] [종목 상한/일] [lab-api 주소]
import fs from "node:fs";
import path from "node:path";
import { TossError } from "../src/index.js";
import { handleError, makeToss, minutesOf, num, OUTPUT_DIR, saveJson, type DayBar } from "./_shared.js";

interface LabBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}
interface LabMinute {
    time: string;
    krx: LabBar | null;
    un: LabBar;
}
interface Ohlcv {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
}

const from = process.argv[2] ?? "2025-07-01";
const to = process.argv[3] ?? "2025-07-31";
const perDayLimit = process.argv[4] ? Number(process.argv[4]) : Infinity;
const base = process.argv[5] ?? "http://127.0.0.1:3310";
const CONCURRENCY = 4; // 토스 클라이언트가 요청 간격을 직렬로 지키므로 이건 lab-api·대기 겹치기용
const BAR_SAMPLE_CAP = 40;

const LATE_CLOSE_DATES = new Set(["2023-11-16", "2024-11-14", "2025-11-13"]);
const REGULAR_OPEN = 9 * 60;

const fmt = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
/** core computeMinuteTradingAmount 와 같은 식(평균가 내림). 봉 하나는 Number 로 충분하다(≪ 2^53). */
const amountOf = (b: Ohlcv): number => Math.floor((b.o + b.h + b.l + b.c) / 4) * b.v;
const ohlcvOf = (b: LabBar): Ohlcv => ({ o: num(b.open), h: num(b.high), l: num(b.low), c: num(b.close), v: num(b.volume) });
const tossOhlcv = (b: DayBar): Ohlcv => ({
    o: num(b.openPrice),
    h: num(b.highPrice),
    l: num(b.lowPrice),
    c: num(b.closePrice),
    v: num(b.volume),
});
const same = (a: Ohlcv, b: Ohlcv): boolean => a.o === b.o && a.h === b.h && a.l === b.l && a.c === b.c && a.v === b.v;

/** 적재 어댑터(broker tossMinuteAdapter)와 같은 환산 — 봉 끝 → 봉 시작, 동시호가 봉(마감·마감+1분)은 마감 시각. */
function startOf(endTime: string, closeMin: number): string {
    const end = minutesOf(endTime);
    return end === closeMin || end === closeMin + 1 ? fmt(closeMin) : fmt(end - 1);
}

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lab-api ${res.status} ${url}`);
    return (await res.json()) as T;
}

/** 시각 구분 — 정규장(09:00~마감) 안/밖. 밖은 우리 KRX 칸에 체결이 있으면 KRX 시간외(krxAfter), 없으면 NXT(nxt). 토스 쪽은 KRX 칸이 없어 outside. */
const isRegular = (time: string, closeMin: number): boolean => {
    const m = minutesOf(time);
    return m >= REGULAR_OPEN && m <= closeMin;
};

interface Row {
    code: string;
    date: string;
    error?: unknown;
    ourBars: number;
    tossBars: number;
    joined: number;
    joinedSame: number;
    joinedAmountSame: number;
    joinedAbsDiff: number;
    ourAmount: number;
    tossAmount: number;
    /** 우리만 있는 봉의 대금 — 시각 구분별. */
    oursOnly: Record<string, { bars: number; amount: number; times: string[] }>;
    tossOnly: Record<string, { bars: number; amount: number; times: string[] }>;
    /** 같은 시각인데 값이 다른 봉(대금 차이 큰 순 몇 개). */
    diffs: { time: string; ours: Ohlcv; toss: Ohlcv; dAmount: number }[];
}

const bucket = () => ({ bars: 0, amount: 0, times: [] as string[] });

async function compareOne(toss: ReturnType<typeof makeToss>, code: string, date: string): Promise<Row> {
    const closeMin = minutesOf(LATE_CLOSE_DATES.has(date) ? "16:30:00" : "15:30:00");
    const body = await getJson<{ minutes: LabMinute[] }>(`${base}/minutes?code=${code}&date=${date}`);
    const ours = new Map<string, Ohlcv>();
    const krxTraded = new Set<string>();
    for (const m of body.minutes) {
        if (num(m.un.volume) <= 0) continue;
        ours.set(m.time, ohlcvOf(m.un));
        if (m.krx && num(m.krx.volume) > 0) krxTraded.add(m.time);
    }

    const row: Row = {
        code,
        date,
        ourBars: ours.size,
        tossBars: 0,
        joined: 0,
        joinedSame: 0,
        joinedAmountSame: 0,
        joinedAbsDiff: 0,
        ourAmount: 0,
        tossAmount: 0,
        oursOnly: {},
        tossOnly: {},
        diffs: [],
    };
    for (const b of ours.values()) row.ourAmount += amountOf(b);

    let candles: DayBar[];
    try {
        candles = (await toss.rest.getMinuteCandlesForDate(code, date, { adjusted: false })).candles;
    } catch (err) {
        if (err instanceof TossError) return { ...row, error: err.meta ?? err.message };
        throw err;
    }
    const theirs = new Map<string, Ohlcv>();
    for (const c of candles) {
        if (num(c.volume) <= 0) continue; // 채움 봉
        const t = startOf(c.kstTime, closeMin);
        if (theirs.has(t)) throw new Error(`${code} ${date}: 같은 시각 ${t} 에 체결 봉이 둘`);
        theirs.set(t, tossOhlcv(c));
    }
    row.tossBars = theirs.size;
    for (const b of theirs.values()) row.tossAmount += amountOf(b);

    for (const [t, o] of ours) {
        const th = theirs.get(t);
        if (!th) {
            const zone = isRegular(t, closeMin) ? "regular" : krxTraded.has(t) ? "krxAfter" : "nxt";
            const z = (row.oursOnly[zone] ??= bucket());
            z.bars++;
            z.amount += amountOf(o);
            if (z.times.length < 12) z.times.push(t);
            continue;
        }
        row.joined++;
        const d = amountOf(th) - amountOf(o);
        if (same(o, th)) row.joinedSame++;
        if (d === 0) row.joinedAmountSame++;
        else {
            row.joinedAbsDiff += Math.abs(d);
            row.diffs.push({ time: t, ours: o, toss: th, dAmount: d });
        }
    }
    for (const [t, th] of theirs) {
        if (ours.has(t)) continue;
        const z = (row.tossOnly[isRegular(t, closeMin) ? "regular" : "outside"] ??= bucket());
        z.bars++;
        z.amount += amountOf(th);
        if (z.times.length < 12) z.times.push(t);
    }
    row.diffs.sort((a, b) => Math.abs(b.dAmount) - Math.abs(a.dAmount));
    row.diffs = row.diffs.slice(0, 5);
    return row;
}

async function pool<T>(items: T[], n: number, run: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(n, items.length) }, async () => {
            while (i < items.length) await run(items[i++]!);
        }),
    );
}

// ── 요약 ─────────────────────────────────────────────────────────────
const RATIO_EDGES = [0, 0.0001, 0.001, 0.01, 0.05] as const; // 0 · <0.01% · <0.1% · <1% · <5% · ≥5%
function ratioBucket(r: number): string {
    if (r === 0) return "0";
    for (let k = 1; k < RATIO_EDGES.length; k++) if (r < RATIO_EDGES[k]!) return `<${RATIO_EDGES[k]! * 100}%`;
    return "≥5%";
}
const tally = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
const ONE_EOK = 1e8;

function summarize(rows: Row[]) {
    const ok = rows.filter((r) => r.error === undefined);
    const errors = rows.filter((r) => r.error !== undefined).map((r) => ({ code: r.code, date: r.date, error: r.error }));

    const dayDiff: Record<string, number> = {};
    const dayDiffNoAfter: Record<string, number> = {}; // 우리만 있는 KRX 시간외 봉을 빼고 재면
    const oursOnly: Record<string, { stockDays: number; bars: number; amount: number }> = {};
    const tossOnly: Record<string, { stockDays: number; bars: number; amount: number }> = {};
    const timesOursOnly: Record<string, number> = {};
    const timesTossOnly: Record<string, number> = {};
    let ourTotal = 0;
    let tossTotal = 0;
    let joined = 0;
    let joinedSame = 0;
    let joinedAmountSame = 0;
    let joinedAbsDiff = 0;
    const barDiffs: (Row["diffs"][number] & { code: string; date: string })[] = [];
    // 하루 대금 차이의 원인 — exact(같음) · krxAfterOnly(우리 15:35 류 KRX 시간외 봉만 토스에 없음) · nxtLost(우리 NXT 봉이 토스에 없음 = 지금 NXT 아닌 종목) · other
    const causes: Record<string, number> = {};
    const nxtLostCodes = new Set<string>();
    const bigGaps: unknown[] = [];

    for (const r of ok) {
        ourTotal += r.ourAmount;
        tossTotal += r.tossAmount;
        joined += r.joined;
        joinedSame += r.joinedSame;
        joinedAmountSame += r.joinedAmountSame;
        joinedAbsDiff += r.joinedAbsDiff;
        const after = r.oursOnly.krxAfter?.amount ?? 0;
        tally(dayDiff, ratioBucket(r.ourAmount ? Math.abs(r.tossAmount - r.ourAmount) / r.ourAmount : 0));
        const oursNoAfter = r.ourAmount - after;
        tally(dayDiffNoAfter, ratioBucket(oursNoAfter ? Math.abs(r.tossAmount - oursNoAfter) / oursNoAfter : 0));
        for (const [z, b] of Object.entries(r.oursOnly)) {
            const s = (oursOnly[z] ??= { stockDays: 0, bars: 0, amount: 0 });
            s.stockDays++;
            s.bars += b.bars;
            s.amount += b.amount;
            for (const t of b.times) tally(timesOursOnly, t);
        }
        for (const [z, b] of Object.entries(r.tossOnly)) {
            const s = (tossOnly[z] ??= { stockDays: 0, bars: 0, amount: 0 });
            s.stockDays++;
            s.bars += b.bars;
            s.amount += b.amount;
            for (const t of b.times) tally(timesTossOnly, t);
        }
        for (const d of r.diffs) barDiffs.push({ code: r.code, date: r.date, ...d });
        const cause =
            r.tossAmount === r.ourAmount
                ? "exact"
                : r.tossAmount === oursNoAfter
                  ? "krxAfterOnly"
                  : (r.oursOnly.nxt?.bars ?? 0) >= 10
                    ? "nxtLost"
                    : "other";
        tally(causes, cause);
        if (cause === "nxtLost") nxtLostCodes.add(r.code);
        const gap = oursNoAfter ? (r.tossAmount - oursNoAfter) / oursNoAfter : 0;
        if (Math.abs(gap) >= 0.01)
            bigGaps.push({
                code: r.code,
                date: r.date,
                ourEok: +(r.ourAmount / ONE_EOK).toFixed(1),
                tossEok: +(r.tossAmount / ONE_EOK).toFixed(1),
                gapExclAfter: +(gap * 100).toFixed(2),
                oursOnly: Object.fromEntries(Object.entries(r.oursOnly).map(([z, b]) => [z, b.bars])),
                tossOnly: Object.fromEntries(Object.entries(r.tossOnly).map(([z, b]) => [z, b.bars])),
            });
    }
    barDiffs.sort((a, b) => Math.abs(b.dAmount) - Math.abs(a.dAmount));

    // 순위 — 그날 universe 안에서 하루 대금 순위가 바뀌는가(대금 순위가 분류의 재료라)
    const byDate = new Map<string, Row[]>();
    for (const r of ok) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
    let rankChanged = 0;
    let top30Changed = 0;
    let crossed200 = 0;
    for (const day of byDate.values()) {
        const rankOf = (key: (r: Row) => number) =>
            new Map([...day].sort((a, b) => key(b) - key(a)).map((r, i) => [r.code, i + 1]));
        const ro = rankOf((r) => r.ourAmount);
        const rt = rankOf((r) => r.tossAmount);
        for (const r of day) {
            const a = ro.get(r.code)!;
            const b = rt.get(r.code)!;
            if (a !== b) {
                rankChanged++;
                if (Math.min(a, b) <= 30) top30Changed++;
            }
            if (r.ourAmount >= 200 * ONE_EOK !== r.tossAmount >= 200 * ONE_EOK) crossed200++;
        }
    }

    const eok = (n: number) => +(n / ONE_EOK).toFixed(1);
    const top = (m: Record<string, number>, k: number) =>
        Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k));
    return {
        range: [from, to],
        stockDays: rows.length,
        compared: ok.length,
        tossErrors: errors.length,
        errors: errors.slice(0, 30),
        amountEok: { ours: eok(ourTotal), toss: eok(tossTotal), diffPct: +(((tossTotal - ourTotal) / ourTotal) * 100).toFixed(4) },
        causes,
        nxtLostCodes: [...nxtLostCodes].sort(),
        dayAmountDiff: dayDiff,
        dayAmountDiffExclOurKrxAfter: dayDiffNoAfter,
        bars: {
            joined,
            allFieldsSame: joinedSame,
            amountSame: joinedAmountSame,
            joinedAbsDiffEok: eok(joinedAbsDiff),
        },
        oursOnly: Object.fromEntries(Object.entries(oursOnly).map(([z, s]) => [z, { ...s, amount: eok(s.amount) }])),
        tossOnly: Object.fromEntries(Object.entries(tossOnly).map(([z, s]) => [z, { ...s, amount: eok(s.amount) }])),
        oursOnlyTimes: top(timesOursOnly, 15),
        tossOnlyTimes: top(timesTossOnly, 15),
        rank: { rankChanged, top30Changed, crossed200Eok: crossed200 },
        barDiffSamples: barDiffs.slice(0, BAR_SAMPLE_CAP),
        bigGapsExclKrxAfter: bigGaps.slice(0, 60),
        bigGapCount: bigGaps.length,
    };
}

async function main(): Promise<void> {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const jsonl = path.join(OUTPUT_DIR, `toss-07-amount-${from}_${to}.jsonl`);
    const done = new Map<string, Row>();
    if (fs.existsSync(jsonl)) {
        for (const line of fs.readFileSync(jsonl, "utf-8").split("\n")) {
            if (!line.trim()) continue;
            const r = JSON.parse(line) as Row;
            done.set(`${r.code}@${r.date}`, r);
        }
    }
    const out = fs.createWriteStream(jsonl, { flags: "a" });
    const toss = makeToss();

    const dates = (await getJson<string[]>(`${base}/dates`)).filter((d) => d >= from && d <= to);
    console.log(`날짜 ${dates.length}개 (${dates[0]} ~ ${dates.at(-1)}), 이어받기 ${done.size}건`);
    const started = Date.now();
    for (const date of dates) {
        const flow = await getJson<{ stocks: { code: string }[] }>(`${base}/day-flow?date=${date}`);
        const codes = flow.stocks.map((s) => s.code).slice(0, perDayLimit);
        const todo = codes.filter((c) => !done.has(`${c}@${date}`));
        await pool(todo, CONCURRENCY, async (code) => {
            const row = await compareOne(toss, code, date);
            done.set(`${code}@${date}`, row);
            out.write(JSON.stringify(row) + "\n");
        });
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.log(`${date}: ${codes.length}종목 (새로 ${todo.length}) · 누적 ${done.size} · ${mins}분`);
    }
    await new Promise<void>((resolve) => out.end(resolve));

    const inRange = [...done.values()].filter((r) => r.date >= from && r.date <= to);
    const summary = summarize(inRange);
    console.log(JSON.stringify({ ...summary, barDiffSamples: summary.barDiffSamples.slice(0, 8), bigGapsExclKrxAfter: summary.bigGapsExclKrxAfter.slice(0, 15) }, null, 2));
    console.log("\n저장:", saveJson(`toss-07-amount-${from}_${to}.summary.json`, summary), jsonl);
}

main().catch(handleError);
