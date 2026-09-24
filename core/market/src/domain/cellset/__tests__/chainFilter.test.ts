// 사슬 필터 식 — 순번은 **붙은 자리**가 뜻이다(칩·괄호·식 전체), 순번 셈은 단락하지 않는다, 사슬마다 새로 센다.
import { describe, expect, it } from "vitest";
import type { ChainBar, ChainSeries } from "../breakoutChain.js";
import {
    absorbChainGroup,
    canRemoveChainTerm,
    chainCandidatesOf,
    chainVerdicts,
    parseChainFilter,
    type ChainCond,
    type ChainFilter,
    type ChainTerm,
} from "../chainFilter.js";
import { pruneFlat, type FlatGroup, type Op } from "../../expr/flatExpr.js";

// 한 사슬 봉 8개 — 대금≥50억: 1·3·4·6 / 양봉: 0·2·3·5·6·7 / 세션고가: 0·2·5.
const AMT = [20, 60, 20, 60, 60, 20, 60, 20];
const BULL = [1, 0, 1, 1, 0, 1, 1, 1];
const SH = [1, 0, 1, 0, 0, 1, 0, 0];
const s: ChainSeries = {
    minuteOpen: AMT.map(() => 0),
    minuteHigh: AMT.map(() => 1),
    minuteLow: AMT.map(() => -1),
    rate: BULL.map((b) => (b ? 0.5 : -0.5)),
    cumAmount: AMT.map((_, i) => AMT.slice(0, i + 1).reduce((a, b) => a + b, 0) * 1e8),
};
const bars = (chainOf: (i: number) => number = () => 0): ChainBar[] =>
    AMT.map((a, i) => ({ i, tv: a * 1e8, chain: chainOf(i), pos: i, label: i >= 6 ? "baseline" : "high", sessionHigh: SH[i] === 1 }));

const AMOUNT: ChainCond = { kind: "amount", minEok: 50 };
const BULLC: ChainCond = { kind: "openClose", min: 0.0001 };
const SESS: ChainCond = { kind: "sessionHigh" };
const t = (id: string, cond: ChainCond, x: { neg?: boolean; firstK?: number } = {}): ChainTerm => ({ kind: "check", id, cond, ...x });
const f = (of: ChainTerm[], ops: Op[], groups: FlatGroup[] = [], firstK: number | null = null): ChainFilter =>
    ({ expr: { id: "chain", of, ops, groups }, firstK });
const pick = (flt: ChainFilter, b = bars()) => chainCandidatesOf(b, s, flt).map((x) => x.i);

describe("순번의 자리가 뜻이다", () => {
    it("① 칩 순번 — 「첫 50억 봉이 양봉이면」: 첫 50억 봉(1)이 음봉 → 없음", () => {
        expect(pick(f([t("a", AMOUNT, { firstK: 1 }), t("b", BULLC)], ["and"]))).toEqual([]);
    });

    it("② 괄호 순번 — 「50억이면서 양봉인 첫 봉」 → 3", () => {
        expect(pick(f([t("a", AMOUNT), t("b", BULLC)], ["and"], [{ from: 0, to: 1, firstK: 1 }]))).toEqual([3]);
    });

    it("③ 칩마다 순번 + OR — 「첫 50억 봉 또는 첫 세션고가 봉」 → 0, 1", () => {
        const e = f([t("a", AMOUNT, { firstK: 1 }), t("b", SESS, { firstK: 1 })], ["or"]);
        expect(pick(e)).toEqual([0, 1]);
        // 식 전체 순번(꼬리)이 처음 1이면 그중 첫 봉만.
        expect(pick({ ...e, firstK: 1 })).toEqual([0]);
    });

    it("순번이 먼저, NOT 이 나중 — NOT(대금≥50억 · 처음 1) = 첫 50억 봉만 뺀 나머지", () => {
        expect(pick(f([t("a", AMOUNT, { firstK: 1, neg: true })], []))).toEqual([0, 2, 3, 4, 5, 6, 7]);
    });

    it("순번 셈은 단락하지 않는다 — 「양봉 AND 대금≥50억·처음1」 은 여전히 첫 50억 봉(1)을 센다", () => {
        // 단락이면 양봉 봉에서만 50억을 세어 3 이 뽑힌다 — 그건 ② 의 뜻이다.
        expect(pick(f([t("b", BULLC), t("a", AMOUNT, { firstK: 1 })], ["and"]))).toEqual([]);
    });

    it("순번은 사슬마다 새로 센다", () => {
        const two = bars((i) => (i < 4 ? 0 : 1)); // 사슬 0 = 봉 0~3, 사슬 1 = 봉 4~7
        expect(pick(f([t("a", AMOUNT, { firstK: 1 })], []), two)).toEqual([1, 4]);
    });
});

describe("식 전체", () => {
    it("빈 식 — 꼬리 처음 1 = 사슬 첫 봉, 전부 = 사슬 봉 전부", () => {
        expect(pick(f([], [], [], 1))).toEqual([0]);
        expect(pick(f([], []))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("꼬리 순번은 식을 통과한 봉끼리 센다(rank)", () => {
        const v = chainVerdicts(bars(), s, f([t("a", AMOUNT)], [], [], 2));
        expect(v.map((x) => x.rank)).toEqual([null, 0, null, 1, 2, null, 3, null]);
        expect(v.filter((x) => x.picked).map((x) => x.bar.i)).toEqual([1, 3]);
    });

    it("이름표는 식의 조건 — 기준선(봉 6·7)만", () => {
        expect(pick(f([t("l", { kind: "label", label: "baseline" })], []))).toEqual([6, 7]);
    });

    it("AND/OR/NOT 괄호 — 대금≥50억 AND NOT(세션고가 OR 양봉)", () => {
        const e = f([t("a", AMOUNT), t("b", SESS), t("c", BULLC)], ["and", "or"], [{ from: 1, to: 2, neg: true }]);
        expect(pick(e)).toEqual([1, 4]);
    });
});

describe("항 빼기 — 수식어는 남은 항으로 내려앉는다", () => {
    it("순번 괄호가 한 항으로 줄면 순번은 min 으로 그 항에", () => {
        const e = f([t("a", AMOUNT, { firstK: 2 }), t("b", BULLC)], ["and"], [{ from: 0, to: 1, firstK: 1 }]).expr;
        const left = pruneFlat(e, (x) => x.id !== "b", absorbChainGroup);
        expect(left.of).toEqual([t("a", AMOUNT, { firstK: 1 })]);
        expect(left.groups).toEqual([]);
    });

    it("괄호 NOT + 순번이 한 항으로 줄면 순번이 먼저, NOT 이 나중으로 그 항에 앉는다(뜻이 같다)", () => {
        const e = f([t("a", AMOUNT), t("b", BULLC)], ["and"], [{ from: 0, to: 1, neg: true, firstK: 1 }]).expr;
        const left = pruneFlat(e, (x) => x.id !== "b", absorbChainGroup);
        expect(left.of).toEqual([t("a", AMOUNT, { firstK: 1, neg: true })]);
        // NOT(대금≥50억 · 처음1) 과 같은 결과
        expect(pick({ expr: left, firstK: null })).toEqual([0, 2, 3, 4, 5, 6, 7]);
    });

    it("괄호 순번 — 순번이 먼저, NOT 이 나중(괄호 판)", () => {
        const e = f([t("a", AMOUNT), t("b", BULLC)], ["and"], [{ from: 0, to: 1, neg: true, firstK: 1 }]);
        // (50억 AND 양봉) 의 첫 봉 = 3 → NOT → 3 만 빠진다
        expect(pick(e)).toEqual([0, 1, 2, 4, 5, 6, 7]);
    });

    it("남는 항이 NOT 이면 순번이 갈 곳이 없다 — 빼기를 막는다", () => {
        const e = f([t("a", AMOUNT, { neg: true }), t("b", BULLC)], ["and"], [{ from: 0, to: 1, firstK: 1 }]).expr;
        expect(canRemoveChainTerm(e, "b")).toBe(false);
        expect(canRemoveChainTerm(e, "a")).toBe(true);
    });
});

describe("parseChainFilter", () => {
    it("못 읽는 항만 떨어지고 연산자는 원래 자리로 되짚는다", () => {
        const raw = {
            expr: { id: "chain", of: [{ kind: "check", id: "a", cond: AMOUNT }, { kind: "check", id: "x", cond: { kind: "??" } }, { kind: "check", id: "b", cond: SESS }], ops: ["and", "or"], groups: [] },
            firstK: 3,
        };
        const p = parseChainFilter(raw);
        expect(p.expr.of.map((x) => x.id)).toEqual(["a", "b"]);
        expect(p.expr.ops).toEqual(["or"]);
        expect(p.firstK).toBe(3);
    });

    it("없거나 겹친 항 id 는 자리로 짓는다 — 순번 셈의 키라 유일하고, 두 번 읽어도 같다(결정적)", () => {
        const raw = { expr: { of: [{ kind: "check", id: "a", cond: AMOUNT }, { kind: "check", id: "a", cond: SESS }, { kind: "check", cond: SESS }], ops: ["and", "and"], groups: [] }, firstK: 1 };
        const ids = parseChainFilter(raw).expr.of.map((x) => x.id);
        expect(new Set(ids).size).toBe(3);
        expect(parseChainFilter(raw).expr.of.map((x) => x.id)).toEqual(ids);
    });

    it("항이 떨어져 수식어 괄호가 한 항으로 줄면 수식어가 그 항으로 내려앉는다(파싱)", () => {
        const raw = {
            expr: { of: [{ kind: "check", id: "a", cond: AMOUNT }, { kind: "check", id: "x", cond: { kind: "??" } }], ops: ["and"], groups: [{ from: 0, to: 1, firstK: 2 }] },
            firstK: 1,
        };
        expect(parseChainFilter(raw).expr.of).toEqual([t("a", AMOUNT, { firstK: 2 })]);
    });

    it("없으면 기본(처음 1), 꼬리 null = 전부, 하한 > 상한은 뒤집는다", () => {
        expect(parseChainFilter(undefined).firstK).toBe(1);
        expect(parseChainFilter({ expr: { of: [] }, firstK: null }).firstK).toBeNull();
        const r = parseChainFilter({ expr: { of: [{ kind: "check", id: "p", cond: { kind: "pos", min: 5, max: 2 } }] }, firstK: 1 });
        expect(r.expr.of[0]!.cond).toEqual({ kind: "pos", min: 2, max: 5 });
    });
});
