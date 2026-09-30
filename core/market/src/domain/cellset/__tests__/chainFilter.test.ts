// 사슬 필터 식 — 순번은 **붙은 자리**가 뜻이다(칩·괄호·식 전체), 순번 셈은 단락하지 않는다, 사슬마다 새로 센다.
import { describe, expect, it, vi } from "vitest";
import type { ChainBar } from "../breakoutChain.js";
import {
    absorbChainGroup,
    canRemoveChainTerm,
    chainCandidatesOf,
    chainFilterKey,
    chainUsesTheme,
    chainVerdicts,
    parseChainFilter,
    type ChainCond,
    type ChainFilter,
    type ChainFilterSeries,
    type ChainTerm,
} from "../chainFilter.js";
import { pruneFlat, type FlatGroup, type Op } from "../../expr/flatExpr.js";
import { kstToUnix } from "../../kst.js";
import { DEFAULT_THEME_ZONE, themeCutsOff, type ThemeAnswer, type ThemeZoneParams } from "../themeZone.js";

// 한 사슬 봉 8개 — 대금≥50억: 1·3·4·6 / 양봉: 0·2·3·5·6·7 / 세션고가: 0·2·5.
const AMT = [20, 60, 20, 60, 60, 20, 60, 20];
const BULL = [1, 0, 1, 1, 0, 1, 1, 1];
const SH = [1, 0, 1, 0, 0, 1, 0, 0];
// 봉 시각 — 봉 i = 09:00 + i분(KST).
const T900 = kstToUnix("2026-09-16", "09:00:00");
const s: ChainFilterSeries = {
    times: AMT.map((_, i) => T900 + i * 60),
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
const pick = (flt: ChainFilter, b = bars()) => chainCandidatesOf(b, s, flt)!.map((x) => x.i);

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
        const v = chainVerdicts(bars(), s, f([t("a", AMOUNT)], [], [], 2))!;
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

describe("시각 — 줄 서기에서 뺀다(2026-09-27)", () => {
    // 봉 0~7 = 09:00~09:07. 대금≥50억: 1(09:01)·3(09:03)·4·6.
    const TIME = (from: string, to: string): ChainCond => ({ kind: "time", ranges: [{ from, to }] });

    it("NOT 시각 09:00~09:02 + 꼬리 처음 1 = 09:03 이후 첫 봉(3) — 뺀 봉은 순번 자리를 안 차지한다", () => {
        expect(pick(f([t("x", TIME("09:00", "09:02"), { neg: true })], [], [], 1))).toEqual([3]);
    });

    it("NOT 없이 + 칩 순번 — 「09:03~09:07 안 50억 봉 중 처음 1」 = 3", () => {
        expect(pick(f([t("x", TIME("09:03", "09:07")), t("a", AMOUNT)], ["and"], [{ from: 0, to: 1, firstK: 1 }]))).toEqual([3]);
    });

    it("판정 키가 시각 구간을 가른다(엔진 후보 메모가 섞이지 않게)", () => {
        const a = f([t("x", TIME("09:00", "09:02"), { neg: true })], [], [], 1);
        const b = f([t("x", TIME("09:00", "09:03"), { neg: true })], [], [], 1);
        expect(chainFilterKey(a)).not.toBe(chainFilterKey(b));
    });

    it("구간 여럿 = OR(양끝 포함) — NOT(09:00~09:01 · 09:03~09:04) AND 대금≥50억 → 6", () => {
        const c: ChainCond = { kind: "time", ranges: [{ from: "09:00", to: "09:01" }, { from: "09:03", to: "09:04" }] };
        expect(pick(f([t("x", c, { neg: true }), t("a", AMOUNT)], ["and"]))).toEqual([6]);
    });

    it("뺀 봉도 사슬 안 순번(pos)은 그대로다 — 봉 순번 ≥ 3 은 여전히 봉 3부터", () => {
        expect(pick(f([t("x", TIME("09:00", "09:02"), { neg: true }), t("p", { kind: "pos", min: 3 })], ["and"]))).toEqual([3, 4, 5, 6, 7]);
    });

    it("파서 — 못 읽는 구간만 떨어지고 뒤집힌 구간은 뒤집는다, 구간이 없으면 항이 떨어진다", () => {
        const raw = (ranges: unknown) => ({ expr: { of: [{ kind: "check", id: "x", cond: { kind: "time", ranges } }] }, firstK: 1 });
        expect(parseChainFilter(raw([{ from: "09:02", to: "09:00" }, { from: "9:00", to: "x" }])).expr.of[0]!.cond)
            .toEqual({ kind: "time", ranges: [{ from: "09:00", to: "09:02" }] });
        expect(parseChainFilter(raw([])).expr.of).toEqual([]);
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

describe("테마 칩 — 조건판 테마와 한 벌(2026-09-30)", () => {
    // 봉 0~7 = 09:00~09:07 → 자정기준 분 540~547. 테마는 09:03(543) 부터 통과.
    const THEME: ChainCond = { kind: "theme", ...DEFAULT_THEME_ZONE };
    const ans = (pass: boolean): ThemeAnswer => ({ pass, zoneRank: null, theme: null });
    const mat = (fn: (min: number, p: ThemeZoneParams) => ThemeAnswer | null) => ({ themeAt: vi.fn(fn) });
    const from903 = () => mat((min) => ans(min >= 543));

    it("「테마 · 처음 1」 = 사슬 안에서 처음 존을 만족한 봉(3)", () => {
        expect(chainCandidatesOf(bars(), s, f([t("th", THEME, { firstK: 1 })], []), from903())!.map((x) => x.i)).toEqual([3]);
    });

    it("「대금≥50억 AND 테마」 · 꼬리 처음 1 = 둘 다인 첫 봉(3) — 대금 탈락 봉은 테마를 안 부른다", () => {
        const m = from903();
        expect(chainCandidatesOf(bars(), s, f([t("a", AMOUNT), t("th", THEME)], ["and"], [], 1), m)!.map((x) => x.i)).toEqual([3]);
        // 대금≥50억 봉 = 1·3·4·6 → 테마 호출은 그 넷뿐.
        expect(m.themeAt.mock.calls.map((c) => c[0])).toEqual([541, 543, 544, 546]);
    });

    it("순번 붙은 테마 칩은 결과가 정해져도 늘 센다 — 「대금≥50억 AND 테마·처음1」", () => {
        const m = from903();
        // 테마 첫 통과 봉 = 3(대금 60 → 통과). 대금 탈락 봉(0·2)에서도 테마를 세야 뜻이 선다.
        expect(chainCandidatesOf(bars(), s, f([t("a", AMOUNT), t("th", THEME, { firstK: 1 })], ["and"]), m)!.map((x) => x.i)).toEqual([3]);
        expect(m.themeAt).toHaveBeenCalledTimes(8);
    });

    it("순번 든 칩이 순번 없는 괄호 안에 있고 앞 형제가 결과를 정해도 늘 센다 — 세션고가 OR (양봉 AND 대금·처음1)", () => {
        // 세션고가 = 0·2·5 → OR 가 참으로 정해진 봉에서도 괄호 속 「대금·처음1」은 센다: 첫 50억 봉 = 1(음봉) → 괄호는 영영 거짓.
        const e = f([t("s", SESS), t("b", BULLC), t("a", AMOUNT, { firstK: 1 })], ["or", "and"], [{ from: 1, to: 2 }]);
        expect(pick(e)).toEqual([0, 2, 5]);
        // 봉 1 이 세션고가여서 OR 가 먼저 정해져도 괄호 속 「대금·처음1」은 봉 1 에서 소모된다 — 봉 3(양봉·60억)은 괄호로 안 뽑힌다.
        const s2 = bars().map((b) => (b.i === 1 ? { ...b, sessionHigh: true } : b));
        expect(pick(e, s2)).toEqual([0, 1, 2, 5]);
    });

    it("재료 없음·모름은 그 종목 판정 전체가 모름(null) — NOT 테마가 전부 통과라고 거짓말하지 않게", () => {
        const neg = f([t("th", THEME, { neg: true })], []);
        expect(chainVerdicts(bars(), s, neg)).toBeNull();
        expect(chainVerdicts(bars(), s, neg, mat((min) => (min === 545 ? null : ans(false))))).toBeNull();
        expect(chainCandidatesOf(bars(), s, neg, mat(() => ans(false)))!.map((x) => x.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("컷이 안 켜진 칩 = 조건 아님(참) — 재료를 부르지도 않고, 없어도 모름이 아니다", () => {
        const off: ChainCond = { kind: "theme", ...DEFAULT_THEME_ZONE, ...themeCutsOff(), enter: true };
        const flt = f([t("th", off)], []);
        expect(chainUsesTheme(flt)).toBe(false);
        expect(pick(flt)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("파서 왕복 · 키는 필드 순서에 불변", () => {
        const flt = f([t("th", { ...THEME, count: { on: true, min: 3, max: 5 } }, { firstK: 1 })], []);
        const back = parseChainFilter(JSON.parse(JSON.stringify(flt)));
        expect(back.expr.of[0]!.cond).toEqual({ ...THEME, count: { on: true, min: 3, max: 5 } });
        const cond = flt.expr.of[0]!.cond;
        const reversed = Object.fromEntries(Object.entries(cond).reverse()) as ChainCond;
        const shuffled = f([t("th", reversed, { firstK: 1 })], []);
        expect(chainFilterKey(shuffled)).toBe(chainFilterKey(flt));
    });
});
