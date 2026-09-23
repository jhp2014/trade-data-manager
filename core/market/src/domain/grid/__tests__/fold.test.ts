// foldGrid — 1% 로 구운 날짜 격자를 읽기 시점에 p% 로 접는다(decisions.md 「하루 타점 — 서버가 날짜
// 격자를 굽고 클라가 조건으로 뽑는다」). 근사를 감수하지만 **깨짐 0** 은 하한이다: 접은 격자가 구조
// 불변식을 어기거나 레벨 뷰·타점 판정이 throw 하면 그 종목의 하루가 통째로 사라진다.
// 실데이터 대조(직접 p% 와의 사라짐·생김·확정 시각 차)는 apps/api/recon/06-day-fold.ts 가 맡는다.
import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "../../candle/model.js";
import { DAY_GRID_DETECT_OPTIONS, detectGrid, minuteToHms, type PointGrid } from "../grid.js";
import { foldGrid } from "../fold.js";
import { checkGridInvariants } from "../invariants.js";
import { levelViewOf } from "../levelView.js";
import { DEFAULT_POINT_DEFINITION, pointsOf } from "../points.js";

const D = "2026-07-01";
const mc = (time: string, o: number, h: number, l: number, c: number, vol = 0): MinuteCandle => ({
    stockCode: "005930",
    date: D,
    time,
    krx: null,
    un: { open: String(o), high: String(h), low: String(l), close: String(c), volume: String(vol) },
});
const PX = { base: null, prevBase: 10000, prevBaseKrx: 10000 };
const shape = (g: PointGrid) => g.pivots.map((p) => `${p.kind}@${p.min}=${p.price}`);

describe("foldGrid — 항등", () => {
    it("pct ≤ 굽기 zigzag 면 원본을 그대로 돌려준다(더 가늘게는 못 접는다)", () => {
        const g = detectGrid([mc("09:00:00", 100, 100, 100, 100, 1), mc("09:01:00", 102, 102, 102, 102, 1)], PX, DAY_GRID_DETECT_OPTIONS)!;
        expect(foldGrid(g, 1).grid).toBe(g);
        expect(foldGrid(g, 0.5).grid).toBe(g);
    });
});

describe("foldGrid — 깨끗한 경로", () => {
    // 한 가격 봉 17개(09:00~). 직접 2% = 저0 · 고6 · 저8 · 고13 · 저15(꼬리).
    // 1% 는 그 사이에 고3·저4·고10·저11 을 더 둔다. 저8·저15 는 사건이 아닌 피벗(±∞ 갈래를 태운다).
    const prices = [10000, 10100, 10200, 10300, 10180, 10250, 10400, 10150, 10050, 10200, 10500, 10380, 10450, 10600, 10300, 10250, 10350];
    const bars = prices.map((p, i) => mc(minuteToHms(540 + i), p, p, p, p, 1000));
    const g1 = detectGrid(bars, PX, DAY_GRID_DETECT_OPTIONS)!;
    const g2 = detectGrid(bars, PX, { ...DAY_GRID_DETECT_OPTIONS, zigzagPct: 2 })!;

    it("전제 — 1% 격자가 2% 보다 가늘다", () => {
        expect(g1.pivots.length).toBeGreaterThan(g2.pivots.length);
    });

    it("접은 2% = 직전 2% (종류·시각·가격)", () => {
        const { grid, crossTvUnknown } = foldGrid(g1, 2);
        expect(shape(grid)).toEqual(shape(g2));
        expect(crossTvUnknown).toBe(0);
        // 크로싱은 갱신 사건이라 봉 기록(시각·대금·누적)까지 같다.
        expect(grid.pivots.map((p) => p.cross)).toEqual(g2.pivots.map((p) => p.cross));
    });

    it("확정 시각은 이른 경계 — 극값보다 뒤, 직접 2% 보다 늦지 않다", () => {
        const { grid } = foldGrid(g1, 2);
        grid.pivots.forEach((p, i) => {
            const d = g2.pivots[i].confirmedMin;
            if (d === null) return expect(p.confirmedMin).toBeNull();
            expect(p.confirmedMin).not.toBeNull();
            expect(p.confirmedMin!).toBeGreaterThan(p.min);
            expect(p.confirmedMin!).toBeLessThanOrEqual(d);
        });
    });

    it("피벗 밖은 원본 그대로 — 사건·세션 최고가·기준가", () => {
        const { grid } = foldGrid(g1, 2);
        expect(grid.newHighs).toBe(g1.newHighs);
        expect(grid.sessionHigh).toEqual(g1.sessionHigh);
        expect(grid.prevBase).toBe(g1.prevBase);
    });
});

/** 결정적 난수(mulberry32) — 실패를 시드로 재현한다. */
const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * 랜덤 워크 하루 — 봉 폭·추세·거래 공백(빈 분)을 섞는다. 가격은 정수 원.
 * `classOne`: 첫 봉을 아래꼬리 긴 장대(저가 −10%, 고가 +0.4%)로 연다 — 선행 국면이 저점 확정으로
 * 끝나 세션 최고가가 피벗이 못 되는 **클래스 ①** 을 태운다(없으면 300 시드에서 0건).
 */
function walkDay(seed: number, classOne: boolean): MinuteCandle[] {
    const r = rng(seed);
    const vol = 0.002 + r() * 0.01; // 분당 변동폭
    const drift = (r() - 0.45) * 0.002;
    const out: MinuteCandle[] = [];
    let p = 5000 + Math.floor(r() * 20000);
    if (classOne) out.push(mc(minuteToHms(480), Math.round(p * 0.9), Math.round(p * 1.004), Math.round(p * 0.9), p, 1000));
    for (let m = classOne ? 481 : 480; m <= 1200; m++) {
        if (r() < 0.15) continue; // 거래 없는 분 — densify 채움봉 갈래
        const o = p;
        const c = Math.max(100, Math.round(p * (1 + drift + (r() - 0.5) * 2 * vol)));
        const h = Math.max(o, c) + Math.round(p * r() * vol);
        const l = Math.max(1, Math.min(o, c) - Math.round(p * r() * vol));
        out.push(mc(minuteToHms(m), o, h, l, c, Math.floor(r() * 3_000_000)));
        p = c;
    }
    return out;
}

describe("foldGrid — 깨짐 0 (랜덤 워크 성질)", () => {
    it("접은 격자가 불변식 ①②④⑤⑥ 을 지키고 레벨 뷰·타점 판정이 throw 하지 않는다", () => {
        let folded = 0;
        let classOne = 0;
        for (let seed = 1; seed <= 300; seed++) {
            const bars = walkDay(seed, seed % 2 === 0);
            const syn = Math.round(Number(bars[0].un.high) * 1.03);
            for (const base of [null, syn]) {
                const g1 = detectGrid(bars, { ...PX, base }, DAY_GRID_DETECT_OPTIONS);
                if (g1 === null) continue;
                for (const pct of [2, 3, 5]) {
                    const { grid } = foldGrid(g1, pct);
                    const rep = checkGridInvariants(grid);
                    expect(rep.violations, `seed=${seed} base=${base} pct=${pct}`).toEqual([]);
                    if (rep.sessionHighAbovePivots) classOne++;
                    expect(() => levelViewOf(grid)).not.toThrow();
                    for (const onePerLevel of [true, false]) {
                        expect(() => pointsOf(grid, { ...DEFAULT_POINT_DEFINITION, baselineGateEok: 0, renewalGateEok: 0 }, { onePerLevel })).not.toThrow();
                    }
                    folded++;
                }
            }
        }
        expect(folded).toBeGreaterThan(1500);
        expect(classOne).toBeGreaterThan(0); // 클래스 ① 갈래를 실제로 태웠다
    });
});
