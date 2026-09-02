// 격자 diff 실측 — 옛 캐시 사본 vs 현재 캐시를 3분류로 기계 판정한다(구조 변경의 회귀 검증 재사용 도구).
// 예고된 분류(이 밖은 설명 불가 = 정지 신호): (i) 현재에만 있는 확정 고점(옛 상태기계가 leg 재탐색으로
// 잃던 고점 — 넓은 저점 봉이 세션 최고가를 겸하던 자리), (ii) 저점이 더 낮은 봉으로 이동(피벗 최저→봉
// 최저 전환), (iii) 저점이 더 높은 쪽으로 이동(크로싱 봉 저가 제외). 옛에만 있는 고점 = 설명 불가.
// **구조가 안 바뀌는 변경**(2026-09-02 누적 스냅샷 전환 v6→v7)은 기대값이 강하다: equal 전량 + 설명 불가 0
// + 현재 격자에서 **파생**한 leg/renewal 이 옛 파일에 굽힌 legAmount/renewalAmount 와 문자열 비트 일치.
//
// 둘째 절: 표본 차트를 분봉에서 **정의 그대로 순진 재계산**(독립 구현·독립 산술)해 현재 격자와 전량
// 대조 — 확정 고점 집합·구간 저점·누적(cum)·크로싱 봉. 셋째 절: 현재 전수 불변식 스캔(자기확정 0·같은 분 퇴화
// 쌍 0·min 강한 단조·교대 보존·파생 0 < renewal ≤ leg·저점의 cross/confirmedMin null).
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:grid-diff -- --old <옛 사본 경로>
// ⚠ 옛 사본은 원시 JSON 으로 읽는다 — fileGridStore.read 는 현재 버전 가드라 옛 파일을 null 로 뱉는다.
//   옛 파일의 피벗은 legAmount/renewalAmount 를, 현재 파일은 cum/cross 를 든다 — 두 모양을 다 받는다.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import {
    computeMinuteTradingAmount,
    DEFAULT_GRID_OPTIONS,
    densifyMinutes,
    legAmountOf,
    renewalAmountOf,
    type GridBarMark,
    type MinuteCandle,
    type PointGrid,
} from "@trade-data-manager/market";
import { axisDepsOf } from "../src/market/rank/axisDeps.js";
import { saveReport, strFlag, toMin } from "./_shared.js";

/** 옛(v≤6) 피벗 — 창을 굽던 모양. */
interface OldPivot {
    kind: "high" | "low";
    min: number;
    price: number;
    confirmedMin: number | null;
    legAmount: string;
    renewalAmount?: string | null;
}
interface OldFile {
    v: number;
    version: number;
    date: string;
    charts: Record<string, { grid: { pivots: OldPivot[] } }>;
}
interface NewFile {
    v: number;
    version: number;
    date: string;
    charts: Record<string, { grid: PointGrid }>;
}

async function readDir<T>(root: string): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const name of (await fs.readdir(root)).filter((n) => n.endsWith(".json"))) {
        const f = JSON.parse(await fs.readFile(path.join(root, name), "utf8")) as T & { date: string };
        out.set(f.date, f);
    }
    return out;
}

type NaivePivot = { kind: "high" | "low"; min: number; price: number; confirmedMin: number | null; cum: string; cross: GridBarMark | null };

/** 정의의 브루트포스 재진술 — 검출기 루프(상태기계식 1패스)와 다른 형태라 정의 오류를 잡을 수 있는
 *  진짜 독립 구현. 봉 우주는 동일(dense 분봉: 채움봉 저가=직전 종가가 터치·최저에 참여 — 거래 없음 ≠
 *  가격 없음), 산술도 독립(prefix 없음·구간 직합으로 누적을 다시 센다). */
function naiveGrid(minutes: MinuteCandle[]): NaivePivot[] {
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
    const cumTo = (to: number): string => {
        let s = 0n;
        for (let j = 0; j <= to; j++) s += bars[j].tv;
        return s.toString();
    };
    const markOf = (i: number): GridBarMark => ({ min: bars[i].min, tv: bars[i].tv.toString(), cum: cumTo(i) });
    const pivots: NaivePivot[] = [];
    for (let k = 0; k < confirmed.length; k++) {
        const h = confirmed[k];
        // 직전 확정 고점 가격의 첫 크로싱 = 직전 확정 고점의 c(정의상 첫 초과 봉).
        pivots.push({
            kind: "high",
            min: bars[h.idx].min,
            price: bars[h.idx].high,
            confirmedMin: bars[h.confirmIdx].min,
            cum: cumTo(h.idx),
            cross: k === 0 ? null : markOf(confirmed[k - 1].crossEnd),
        });
        let lowIdx = -1;
        for (let j = h.idx + 1; j < h.crossEnd; j++) {
            if (lowIdx < 0 || bars[j].low < bars[lowIdx].low) lowIdx = j;
        }
        pivots.push({ kind: "low", min: bars[lowIdx].min, price: bars[lowIdx].low, confirmedMin: null, cum: cumTo(lowIdx), cross: null });
    }
    return pivots;
}

/** 현재 격자에서 옛 모양(legAmount/renewalAmount)을 파생 — 옛 파일과의 비트 대조용. */
const derivedOldShape = (g: PointGrid): string => g.pivots.map((_, i) => `${legAmountOf(g, i)}/${renewalAmountOf(g, i) ?? "null"}`).join(",");
const storedOldShape = (ps: OldPivot[]): string => ps.map((p) => `${p.legAmount}/${p.renewalAmount ?? "null"}`).join(",");

async function main(): Promise<void> {
    const oldRoot = strFlag("old") ?? strFlag("v3");
    if (!oldRoot) throw new Error("--old <옛 사본 경로> 필수");
    const newRoot = strFlag("new") ?? strFlag("v4") ?? path.resolve(process.cwd(), ".cache/point-grid");

    const [oldFiles, newFiles] = await Promise.all([readDir<OldFile>(oldRoot), readDir<NewFile>(newRoot)]);
    console.log(`옛 ${oldFiles.size}일 / 현재 ${newFiles.size}일`);

    // ── 1절: 차트 단위 3분류 diff ────────────────────────────────────────────
    const counts = { equal: 0, highSetDiff: 0, confShift: 0, lowDown: 0, lowUp: 0, lowSameBarShift: 0, presence: 0, unexplained: 0 };
    const unexplained: unknown[] = [];
    const highSetDiffs: { code: string; date: string; newOnly: [number, number][]; tieShifts: number[] }[] = [];
    const lowUps: { code: string; date: string; oldLow: [number, number]; newLow: [number, number] }[] = [];
    const lowDowns: { code: string; date: string }[] = [];
    const confShifts: { code: string; date: string; prices: number[]; old: (number | null)[]; new: (number | null)[] }[] = [];
    const lowDownPcts: number[] = [];
    const amountMismatch: unknown[] = [];

    for (const [date, fNew] of newFiles) {
        const fOld = oldFiles.get(date);
        if (!fOld) {
            counts.presence += Object.keys(fNew.charts).length;
            continue;
        }
        const codes = new Set([...Object.keys(fOld.charts), ...Object.keys(fNew.charts)]);
        for (const code of codes) {
            const gOld = fOld.charts[code]?.grid;
            const gNew = fNew.charts[code]?.grid;
            if (!gOld || !gNew) {
                counts.presence++;
                continue;
            }
            // 고점 비교는 **가격** 기준(kept 고점 가격은 강한 단조라 차트 안 유일) — 같은 가격의 봉 이동은
            // 타이브레이크 소멸의 예고된 산물, 옛에만 있는 가격만 설명 불가.
            const hmOld = new Map(gOld.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.min]));
            const hmNew = new Map(gNew.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.min]));
            const cmOld = new Map(gOld.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.confirmedMin]));
            const cmNew = new Map(gNew.pivots.filter((p) => p.kind === "high").map((p) => [p.price, p.confirmedMin]));
            const oldOnlyPrices = [...hmOld.keys()].filter((pr) => !hmNew.has(pr));
            const newOnlyPrices = [...hmNew.keys()].filter((pr) => !hmOld.has(pr));
            const tieShifts = [...hmOld.keys()].filter((pr) => hmNew.has(pr) && hmNew.get(pr) !== hmOld.get(pr));
            if (oldOnlyPrices.length > 0) {
                counts.unexplained++;
                unexplained.push({ code, date, why: "옛에만 있는 확정 고점 가격", oldOnlyPrices });
                continue;
            }
            if (newOnlyPrices.length > 0 || tieShifts.length > 0) {
                counts.highSetDiff++;
                highSetDiffs.push({ code, date, newOnly: newOnlyPrices.map((pr): [number, number] => [hmNew.get(pr)!, pr]), tieShifts });
                continue; // 고점 집합/자리가 다르면 저점·창 비교는 구간이 달라 무의미 — 표본 재계산이 검증한다.
            }
            // 고점 집합 동일 → 확정 시각 비교(저점 confirmedMin 은 비교 제외 — 항상 null).
            const confShifted = [...cmOld.keys()].filter((pr) => cmOld.get(pr) !== cmNew.get(pr));
            if (confShifted.length > 0) {
                counts.confShift++;
                confShifts.push({ code, date, prices: confShifted, old: confShifted.map((pr) => cmOld.get(pr) ?? null), new: confShifted.map((pr) => cmNew.get(pr) ?? null) });
                continue;
            }
            // 고점 집합·확정 시각 동일 → 저점을 구간 순서대로 짝지어 비교(교대 구조라 k번째 저점끼리 대응).
            const lsOld = gOld.pivots.filter((p) => p.kind === "low");
            const lsNew = gNew.pivots.filter((p) => p.kind === "low");
            let chartClass: "equal" | "lowDown" | "lowUp" | "lowSameBarShift" = "equal";
            for (let k = 0; k < Math.max(lsOld.length, lsNew.length); k++) {
                const a = lsOld[k];
                const b = lsNew[k];
                if (!a || !b) {
                    chartClass = "lowUp";
                    lowUps.push({ code, date, oldLow: a ? [a.min, a.price] : [-1, -1], newLow: b ? [b.min, b.price] : [-1, -1] });
                    continue;
                }
                if (a.min === b.min && a.price === b.price) continue;
                if (b.price < a.price) {
                    chartClass = chartClass === "equal" ? "lowDown" : chartClass;
                    lowDowns.push({ code, date });
                    lowDownPcts.push(((a.price - b.price) / a.price) * 100);
                } else if (b.price > a.price) {
                    chartClass = "lowUp";
                    lowUps.push({ code, date, oldLow: [a.min, a.price], newLow: [b.min, b.price] });
                } else {
                    chartClass = chartClass === "equal" ? "lowSameBarShift" : chartClass;
                }
            }
            if (chartClass === "equal") {
                // 구조 동일 → 현재 격자의 **파생** leg/renewal 이 옛 파일의 굽힌 값과 비트 일치해야 정상
                // (같은 prefix 산술). 여기가 누적 스냅샷 전환의 정확성 증명이다.
                const derived = derivedOldShape(gNew);
                const stored = storedOldShape(gOld.pivots);
                if (derived !== stored) {
                    counts.unexplained++;
                    amountMismatch.push({ code, date, stored, derived });
                    continue;
                }
                counts.equal++;
            } else counts[chartClass]++;
        }
    }

    const maxLowDownPct = lowDownPcts.length ? Math.max(...lowDownPcts) : 0;
    console.log(`\n── diff 3분류 ──`);
    console.log(`equal ${counts.equal} · (i) 고점 추가/이동 ${counts.highSetDiff} · 확정 시각 이동 ${counts.confShift} · (ii) 저점 하향 ${counts.lowDown}(최대 ${maxLowDownPct.toFixed(3)}%) · 동가 봉 이동 ${counts.lowSameBarShift} · (iii) 저점 상향 ${counts.lowUp} · 존재차 ${counts.presence}`);
    console.log(`설명 불가: ${counts.unexplained}건(파생 대금 불일치 ${amountMismatch.length}) ${counts.unexplained > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    // ── 2절: 표본 순진 재계산 — (i)·(iii) 전 차트 + 무작위 20 ───────────────
    const pool = createPoolFromEnv();
    const deps = axisDepsOf(pool);
    const targets = new Map<string, { code: string; date: string }>();
    for (const d of highSetDiffs) targets.set(`${d.code}|${d.date}`, d);
    for (const d of lowUps) targets.set(`${d.code}|${d.date}`, d);
    for (const d of lowDowns) targets.set(`${d.code}|${d.date}`, d);
    for (const d of confShifts) targets.set(`${d.code}|${d.date}`, d);
    const allCharts: { code: string; date: string }[] = [];
    for (const [date, f] of newFiles) for (const code of Object.keys(f.charts)) allCharts.push({ code, date });
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
    const shape = (p: NaivePivot) => [p.kind, p.min, p.price, p.confirmedMin, p.cum, p.cross ? [p.cross.min, p.cross.tv, p.cross.cum] : null];
    for (const { code, date } of targets.values()) {
        const minutes = await deps.minute.getMinuteCandles(code, date);
        const expected = naiveGrid(minutes).map(shape);
        const actual = (newFiles.get(date)?.charts[code]?.grid.pivots ?? []).map(shape);
        if (JSON.stringify(expected) === JSON.stringify(actual)) naiveOk++;
        else naiveBad.push({ code, date, expected, actual });
    }
    console.log(`\n── 순진 재계산 대조(확정 고점·저점·누적·크로싱 봉 전량) ──`);
    console.log(`표본 ${targets.size}차트(보폭 ${strideAdded}/20): 일치 ${naiveOk} / 불일치 ${naiveBad.length} ${naiveBad.length > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    // ── 3절: 현재 전수 불변식 스캔 ───────────────────────────────────────────
    let selfConf = 0;
    let samePair = 0;
    let regress = 0;
    let altBad = 0;
    let renewBad = 0;
    let cumBad = 0;
    let touchBad = 0;
    let pivotTotal = 0;
    for (const f of newFiles.values()) {
        for (const { grid } of Object.values(f.charts)) {
            const ps = grid.pivots;
            pivotTotal += ps.length;
            if (ps.length % 2 !== 0 || (ps.length > 0 && (ps[0].kind !== "high" || ps[ps.length - 1].kind !== "low"))) altBad++;
            let prevMin = -1;
            let prevKind: string | null = null;
            let prevCum = -1n;
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i];
                if (p.min <= prevMin) (p.min === prevMin ? samePair++ : regress++);
                if (p.kind === prevKind) altBad++;
                prevMin = p.min;
                prevKind = p.kind;
                if (BigInt(p.cum) < prevCum) cumBad++; // 누적은 비감소
                prevCum = BigInt(p.cum);
                if (p.kind === "high" && p.confirmedMin !== null && p.confirmedMin === p.min) selfConf++;
                const r = renewalAmountOf(grid, i);
                if (r !== null && !(BigInt(r) > 0n && BigInt(r) <= BigInt(legAmountOf(grid, i)))) renewBad++;
                if (p.kind === "high" && p.cross !== null && !(p.cross.min <= p.min && BigInt(p.cross.cum) <= BigInt(p.cum))) cumBad++;
                if (p.kind === "low" && (p.confirmedMin !== null || p.cross !== null)) renewBad++;
            }
            // 터치 봉 누적: 신고가 목록·피벗과 같은 자(세션 누적) — 터치 이후 기록 봉의 cum 이 터치 cum 보다 작으면 위반.
            if (grid.touch !== null) {
                for (const e of grid.newHighs) if (e.min >= grid.touch.min && BigInt(e.cum) < BigInt(grid.touch.cum)) touchBad++;
            }
        }
    }
    console.log(`\n── 현재 불변식 ──`);
    console.log(`피벗 ${pivotTotal} · 자기확정 ${selfConf} · 같은 분 쌍 ${samePair} · 역행 ${regress} · 교대 위반 ${altBad} · 파생 renewal/null 위반 ${renewBad} · 누적/크로싱 위반 ${cumBad} · 터치 누적 위반 ${touchBad}`);

    saveReport("grid-diff", {
        counts,
        maxLowDownPct,
        highSetDiffs,
        confShifts,
        lowUps,
        amountMismatch,
        unexplained,
        naive: { sample: targets.size, ok: naiveOk, bad: naiveBad },
        invariants: { pivotTotal, selfConf, samePair, regress, altBad, renewBad, cumBad, touchBad },
    });
    await pool.end();
}

main().catch((err) => {
    console.error("❌ grid-diff 실패", err);
    process.exit(1);
});
