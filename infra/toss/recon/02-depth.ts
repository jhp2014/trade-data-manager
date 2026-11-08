// 정찰 2: 실제로 어디까지 받히나 — 문서는 국내 1분봉 2022-11-23 부터라고 한다.
// 경계 앞뒤를 찍어 본 뒤, 경계 바로 뒤에서 더 안 나올 때까지 걸어 **진짜 가장 오래된 봉**을 잰다. 일봉도 같은 식.
// 원주가·수정주가의 바닥이 다를 수 있어(FAQ) 1분봉은 둘 다 걷는다.
// 시작점 = 그 종목 일봉 바닥 + 7일과 2022-12-01 중 늦은 쪽 — 그 뒤 상장한 종목도 상장일 봉까지 닿는다(1분봉 바닥이 상장일이면 정상).
// 결론은 stop 과 함께 읽을 것: max-pages 면 바닥이 아니다. 기본 표본 = 코스피 대형주 · 코스닥 대형주 · 거래 드문 우선주 · 2024-11-06 상장주(더본코리아, 이 날에서 끝나야 정상).
// 사용: pnpm --filter @trade-data-manager/toss recon:depth [코드,코드…]
import type { Toss, TossCandleInterval } from "../src/index.js";
import { assertAdvances, attempt, endOfDay, handleError, kstOf, listArg, makeToss, saveJson } from "./_shared.js";

const PROBES = [
    "2025-01-02T23:59:59+09:00",
    "2022-12-01T23:59:59+09:00",
    "2022-11-24T00:00:00+09:00",
    "2022-11-23T23:59:59+09:00",
    "2022-11-23T09:00:00+09:00",
    "2022-11-22T23:59:59+09:00",
    "2022-01-03T23:59:59+09:00",
    "2020-01-02T23:59:59+09:00",
];
const MAX_WALK_PAGES = 50; // 1분봉 경계 근처면 금방 끝난다. 일봉은 200봉 × 50 = 약 40년
const WALK_FROM = "2022-12-01";

const label = (ts: string): string => {
    const k = kstOf(ts);
    return `${k.date} ${k.time}`;
};
const addDays = (d: string, n: number): string => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);

async function probe(toss: Toss, code: string, before: string) {
    const r = await attempt(() => toss.rest.getCandles({ symbol: code, interval: "1m", count: 200, before, adjusted: false }));
    if ("error" in r) return { before, error: r.error };
    const c = r.ok.candles;
    return {
        before,
        count: c.length,
        newest: c.length ? label(c[0].timestamp) : null,
        oldest: c.length ? label(c[c.length - 1].timestamp) : null,
        nextBefore: r.ok.nextBefore,
    };
}

/** before 에서 시작해 커서가 끝날 때까지 걷는다. 빈 페이지에 커서가 남아 있으면 바닥으로 단정하지 않고 값과 함께 stop 으로 남긴다. */
async function walkToOldest(toss: Toss, code: string, interval: TossCandleInterval, adjusted: boolean, start?: string) {
    let before: string | undefined = start;
    let oldest: string | null = null;
    let pages = 0;
    let stop = "max-pages";
    while (pages < MAX_WALK_PAGES) {
        const at: string | undefined = before;
        const r = await attempt(() => toss.rest.getCandles({ symbol: code, interval, count: 200, before: at, adjusted }));
        pages++;
        if ("error" in r) {
            stop = `error: ${JSON.stringify(r.error)}`;
            break;
        }
        const c = r.ok.candles;
        if (c.length) oldest = label(c[c.length - 1].timestamp);
        const next = r.ok.nextBefore;
        if (!next) {
            stop = c.length ? "nextBefore-null" : "empty-page";
            break;
        }
        if (!c.length) {
            stop = `empty-page-with-nextBefore: ${next}`;
            break;
        }
        assertAdvances(before, next);
        before = next;
    }
    return { start: start ?? null, oldest, pages, stop };
}

async function main(): Promise<void> {
    const codes = listArg(2, ["005930", "247540", "003545", "475560"]);
    const toss = makeToss();
    const out: Record<string, unknown> = {};

    for (const code of codes) {
        console.log(`\n=== ${code} ===`);
        const probes = [];
        for (const before of PROBES) {
            const p = await probe(toss, code, before);
            probes.push(p);
            console.log(JSON.stringify(p));
        }
        const dailyFloor = await walkToOldest(toss, code, "1d", false);
        console.log("일봉 끝까지:", dailyFloor);

        const nearListing = dailyFloor.oldest ? addDays(dailyFloor.oldest.slice(0, 10), 7) : WALK_FROM;
        const start = endOfDay(nearListing > WALK_FROM ? nearListing : WALK_FROM);
        const minuteFloorRaw = await walkToOldest(toss, code, "1m", false, start);
        console.log("1분봉 끝까지(원주가):", minuteFloorRaw);
        const minuteFloorAdjusted = await walkToOldest(toss, code, "1m", true, start);
        console.log("1분봉 끝까지(수정주가):", minuteFloorAdjusted);
        out[code] = { probes, dailyFloor, minuteFloorRaw, minuteFloorAdjusted };
    }

    console.log("\n저장:", saveJson("toss-02-depth.json", out));
}

main().catch(handleError);
