// 정찰 4: adjusted=false 가 진짜 그날의 원주가인가 — FAQ 는 제공 시작 이전 구간은 원주가를 주기 어렵다는 취지로 적는다.
// 기업행위를 낀 종목으로 true/false 를 나란히 받아 비율을 본다: 이벤트 앞 날짜는 비율 ≠ 1, 뒤 날짜는 = 1 이어야 정상.
// 기본 표본 = 에코프로(2024 액면분할로 기억 — 원주가 수준을 보고 맞는지 함께 판단할 것).
// 사용: pnpm --filter @trade-data-manager/toss recon:adjusted [코드] [YYYY-MM-DD,…]
import { fetchDayCandle, fetchDayMinutes, handleError, listArg, makeToss, num, saveJson } from "./_shared.js";

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** 비율의 분포(많은 순, 앞 5개) — 반올림 때문에 값이 여럿으로 갈리는 정도를 본다. */
function distribution(values: number[]): [number, number][] {
    const m = new Map<number, number>();
    for (const v of values) m.set(round4(v), (m.get(round4(v)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

async function main(): Promise<void> {
    const code = process.argv[2] ?? "086520";
    const dates = listArg(3, ["2022-11-23", "2024-03-14", "2024-06-14", "2026-10-15"]);
    const toss = makeToss();
    const rows: unknown[] = [];

    for (const date of dates) {
        const raw = await fetchDayMinutes(toss, code, date, false);
        const adj = await fetchDayMinutes(toss, code, date, true);
        const byTime = new Map(adj.bars.map((b) => [b.kstTime, b]));
        const pairs = raw.bars.flatMap((b) => {
            const a = byTime.get(b.kstTime);
            return a ? [{ raw: b, adj: a }] : [];
        });
        const dayRaw = await fetchDayCandle(toss, code, date, false);
        const dayAdj = await fetchDayCandle(toss, code, date, true);
        const row = {
            code,
            date,
            rawBars: raw.bars.length,
            adjBars: adj.bars.length,
            paired: pairs.length,
            firstRaw: raw.bars[0] ?? null,
            firstAdj: adj.bars[0] ?? null,
            closeRatio: distribution(pairs.map((p) => num(p.adj.closePrice) / num(p.raw.closePrice))),
            volumeRatio: distribution(
                pairs.filter((p) => num(p.raw.volume) > 0).map((p) => num(p.adj.volume) / num(p.raw.volume)),
            ),
            dayRaw,
            dayAdj,
        };
        rows.push(row);
        console.log(JSON.stringify(row, null, 2));
    }

    console.log("\n저장:", saveJson(`toss-04-adjusted-${code}.json`, rows));
}

main().catch(handleError);
