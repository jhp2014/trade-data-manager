// 정찰 6: 사라진 종목이 얼마나 빠지나 — 문서상 상폐 종목은 404 다. 2022-11-23 뒤에 사라진 종목을 전부 찔러 본다(통계의 생존 편향 규모).
// 입력 = tdm-ai 이름 이력 stocks/names/generated/history.jsonl — 줄마다 {code, names:[{name, from, to}]}, 마지막 to 가 null 이면 현재 상장.
// ⚠ "사라짐" ≠ 상폐다: 합병·코드 변경·코넥스 이전이 섞인다. 수는 상한이고, 원인은 표본을 사람이 본다.
// 스팩은 합병·해산으로 원래 사라지는 부류라 따로 센다. 대조군(현재 상장)도 같은 호출 형태로 찌른다 — 전부 ok 여야 404 를 믿을 수 있다.
// 일봉과 1분봉을 둘 다 찌르고 봉 시각을 남긴다: 이 패키지의 목적은 1분봉이고, "ok" 만으로는 그 봉이 사라진 날 근처인지 모른다.
//
// 실측(2026-11-07): 사라진 270종목(비스팩 151·스팩 119) 전부 일봉·1분봉 404, 대조군 20 전부 ok — 사라지면 과거까지 통째로 못 받는다.
// 비중(KRX 전 시장 일별 매매, 2022-11-23~2025-06-30, 비스팩): 저장 대상 종목-날(≥200억 ∪ 고가 ≥10%) 134,513 중 2.73% · 고가 ≥15% 4.68% · 고가 ≥25% 6.00%.
// ⚠ market 일봉은 151 중 30종목만 있어 DB 로 재면 0.24% 로 과소 추정된다 — 전 시장 자료로 잴 것.
// 사용: pnpm --filter @trade-data-manager/toss recon:delisted <history.jsonl 경로>
import fs from "node:fs";
import type { TossCandleInterval } from "../src/index.js";
import { attempt, endOfDay, handleError, kstOf, makeToss, saveJson } from "./_shared.js";

// 2022-12-26 앞 이력은 월초 표본이라 to=2022-11-01 은 실제로 11-23 뒤에 사라졌을 수 있다 — 포함해서 찌르고 봉 시각으로 가린다.
const GONE_FROM = "2022-11-01";
const CONTROL_SIZE = 20;
const SAVE_EVERY = 50;

interface HistoryRow {
    code: string;
    names: { name: string; from: string; to: string | null }[];
}

/** 키별 개수(큰 순). */
function tally<T>(xs: T[], key: (x: T) => string): Record<string, number> {
    const m: Record<string, number> = {};
    for (const x of xs) m[key(x)] = (m[key(x)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

async function main(): Promise<void> {
    const file = process.argv[2];
    if (!file) throw new Error("사용법: recon:delisted <history.jsonl 경로>");
    const rows = fs
        .readFileSync(file, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as HistoryRow);

    const lastOf = (r: HistoryRow) => r.names[r.names.length - 1];
    const gone = rows.filter((r) => {
        const to = lastOf(r).to;
        return to !== null && to >= GONE_FROM;
    });
    const live = rows.filter((r) => lastOf(r).to === null);
    const step = Math.max(1, Math.floor(live.length / CONTROL_SIZE));
    const control = live.filter((_, i) => i % step === 0).slice(0, CONTROL_SIZE);
    console.log(`이력 ${rows.length}종목 · ${GONE_FROM} 뒤 사라짐 ${gone.length} · 대조군 ${control.length}`);

    const toss = makeToss();
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const probeOne = async (code: string, interval: TossCandleInterval, before: string) => {
        const res = await attempt(() => toss.rest.getCandles({ symbol: code, interval, count: 1, adjusted: false, before }));
        if ("error" in res) {
            const e = res.error as { code?: unknown; http?: unknown };
            return { outcome: String(e.code ?? `http-${e.http ?? "?"}`), date: null };
        }
        const c = res.ok.candles[0];
        return c ? { outcome: "ok", date: kstOf(c.timestamp).date } : { outcome: "empty", date: null };
    };
    const probe = async (r: HistoryRow) => {
        const last = lastOf(r);
        const before = endOfDay(last.to ?? today);
        const daily = await probeOne(r.code, "1d", before);
        const minute = await probeOne(r.code, "1m", before);
        return { code: r.code, name: last.name, to: last.to, spac: last.name.includes("스팩"), daily, minute };
    };

    const controlResults: Awaited<ReturnType<typeof probe>>[] = [];
    for (const r of control) controlResults.push(await probe(r));

    const goneResults: typeof controlResults = [];
    const summarize = () => {
        const nonSpac = goneResults.filter((r) => !r.spac);
        return {
            control: { daily: tally(controlResults, (r) => r.daily.outcome), minute: tally(controlResults, (r) => r.minute.outcome) },
            goneNonSpac: { daily: tally(nonSpac, (r) => r.daily.outcome), minute: tally(nonSpac, (r) => r.minute.outcome) },
            goneSpac: { minute: tally(goneResults.filter((r) => r.spac), (r) => r.minute.outcome) },
            // 1분봉을 못 받는 비스팩이 사라진 해 — 빠지는 규모
            minuteMissingNonSpacByYear: tally(nonSpac.filter((r) => r.minute.outcome !== "ok"), (r) => r.to!.slice(0, 4)),
            // 받히는 비스팩의 마지막 봉이 사라진 날 근처인가(같은 달이 아니면 사람이 볼 것)
            minuteOkFarFromGone: nonSpac
                .filter((r) => r.minute.date !== null && r.minute.date.slice(0, 7) !== r.to!.slice(0, 7))
                .map((r) => ({ code: r.code, name: r.name, to: r.to, lastMinute: r.minute.date })),
        };
    };
    const save = () => saveJson("toss-06-delisted.json", { summary: summarize(), controlResults, goneResults });

    for (const r of gone) {
        goneResults.push(await probe(r));
        if (goneResults.length % SAVE_EVERY === 0) {
            save(); // 도중에 죽어도 결과가 남게
            console.log(`… ${goneResults.length}/${gone.length}`);
        }
    }

    console.log(JSON.stringify(summarize(), null, 2));
    console.log("\n저장:", save());
}

main().catch(handleError);
