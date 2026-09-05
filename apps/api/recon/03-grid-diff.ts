// 격자 diff 실측 — 옛 캐시 사본 vs 현재 캐시를 기계 판정한다(구조 변경의 회귀 검증 재사용 도구).
// v9(2026-09-05, 경로 뷰 + 기준 밴드) 대조 게이트 — 명세 .claude/specs/2026-09-05-grid-swings-v9.md §7:
//   G1 비트 동일: base·touch·sessionHigh·prevBase·prevBaseKrx — 전 차트 diff 0(정지 신호).
//   G2 부분열 동일: 새 newHighs 의 `high > maxBefore` 부분열([min,open,high,low,close,tv,cum])
//      = 옛 newHighs 전량 — diff 0(1단계 회귀 증명). 밴드 진입 항목 수·바이트 증가분은 기록.
//   G3 마디 뷰 3분류: levelViewOf(새) vs 옛 pivots 쌍 열 → equal / 클래스①(선행 국면 — 첫 레벨만
//      다르고 이후 전 쌍 동일. 평평한 개장이면 가격 차 ≤0.04%, 넓은 세션 최고가 봉이면 상한 없음)
//      / 클래스②(저가 우선 동가 — 고점 열 동일, 저점만 v9 쪽이 높고 ≤0.06%) / 그 밖 **0**(정지 신호).
//
// 둘째 절: 표본 차트를 분봉에서 §2.2 를 **독립 재진술**(구간 재스캔 O(n²) — 상태 캐리 없음)로 재계산해
// 현재 격자와 전량 대조. ⚠ 정직 주석: v9 는 규칙 자체가 순차 정의라 브루트포스도 순차를 벗어날 수 없다 —
// 독립성은 v8 의 naiveGrid 보다 약하다(같은 프로즈의 다른 형태일 뿐). 그래서 fresh 스캔·독립 산술로만 가른다.
// 셋째 절: 현재 전수 불변식 스캔(§2.7 ①~⑥ = core checkGridInvariants) + ⑤ `>` 집합 ⊆ 클래스① 대조 +
// 밴드 전제(maxBefore 비감소·상단 돌파 부분열 강한 단조).
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:grid-diff -- --old .cache/point-grid-v8
// ⚠ 옛 사본은 원시 JSON 으로 읽는다 — fileGridStore.read 는 현재 버전 가드라 옛 파일을 null 로 뱉는다.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import {
    checkGridInvariants,
    computeMinuteTradingAmount,
    DEFAULT_GRID_OPTIONS,
    densifyMinutes,
    levelViewOf,
    type GridBarMark,
    type GridNewHigh,
    type GridPivot,
    type MinuteCandle,
    type PointGrid,
} from "@trade-data-manager/market";
import { axisDepsOf } from "../src/market/rank/axisDeps.js";
import { saveReport, strFlag, toMin } from "./_shared.js";

/** 옛(v8) 격자 — maxBefore 이전 모양. 피벗은 (high, low) 교대 쌍(저점 confirmedMin 항상 null). */
type OldGrid = Omit<PointGrid, "newHighs"> & { newHighs: Omit<GridNewHigh, "maxBefore">[] };
interface OldFile {
    v: number;
    version: number;
    date: string;
    charts: Record<string, { grid: OldGrid }>;
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

// ── §2.2 독립 재진술(브루트포스) ─────────────────────────────────────────────
type NaivePivot = { kind: "high" | "low"; min: number; price: number; confirmedMin: number | null; cum: string; cross: GridBarMark | null };
type Bar = { min: number; high: number; low: number; tv: bigint };

function naivePivots(minutes: MinuteCandle[]): NaivePivot[] {
    const o = DEFAULT_GRID_OPTIONS;
    const bars: Bar[] = densifyMinutes(
        minutes.filter((m) => {
            const t = toMin(m.time);
            return t >= o.sessionStartMin && t <= o.sessionEndMin;
        }),
    ).map((m) => ({ min: toMin(m.time), high: Number(m.un.high), low: Number(m.un.low), tv: BigInt(computeMinuteTradingAmount(m.un)) }));
    const n = bars.length;
    if (n === 0) return [];
    const up = 1 + o.zigzagPct / 100;
    const down = 1 - o.zigzagPct / 100;
    // fresh 스캔(상태 캐리 없음) — 구현의 증분 갱신(runHigh/runLow) 버그가 여기 전염되지 않게.
    const maxHighBefore = (i: number): number => {
        let m = -Infinity;
        for (let j = 0; j < i; j++) if (bars[j].high > m) m = bars[j].high;
        return m;
    };
    const renew = (i: number): boolean => bars[i].high > maxHighBefore(i);
    const argmaxHigh = (a: number, b: number): number => {
        let k = a;
        for (let j = a; j <= b; j++) if (bars[j].high > bars[k].high) k = j; // tie → 이른 봉
        return k;
    };
    const argminLow = (a: number, b: number): number => {
        let k = a;
        for (let j = a; j <= b; j++) if (bars[j].low < bars[k].low) k = j;
        return k;
    };

    const raw: { kind: "high" | "low"; idx: number; confirmIdx: number | null }[] = [];
    let dir: "up" | "down" | null = null;
    let swingStart = 0;
    let i = 0;
    // 국면 A(dir=none): 첫 확정 사건 — 세션 극값 둘을 구간 재스캔으로, 자기 봉 금지(≠ i).
    for (i = 0; i < n && dir === null; i++) {
        const mh = argmaxHigh(0, i);
        const ml = argminLow(0, i);
        if (renew(i)) {
            if (ml !== i && bars[i].high >= bars[ml].low * up) {
                raw.push({ kind: "low", idx: ml, confirmIdx: i });
                dir = "up";
                swingStart = i;
            }
        } else if (mh !== i && bars[i].low <= bars[mh].high * down) {
            raw.push({ kind: "high", idx: mh, confirmIdx: i });
            dir = "down";
            swingStart = i;
        } else if (ml !== i && bars[i].high >= bars[ml].low * up) {
            raw.push({ kind: "low", idx: ml, confirmIdx: i });
            dir = "up";
            swingStart = i;
        }
    }
    // 국면 B: 스윙 교대 — 챔피언은 [swingStart, j−1] 재스캔(자기 봉 제외가 곧 저가 우선·자기 봉 금지).
    while (dir !== null && i < n) {
        let confirmed = false;
        if (dir === "up") {
            for (let j = i; j < n; j++) {
                if (renew(j)) continue; // 고가 우선 — 갱신 봉은 터치 검사 생략
                const ch = argmaxHigh(swingStart, j - 1);
                if (bars[j].low <= bars[ch].high * down) {
                    raw.push({ kind: "high", idx: ch, confirmIdx: j });
                    dir = "down";
                    swingStart = j;
                    i = j + 1;
                    confirmed = true;
                    break;
                }
            }
            if (!confirmed) {
                raw.push({ kind: "high", idx: argmaxHigh(swingStart, n - 1), confirmIdx: null });
                dir = null;
            }
        } else {
            for (let j = i; j < n; j++) {
                const cl = argminLow(swingStart, j - 1);
                if (renew(j)) {
                    raw.push({ kind: "low", idx: cl, confirmIdx: j }); // 고가 우선 — 갱신 봉의 더 낮은 저가 버림
                    dir = "up";
                    swingStart = j;
                    i = j + 1;
                    confirmed = true;
                    break;
                }
                if (bars[j].low < bars[cl].low) continue; // 저가 우선 — 저가 갱신을 확정보다 먼저
                if (bars[j].high >= bars[cl].low * up) {
                    raw.push({ kind: "low", idx: cl, confirmIdx: j });
                    dir = "up";
                    swingStart = j;
                    i = j + 1;
                    confirmed = true;
                    break;
                }
            }
            if (!confirmed) {
                raw.push({ kind: "low", idx: argminLow(swingStart, n - 1), confirmIdx: null });
                dir = null;
            }
        }
    }

    // cross 스캔(§2.5 재진술) + 누적은 구간 직합(prefix 없음 — 독립 산술).
    const cumTo = (to: number): string => {
        let s = 0n;
        for (let j = 0; j <= to; j++) s += bars[j].tv;
        return s.toString();
    };
    const markOf = (idx: number): GridBarMark => ({ min: bars[idx].min, tv: bars[idx].tv.toString(), cum: cumTo(idx) });
    let maxHigh = -Infinity;
    let prevLevelIdx = -1;
    let prevLevelPrice = 0;
    return raw.map((r) => {
        const price = r.kind === "high" ? bars[r.idx].high : bars[r.idx].low;
        let cross: GridBarMark | null = null;
        if (r.kind === "high") {
            if (r.confirmIdx !== null && price > maxHigh) {
                if (prevLevelIdx >= 0) {
                    let j = prevLevelIdx + 1;
                    while (j < n && !(bars[j].high > prevLevelPrice)) j++;
                    cross = markOf(j);
                }
                prevLevelIdx = r.idx;
                prevLevelPrice = price;
            }
            if (price > maxHigh) maxHigh = price;
        }
        return { kind: r.kind, min: bars[r.idx].min, price, confirmedMin: r.confirmIdx === null ? null : bars[r.confirmIdx].min, cum: cumTo(r.idx), cross };
    });
}

// ── G3: 마디 뷰 분류 ─────────────────────────────────────────────────────────
interface Pair {
    highMin: number;
    highPrice: number;
    confirmedMin: number | null;
    lowMin: number;
    lowPrice: number;
}

/** v8 피벗(교대 쌍) → 쌍 열. */
function pairsOfOld(pivots: GridPivot[]): Pair[] {
    const out: Pair[] = [];
    for (let i = 0; i + 1 < pivots.length; i += 2) {
        const h = pivots[i];
        const l = pivots[i + 1];
        out.push({ highMin: h.min, highPrice: h.price, confirmedMin: h.confirmedMin, lowMin: l.min, lowPrice: l.price });
    }
    return out;
}

const LOW_TOL = 0.0006; // 클래스 ② 허용 상대차(0.06% — 이론 상한 0.04% + 여유)

/** 쌍 비교 — "exact" | "lowUp"(클래스 ② 꼴: 고점 동일·저점만 v9 쪽이 높고 띠 안) | "diff". */
function cmpPair(o: Pair, v: Pair): "exact" | "lowUp" | "diff" {
    if (o.highMin !== v.highMin || o.highPrice !== v.highPrice || o.confirmedMin !== v.confirmedMin) return "diff";
    if (o.lowMin === v.lowMin && o.lowPrice === v.lowPrice) return "exact";
    if (v.lowPrice > o.lowPrice && (v.lowPrice - o.lowPrice) / o.lowPrice <= LOW_TOL) return "lowUp";
    return "diff";
}

type ChartClass = "equal" | "class1" | "class2" | "class1and2" | "unexplained";

function classify(oldPairs: Pair[], newPairs: Pair[]): { cls: ChartClass; lowUps: number; firstLevelDropPct: number | null } {
    // 뒤에서부터 정렬 — 클래스 ① 은 앞쪽(선행 국면)만 다르고 이후 전 쌍이 수렴한다.
    let i = oldPairs.length;
    let j = newPairs.length;
    let lowUps = 0;
    while (i > 0 && j > 0) {
        const c = cmpPair(oldPairs[i - 1], newPairs[j - 1]);
        if (c === "diff") break;
        if (c === "lowUp") lowUps++;
        i--;
        j--;
    }
    if (i === 0 && j === 0) return { cls: lowUps > 0 ? "class2" : "equal", lowUps, firstLevelDropPct: null };
    // 남은 접두: 옛 쪽 ≤ 1쌍(v8 의 첫 마디), 새 쪽 ≥ 1쌍(전부 옛 첫 마디 가격 이하) = 클래스 ①.
    if (i === 1 && j >= 1) {
        const h = oldPairs[0].highPrice;
        const allBelow = newPairs.slice(0, j).every((p) => p.highPrice <= h);
        if (allBelow) {
            const drop = ((h - newPairs[0].highPrice) / h) * 100;
            return { cls: lowUps > 0 ? "class1and2" : "class1", lowUps, firstLevelDropPct: drop };
        }
    }
    return { cls: "unexplained", lowUps, firstLevelDropPct: null };
}

// ── 메인 ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const oldRoot = strFlag("old");
    if (!oldRoot) throw new Error("--old <옛 v8 사본 경로> 필수");
    const newRoot = strFlag("new") ?? path.resolve(process.cwd(), ".cache/point-grid");

    const [oldFiles, newFiles] = await Promise.all([readDir<OldFile>(oldRoot), readDir<NewFile>(newRoot)]);
    console.log(`옛 ${oldFiles.size}일 / 현재 ${newFiles.size}일`);

    // G1·G2·G3 + 밴드 통계
    let charts = 0;
    let presence = 0;
    let g1Bad = 0;
    let g2Bad = 0;
    const g1Samples: unknown[] = [];
    const g2Samples: unknown[] = [];
    let entryItems = 0; // 밴드 진입 항목(high ≤ maxBefore) 수
    let breakoutItems = 0;
    let oldBytes = 0;
    let newBytes = 0;
    const clsCounts: Record<ChartClass, number> = { equal: 0, class1: 0, class2: 0, class1and2: 0, unexplained: 0 };
    const class1Set = new Set<string>();
    const class1Drops: number[] = [];
    const unexplainedSamples: unknown[] = [];
    const class1Samples: unknown[] = [];
    const g1Key = (g: OldGrid | PointGrid): string => JSON.stringify([g.base, g.touch, g.prevBase, g.prevBaseKrx, g.sessionHigh]);
    const nhKey = (e: Omit<GridNewHigh, "maxBefore">): string => JSON.stringify([e.min, e.open, e.high, e.low, e.close, e.tv, e.cum]);

    for (const [date, fNew] of newFiles) {
        const fOld = oldFiles.get(date);
        if (!fOld) {
            presence += Object.keys(fNew.charts).length;
            continue;
        }
        const codes = new Set([...Object.keys(fOld.charts), ...Object.keys(fNew.charts)]);
        for (const code of codes) {
            const gOld = fOld.charts[code]?.grid;
            const gNew = fNew.charts[code]?.grid;
            if (!gOld || !gNew) {
                presence++;
                continue;
            }
            charts++;
            oldBytes += JSON.stringify(gOld).length;
            newBytes += JSON.stringify(gNew).length;
            // G1 — 무변경 필드 비트 동일.
            if (g1Key(gOld) !== g1Key(gNew)) {
                g1Bad++;
                if (g1Samples.length < 10) g1Samples.push({ code, date, old: g1Key(gOld), now: g1Key(gNew) });
            }
            // G2 — 상단 돌파 부분열 = 옛 목록.
            const breakouts = gNew.newHighs.filter((e) => e.high > e.maxBefore);
            breakoutItems += breakouts.length;
            entryItems += gNew.newHighs.length - breakouts.length;
            const a = breakouts.map(nhKey).join("|");
            const b = gOld.newHighs.map(nhKey).join("|");
            if (a !== b) {
                g2Bad++;
                if (g2Samples.length < 10) g2Samples.push({ code, date, old: gOld.newHighs, breakouts });
            }
            // G3 — 마디 뷰 3분류.
            const oldPairs = pairsOfOld(gOld.pivots);
            let newPairs: Pair[];
            try {
                newPairs = levelViewOf(gNew).map((p) => ({ highMin: p.high.min, highPrice: p.high.price, confirmedMin: p.high.confirmedMin, lowMin: p.low.min, lowPrice: p.low.price }));
            } catch (err) {
                clsCounts.unexplained++;
                unexplainedSamples.push({ code, date, why: String(err) });
                continue;
            }
            const { cls, firstLevelDropPct } = classify(oldPairs, newPairs);
            clsCounts[cls]++;
            if (cls === "class1" || cls === "class1and2") {
                class1Set.add(`${code}|${date}`);
                if (firstLevelDropPct !== null) class1Drops.push(firstLevelDropPct);
                if (class1Samples.length < 20) class1Samples.push({ code, date, oldFirst: oldPairs[0], newFirst: newPairs[0], firstLevelDropPct });
            }
            if (cls === "unexplained" && unexplainedSamples.length < 20) unexplainedSamples.push({ code, date, oldPairs, newPairs });
        }
    }

    console.log(`\n── G1 무변경 필드(base·touch·sessionHigh·prevBase*) ──`);
    console.log(`차트 ${charts} · 불일치 ${g1Bad} ${g1Bad > 0 ? "⚠ 정지 신호" : "— 통과"}`);
    console.log(`\n── G2 상단 돌파 부분열 = v8 신고가 목록 ──`);
    console.log(`불일치 ${g2Bad} ${g2Bad > 0 ? "⚠ 정지 신호" : "— 통과"} · 돌파 ${breakoutItems} + 진입 ${entryItems} 항목 · raw ${(oldBytes / 1e6).toFixed(1)}MB → ${(newBytes / 1e6).toFixed(1)}MB`);
    console.log(`\n── G3 마디 뷰 3분류 ──`);
    const maxDrop = class1Drops.length ? Math.max(...class1Drops) : 0;
    console.log(
        `equal ${clsCounts.equal} · 클래스① ${clsCounts.class1}(+①② ${clsCounts.class1and2}, 첫 레벨 하락 최대 ${maxDrop.toFixed(3)}%) · 클래스② ${clsCounts.class2} · 그 밖 ${clsCounts.unexplained} ${clsCounts.unexplained > 0 ? "⚠ 정지 신호" : "— 통과"} · 존재차 ${presence}`,
    );

    // ── 2절: 표본 브루트포스 대조 — 분류 갈린 차트 전부 + 보폭 20 ─────────────
    const pool = createPoolFromEnv();
    const deps = axisDepsOf(pool);
    const targets = new Map<string, { code: string; date: string }>();
    for (const s of class1Samples as { code: string; date: string }[]) targets.set(`${s.code}|${s.date}`, s);
    for (const s of unexplainedSamples as { code: string; date: string }[]) if (s.code) targets.set(`${s.code}|${s.date}`, s);
    const allCharts: { code: string; date: string }[] = [];
    for (const [date, f] of newFiles) for (const code of Object.keys(f.charts)) allCharts.push({ code, date });
    let strideAdded = 0;
    for (let k = 0; strideAdded < 20 && k < allCharts.length; k += 97) {
        const c = allCharts[k];
        const key = `${c.code}|${c.date}`;
        if (!targets.has(key)) {
            targets.set(key, c);
            strideAdded++;
        }
    }
    let naiveOk = 0;
    const naiveBad: unknown[] = [];
    const shape = (p: NaivePivot | GridPivot) => [p.kind, p.min, p.price, p.confirmedMin, p.cum, p.cross ? [p.cross.min, p.cross.tv, p.cross.cum] : null];
    for (const { code, date } of targets.values()) {
        const minutes = await deps.minute.getMinuteCandles(code, date);
        const expected = naivePivots(minutes).map(shape);
        const actual = (newFiles.get(date)?.charts[code]?.grid.pivots ?? []).map(shape);
        if (JSON.stringify(expected) === JSON.stringify(actual)) naiveOk++;
        else naiveBad.push({ code, date, expected, actual });
    }
    console.log(`\n── 브루트포스(§2.2 재진술) 대조 ──`);
    console.log(`표본 ${targets.size}차트(보폭 ${strideAdded}/20): 일치 ${naiveOk} / 불일치 ${naiveBad.length} ${naiveBad.length > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    // ── 3절: 현재 전수 불변식(§2.7 ①~⑥) + ⑤ `>` 집합 ⊆ 클래스① + 밴드 전제 ──
    let invBad = 0;
    const invSamples: unknown[] = [];
    let pivotTotal = 0;
    const aboveNotClass1: string[] = [];
    let bandOrderBad = 0;
    for (const [date, f] of newFiles) {
        for (const [code, { grid }] of Object.entries(f.charts)) {
            pivotTotal += grid.pivots.length;
            const rep = checkGridInvariants(grid);
            if (rep.violations.length > 0) {
                invBad++;
                if (invSamples.length < 20) invSamples.push({ code, date, violations: rep.violations });
            }
            // ⑤ 의 `>`(세션 최고가가 피벗 밖) 차트는 클래스 ① 로 분류돼 있어야 한다 — 아니면 미분류 누락.
            // (옛 파일이 없어 분류 자체가 없던 차트(presence)는 제외.)
            if (rep.sessionHighAbovePivots && oldFiles.has(date) && oldFiles.get(date)!.charts[code] && !class1Set.has(`${code}|${date}`)) {
                aboveNotClass1.push(`${code}|${date}`);
            }
            let prevMax = -1;
            let prevBreakHigh = -Infinity;
            for (const e of grid.newHighs) {
                if (e.maxBefore < prevMax) bandOrderBad++;
                prevMax = e.maxBefore;
                if (e.high > e.maxBefore) {
                    if (e.high <= prevBreakHigh) bandOrderBad++;
                    prevBreakHigh = e.high;
                }
            }
        }
    }
    console.log(`\n── 현재 불변식(§2.7) ──`);
    console.log(`피벗 ${pivotTotal} · 위반 차트 ${invBad} · 밴드 전제 위반 ${bandOrderBad} ${invBad + bandOrderBad > 0 ? "⚠ 정지 신호" : "— 통과"}`);
    console.log(`⑤ '>' 인데 클래스① 미분류: ${aboveNotClass1.length}건 ${aboveNotClass1.length > 0 ? "⚠ 확인 필요" : "— 정합"}`);

    saveReport("grid-diff", {
        charts,
        presence,
        g1: { bad: g1Bad, samples: g1Samples },
        g2: { bad: g2Bad, breakoutItems, entryItems, oldBytes, newBytes, samples: g2Samples },
        g3: { counts: clsCounts, class1MaxDropPct: maxDrop, class1Samples, unexplainedSamples },
        naive: { sample: targets.size, ok: naiveOk, bad: naiveBad },
        invariants: { pivotTotal, invBad, invSamples, bandOrderBad, aboveNotClass1 },
    });
    await pool.end();
}

main().catch((err) => {
    console.error("❌ grid-diff 실패", err);
    process.exit(1);
});
