// v3→v4 격자 diff 실측 — zigzag 재정식화(2026-08-31)의 갈림을 3분류로 기계 판정한다.
// 예고된 분류(이 밖은 설명 불가 = 정지 신호): (i) v4 에만 있는 확정 고점(옛 상태기계가 leg 재탐색으로
// 잃던 고점 — 넓은 저점 봉이 세션 최고가를 겸하던 자리), (ii) 저점이 더 낮은 봉으로 이동(피벗 최저→봉
// 최저 전환), (iii) 저점이 더 높은 쪽으로 이동(크로싱 봉 저가 제외). v3 에만 있는 고점 = 설명 불가.
//
// 둘째 절: 표본 차트를 분봉에서 **정의 그대로 순진 재계산**(독립 구현·독립 산술)해 v4 격자와 전량
// 대조 — 확정 고점 집합·구간 저점·renewalAmount. 셋째 절: v4 전수 불변식 스캔(자기확정 0·같은 분 퇴화
// 쌍 0·min 강한 단조·교대 보존·0 < renewalAmount ≤ legAmount).
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:grid-diff -- --v3 <v3사본 경로>
// ⚠ v3 사본은 원시 JSON 으로 읽는다 — fileGridStore.read 는 v4 가드라 v3 파일을 null 로 뱉는다.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import { computeMinuteTradingAmount, DEFAULT_GRID_OPTIONS, densifyMinutes, type MinuteCandle } from "@trade-data-manager/market";
import { axisDepsOf } from "../src/market/rank/axisDeps.js";
import { saveReport, strFlag, toMin } from "./_shared.js";

interface RawPivot {
    kind: "high" | "low";
    min: number;
    price: number;
    confirmedMin: number | null;
    legAmount: string;
    renewalAmount?: string | null;
}
interface RawFile {
    v: number;
    version: number;
    date: string;
    charts: Record<string, { grid: { pivots: RawPivot[] } }>;
}

async function readDir(root: string): Promise<Map<string, RawFile>> {
    const out = new Map<string, RawFile>();
    for (const name of (await fs.readdir(root)).filter((n) => n.endsWith(".json"))) {
        const f = JSON.parse(await fs.readFile(path.join(root, name), "utf8")) as RawFile;
        out.set(f.date, f);
    }
    return out;
}

/** 정의의 브루트포스 재진술 — 검출기 루프(상태기계식 1패스)와 다른 형태라 정의 오류를 잡을 수 있는
 *  진짜 독립 구현. 봉 우주는 동일(dense 분봉: 채움봉 저가=직전 종가가 터치·최저에 참여 — 거래 없음 ≠
 *  가격 없음), 산술도 독립(prefix 없음·구간 직합). */
function naiveGrid(minutes: MinuteCandle[]): RawPivot[] {
    const o = DEFAULT_GRID_OPTIONS;
    const bars = densifyMinutes(
        minutes.filter((m) => {
            const t = toMin(m.time);
            return t >= o.sessionStartMin && t <= o.sessionEndMin;
        }),
    ).map((m) => ({ min: toMin(m.time), high: Number(m.un.high), low: Number(m.un.low), tv: BigInt(computeMinuteTradingAmount(m.un)) }));
    const down = 1 - o.zigzagPct / 100;
    const n = bars.length;
    // 브루트포스 재진술(상태 없음, O(n²)): i 가 러닝 최고가 갱신 봉 ⇔ high_i > max(high_0..i−1).
    // c_i = i 뒤 첫 high > high_i 봉(없으면 n). i 확정 ⇔ ∃j∈(i,c_i): low_j ≤ high_i×down, confirmIdx = 첫 j.
    const confirmed: { idx: number; confirmIdx: number; crossEnd: number }[] = [];
    for (let i = 0; i < n; i++) {
        let isRunMax = true;
        for (let j = 0; j < i; j++) if (bars[j].high >= bars[i].high) { isRunMax = false; break; }
        if (!isRunMax) continue;
        let c = n;
        for (let j = i + 1; j < n; j++) if (bars[j].high > bars[i].high) { c = j; break; }
        let conf = -1;
        for (let j = i + 1; j < c; j++) if (bars[j].low <= bars[i].high * down) { conf = j; break; }
        if (conf < 0) continue;
        confirmed.push({ idx: i, confirmIdx: conf, crossEnd: c });
    }
    const sum = (from: number, to: number): string => {
        let s = 0n;
        for (let j = from; j <= to; j++) s += bars[j].tv;
        return s.toString();
    };
    const pivots: RawPivot[] = [];
    let prev = -1;
    for (let k = 0; k < confirmed.length; k++) {
        const h = confirmed[k];
        // 직전 확정 고점 가격의 첫 크로싱 = 직전 확정 고점의 c(정의상 첫 초과 봉) — 그 봉부터 이 고점까지가 renewal.
        pivots.push({
            kind: "high",
            min: bars[h.idx].min,
            price: bars[h.idx].high,
            confirmedMin: bars[h.confirmIdx].min,
            legAmount: sum(prev + 1, h.idx),
            renewalAmount: k === 0 ? null : sum(confirmed[k - 1].crossEnd, h.idx),
        });
        prev = h.idx;
        let lowIdx = -1;
        for (let j = h.idx + 1; j < h.crossEnd; j++) {
            if (lowIdx < 0 || bars[j].low < bars[lowIdx].low) lowIdx = j;
        }
        pivots.push({ kind: "low", min: bars[lowIdx].min, price: bars[lowIdx].low, confirmedMin: null, legAmount: sum(prev + 1, lowIdx), renewalAmount: null });
        prev = lowIdx;
    }
    return pivots;
}

async function main(): Promise<void> {
    const v3Root = strFlag("v3");
    if (!v3Root) throw new Error("--v3 <v3 사본 경로> 필수");
    const v4Root = strFlag("v4") ?? path.resolve(process.cwd(), ".cache/point-grid");

    const [v3, v4] = await Promise.all([readDir(v3Root), readDir(v4Root)]);
    console.log(`v3 ${v3.size}일 / v4 ${v4.size}일`);

    // ── 1절: 차트 단위 3분류 diff ────────────────────────────────────────────
    const counts = { equal: 0, highSetDiff: 0, confShift: 0, lowDown: 0, lowUp: 0, lowSameBarShift: 0, presence: 0, unexplained: 0 };
    const unexplained: unknown[] = [];
    const highSetDiffs: { code: string; date: string; v4Only: [number, number][]; tieShifts: number[] }[] = [];
    const lowUps: { code: string; date: string; v3Low: [number, number]; v4Low: [number, number] }[] = [];
    const lowDowns: { code: string; date: string }[] = [];
    const confShifts: { code: string; date: string; prices: number[]; v3: (number | null)[]; v4: (number | null)[] }[] = [];
    const lowDownPcts: number[] = [];
    const legMismatch: unknown[] = [];

    for (const [date, f4] of v4) {
        const f3 = v3.get(date);
        if (!f3) {
            counts.presence += Object.keys(f4.charts).length;
            continue;
        }
        const codes = new Set([...Object.keys(f3.charts), ...Object.keys(f4.charts)]);
        for (const code of codes) {
            const g3 = f3.charts[code]?.grid;
            const g4 = f4.charts[code]?.grid;
            if (!g3 || !g4) {
                counts.presence++;
                continue;
            }
            // 고점 비교는 **가격** 기준(kept 고점 가격은 강한 단조라 차트 안 유일) — 같은 가격의 봉 이동은
            // 타이브레이크 소멸의 예고된 산물(v3 는 동가 뒤 봉을 잡을 수 있었다), v3 에만 있는 가격만 설명 불가.
            const hm3 = new Map(g3.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.min]));
            const hm4 = new Map(g4.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.min]));
            const cm3 = new Map(g3.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.confirmedMin]));
            const cm4 = new Map(g4.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.confirmedMin]));
            const v3OnlyPrices = [...hm3.keys()].filter((pr) => !hm4.has(pr));
            const v4OnlyPrices = [...hm4.keys()].filter((pr) => !hm3.has(pr));
            const tieShifts = [...hm3.keys()].filter((pr) => hm4.has(pr) && hm4.get(pr) !== hm3.get(pr));
            if (v3OnlyPrices.length > 0) {
                counts.unexplained++;
                unexplained.push({ code, date, why: "v3에만 있는 확정 고점 가격", v3OnlyPrices });
                continue;
            }
            if (v4OnlyPrices.length > 0 || tieShifts.length > 0) {
                counts.highSetDiff++;
                highSetDiffs.push({ code, date, v4Only: v4OnlyPrices.map((pr): [number, number] => [hm4.get(pr)!, pr]), tieShifts });
                continue; // 고점 집합/자리가 다르면 저점·leg 비교는 구간이 달라 무의미 — 표본 재계산이 검증한다.
            }
            // 고점 집합 동일 → 확정 시각 비교(같은 고점인데 터치 봉이 다르면 = 상태기계의 확정 타이밍 vs
            // 정의의 첫 터치 — 설명 가능 분류지만 equal 에 섞지 않는다. 저점 confirmedMin 은 비교 제외:
            // v3 숫자→v4 null 고정은 전면 의미 변경이라 전 차트가 걸린다).
            const confShifted = [...cm3.keys()].filter((pr) => cm3.get(pr) !== cm4.get(pr));
            if (confShifted.length > 0) {
                counts.confShift++;
                confShifts.push({ code, date, prices: confShifted, v3: confShifted.map((pr) => cm3.get(pr) ?? null), v4: confShifted.map((pr) => cm4.get(pr) ?? null) });
                continue;
            }
            // 고점 집합·확정 시각 동일 → 저점을 구간 순서대로 짝지어 비교(교대 구조라 k번째 저점끼리 대응).
            const ls3 = g3.pivots.filter((p) => p.kind === "low");
            const ls4 = g4.pivots.filter((p) => p.kind === "low");
            let chartClass: "equal" | "lowDown" | "lowUp" | "lowSameBarShift" = "equal";
            for (let k = 0; k < Math.max(ls3.length, ls4.length); k++) {
                const a = ls3[k];
                const b = ls4[k];
                if (!a || !b) {
                    chartClass = "lowUp"; // v3 꼬리 저점 유무 차이 등 — lowUps 목록으로 검증
                    lowUps.push({ code, date, v3Low: a ? [a.min, a.price] : [-1, -1], v4Low: b ? [b.min, b.price] : [-1, -1] });
                    continue;
                }
                if (a.min === b.min && a.price === b.price) continue;
                if (b.price < a.price) {
                    chartClass = chartClass === "equal" ? "lowDown" : chartClass;
                    lowDowns.push({ code, date });
                    lowDownPcts.push(((a.price - b.price) / a.price) * 100);
                } else if (b.price > a.price) {
                    chartClass = "lowUp";
                    lowUps.push({ code, date, v3Low: [a.min, a.price], v4Low: [b.min, b.price] });
                } else {
                    chartClass = chartClass === "equal" ? "lowSameBarShift" : chartClass;
                }
            }
            if (chartClass === "equal") {
                // 구조 동일 → legAmount 비트 일치가 정상(같은 prefix 산술).
                const legs3 = g3.pivots.map((p) => p.legAmount).join(",");
                const legs4 = g4.pivots.map((p) => p.legAmount).join(",");
                if (legs3 !== legs4) {
                    counts.unexplained++;
                    legMismatch.push({ code, date, legs3, legs4 });
                    continue;
                }
                counts.equal++;
            } else counts[chartClass]++;
        }
    }

    const maxLowDownPct = lowDownPcts.length ? Math.max(...lowDownPcts) : 0;
    console.log(`\n── diff 3분류 ──`);
    console.log(`equal ${counts.equal} · (i) 고점 추가/이동 ${counts.highSetDiff} · 확정 시각 이동 ${counts.confShift} · (ii) 저점 하향 ${counts.lowDown}(최대 ${maxLowDownPct.toFixed(3)}%) · 동가 봉 이동 ${counts.lowSameBarShift} · (iii) 저점 상향 ${counts.lowUp} · 존재차 ${counts.presence}`);
    console.log(`설명 불가: ${counts.unexplained}건 ${counts.unexplained > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    // ── 2절: 표본 순진 재계산 — (i)·(iii) 전 차트 + 무작위 20 ───────────────
    const pool = createPoolFromEnv();
    const deps = axisDepsOf(pool);
    const targets = new Map<string, { code: string; date: string }>();
    for (const d of highSetDiffs) targets.set(`${d.code}|${d.date}`, d);
    for (const d of lowUps) targets.set(`${d.code}|${d.date}`, d);
    for (const d of lowDowns) targets.set(`${d.code}|${d.date}`, d);
    for (const d of confShifts) targets.set(`${d.code}|${d.date}`, d);
    const allCharts: { code: string; date: string }[] = [];
    for (const [date, f4] of v4) for (const code of Object.keys(f4.charts)) allCharts.push({ code, date });
    let strideAdded = 0; // 구조 갈림 없는 차트도 20개 목표 보폭 표집(고정 보폭 = 재실행 재현성, 미달 시 로그로 드러남)
    for (let i = 0; strideAdded < 20 && i < allCharts.length; i += 97) {
        const c = allCharts[i];
        const k = `${c.code}|${c.date}`;
        if (!targets.has(k)) {
            targets.set(k, c);
            strideAdded++;
        }
    }
    let naiveOk = 0;
    const naiveBad: unknown[] = [];
    for (const { code, date } of targets.values()) {
        const minutes = await deps.minute.getMinuteCandles(code, date);
        const expected = naiveGrid(minutes).map((p) => [p.kind, p.min, p.price, p.confirmedMin, p.legAmount, p.renewalAmount ?? null]);
        const actual = (v4.get(date)?.charts[code]?.grid.pivots ?? []).map((p) => [p.kind, p.min, p.price, p.confirmedMin, p.legAmount, p.renewalAmount ?? null]);
        if (JSON.stringify(expected) === JSON.stringify(actual)) naiveOk++;
        else naiveBad.push({ code, date, expected, actual });
    }
    console.log(`\n── 순진 재계산 대조(확정 고점·저점·legAmount·renewalAmount 전량) ──`);
    console.log(`표본 ${targets.size}차트(보폭 ${strideAdded}/20): 일치 ${naiveOk} / 불일치 ${naiveBad.length} ${naiveBad.length > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    // ── 3절: v4 전수 불변식 스캔 ─────────────────────────────────────────────
    let selfConf = 0;
    let samePair = 0;
    let regress = 0;
    let altBad = 0;
    let renewBad = 0;
    let pivotTotal = 0;
    for (const f4 of v4.values()) {
        for (const { grid } of Object.values(f4.charts)) {
            const ps = grid.pivots;
            pivotTotal += ps.length;
            if (ps.length % 2 !== 0 || (ps.length > 0 && (ps[0].kind !== "high" || ps[ps.length - 1].kind !== "low"))) altBad++;
            let prevMin = -1;
            let prevKind: string | null = null;
            for (const p of ps) {
                if (p.min <= prevMin) (p.min === prevMin ? samePair++ : regress++);
                if (p.kind === prevKind) altBad++;
                prevMin = p.min;
                prevKind = p.kind;
                if (p.kind === "high" && p.confirmedMin !== null && p.confirmedMin === p.min) selfConf++;
                const r = p.renewalAmount ?? null;
                if (r !== null && !(BigInt(r) > 0n && BigInt(r) <= BigInt(p.legAmount))) renewBad++;
                if (p.kind === "low" && (p.confirmedMin !== null || r !== null)) renewBad++;
            }
        }
    }
    console.log(`\n── v4 불변식 ──`);
    console.log(`피벗 ${pivotTotal} · 자기확정 ${selfConf} · 같은 분 쌍 ${samePair} · 역행 ${regress} · 교대 위반 ${altBad} · renewal/null 위반 ${renewBad}`);

    saveReport("grid-diff", {
        counts,
        maxLowDownPct,
        highSetDiffs,
        confShifts,
        lowUps,
        legMismatch,
        unexplained,
        naive: { sample: targets.size, ok: naiveOk, bad: naiveBad },
        invariants: { pivotTotal, selfConf, samePair, regress, altBad, renewBad },
    });
    await pool.end();
}

main().catch((err) => {
    console.error("❌ grid-diff 실패", err);
    process.exit(1);
});
