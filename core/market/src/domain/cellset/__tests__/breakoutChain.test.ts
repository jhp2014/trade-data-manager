// 돌파 사슬 — decisions 「Daily 타점 생성 = 돌파 사슬」의 규칙을 봉 단위로 못 박는다.
// 픽스처는 % (기준가 대비) — 가격 비 = 1 + %/100.
import { describe, expect, it } from "vitest";
import { baselinePctOf, breakoutChainsOf, type ChainSeries } from "../breakoutChain.js";

/** [고가%, 저가%, 분 대금(억)] 열 → 시리즈. 대금 0 = 거래 없는 채움봉. */
function series(bars: [number, number, number][]): ChainSeries {
    let cum = 0;
    return {
        minuteHigh: bars.map((b) => b[0]),
        minuteLow: bars.map((b) => b[1]),
        cumAmount: bars.map((b) => (cum += b[2] * 1e8)),
    };
}
const K = { zigzagPct: 2, bandPct: 1 };
const idx = (r: ReturnType<typeof breakoutChainsOf>) => r.candidates.map((c) => c.i);

describe("대금 사다리 — 사슬 안에선 새 고가가 필요 없다", () => {
    const s = series([
        [0, -0.5, 20], // 0 첫 봉 = 사건 → 사슬 0 시작
        [-0.2, -0.8, 50], // 1 새 고가 아님 · 50 ≥ 20 → 후보
        [0.3, 0, 40], // 2 새 고가지만 40 < 50 → 아님
        [0.1, -0.3, 60], // 3 60 ≥ 50 → 후보
        [0.2, -1.8, 70], // 4 저가 ≤ 고점(0.3)×0.98 → 사슬 끝(대금이 커도 후보 아님)
    ]);
    const r = breakoutChainsOf(s, null, K);

    it("후보 = 첫 사건 + 사다리 통과 봉", () => {
        expect(idx(r)).toEqual([0, 1, 3]);
        expect(r.candidates.map((c) => c.seq)).toEqual([0, 1, 2]);
    });

    it("사슬 끝 = zigzag 만큼 눌린 봉, 고점은 사슬 최고가", () => {
        expect(r.chains).toEqual([{ start: 0, end: 4, high: expect.closeTo(0.3, 9), baselineFrom: null }]);
    });

    it("같은 대금은 통과(≥)", () => {
        const eq = breakoutChainsOf(series([[0, -0.5, 20], [0.1, 0, 20]]), null, K);
        expect(idx(eq)).toEqual([0, 1]);
    });
});

describe("러닝 최고가 밴드", () => {
    it("(2) 하단 터치로 좁아진 밴드는 **같은 가격 터치**부터 다시 사건", () => {
        const s = series([
            [0, -0.5, 20], // 0 사건·사슬 시작 · 상단 0
            [-0.5, -3, 10], // 1 사슬 끝(−3% ≤ −2%) · 고가 −0.5 ≥ 하단(−1%) → 하단 −0.5 로 좁힘
            [-0.6, -1, 10], // 2 −0.6 < 좁아진 하단 −0.5 → 무사건
            [-0.5, -1, 10], // 3 같은 가격 터치 → 사건 → 사슬 1
        ]);
        const r = breakoutChainsOf(s, null, K, { trace: true });
        expect(idx(r)).toEqual([0, 3]);
        expect(r.trace!.bottom[1]).toBeCloseTo(-0.5, 9);
    });

    it("(3) 상단 **터치**면 하단이 다시 벌어진다(좁힘이 아니라 재설정)", () => {
        const s = series([
            [0, -0.5, 20], // 0 사슬 0 · 상단 0 · 하단 −1
            [-0.3, -0.5, 10], // 1 좁힘 → 하단 −0.3
            [0, -0.2, 10], // 2 상단 터치 → 하단 = 0×(1−1%) = −1 로 재설정
            [-1.5, -2.5, 10], // 3 사슬 끝 · −1.5 < −1 무사건
            [-0.8, -1.2, 10], // 4 −0.8 ≥ −1 → 사건(좁힘으로 처리했다면 하단 0 이라 아님)
        ]);
        const r = breakoutChainsOf(s, null, K);
        expect(r.chains.map((c) => c.start)).toEqual([0, 4]);
    });

    it("사슬을 끝낸 봉은 사건이어도 새 사슬을 못 연다", () => {
        const s = series([
            [0, -0.5, 20],
            [-0.5, -3, 10], // 좁힘 사건이지만 끝낸 봉
        ]);
        expect(breakoutChainsOf(s, null, K).chains).toHaveLength(1);
    });

    it("새 고가를 만든 봉은 저가가 깊어도 끝 검사를 안 한다(고가 우선)", () => {
        const s = series([[0, -0.5, 20], [0.5, -3, 10], [0.4, 0.2, 30]]);
        const r = breakoutChainsOf(s, null, K);
        expect(r.chains[0]!.end).toBeNull();
        expect(idx(r)).toEqual([0, 2]);
    });

    it("거래 없는 봉(분 대금 0)은 아무것도 아니다 — 사슬 끝도 후보도 아니다", () => {
        const s = series([[0, -0.5, 20], [-5, -5, 0], [0.1, 0, 30]]);
        const r = breakoutChainsOf(s, null, K);
        expect(r.chains[0]!.end).toBeNull();
        expect(idx(r)).toEqual([0, 2]);
    });
});

describe("기준선 밴드 — 이름표는 사슬 단위, 도중 합류", () => {
    // 기준선 3% · 밴드 1% → 기준선 밴드 [1.97.., 3].
    const s = series([
        [0, -0.5, 10], // 0 러닝 사건 → 「고가 돌파」 사슬
        [1, 0.5, 30], // 1 후보(고가)
        [2, 1.5, 40], // 2 기준선 밴드 하단(≈1.97) 돌파 → 이 봉부터 「기준선 돌파」
        [3.2, 2, 50], // 3 B 돌파 → 기준선 밴드 소멸(사건)
        [3, 1, 5], // 4 사슬 끝(1.0 ≤ 3.2 → ×0.98)
        [3.2, 3, 60], // 5 상단 터치 → 새 사슬 — 기준선은 이미 없다 → 「고가 돌파」
    ]);
    const r = breakoutChainsOf(s, 3, K);

    it("합류 전은 고가, 합류 봉부터 끝까지 기준선, 소멸 뒤 사슬은 고가", () => {
        expect(r.candidates.map((c) => [c.i, c.label])).toEqual([
            [0, "high"], [1, "high"], [2, "baseline"], [3, "baseline"], [5, "high"],
        ]);
        expect(r.chains[0]!.baselineFrom).toBe(2);
        expect(r.chains[1]!.baselineFrom).toBeNull();
    });

    it("기준선 밴드에서 시작한 사슬은 처음부터 기준선", () => {
        const t = series([
            [0, -0.5, 10], // 사슬 0(고가)
            [-0.5, -3, 5], // 끝
            [2.5, 0, 20], // 러닝 상단 돌파 ∧ 기준선 밴드 하단 돌파 → 둘 다 사건 → 기준선이 이긴다
        ]);
        const r2 = breakoutChainsOf(t, 3, K);
        expect(r2.candidates.at(-1)).toMatchObject({ i: 2, label: "baseline", seq: 0 });
    });

    it("첫 봉이 통째로 기준선 위(갭)면 사건 없이 소멸", () => {
        const r3 = breakoutChainsOf(series([[3, 2, 10], [3.5, 3, 20]]), 1, K, { trace: true });
        expect(r3.candidates.every((c) => c.label === "high")).toBe(true);
        expect(r3.trace!.baseBottom).toEqual([null, null]);
    });

    it("기준선 없음 = 전부 고가 돌파", () => {
        expect(breakoutChainsOf(s, null, K).candidates.every((c) => c.label === "high")).toBe(true);
    });
});

describe("baselinePctOf — 분봉 % 와 같은 식·같은 반올림", () => {
    it("같은 가격이면 분봉 % 와 같은 값 — 터치가 잡힌다", () => {
        const base = 12_340;
        const price = 12_710;
        const minutePct = Math.round(((price - base) / base) * 100 * 100) / 100;
        expect(baselinePctOf(price, base)).toBe(minutePct);
        expect(baselinePctOf(null, base)).toBeNull();
        expect(baselinePctOf(price, null)).toBeNull();
    });
});
