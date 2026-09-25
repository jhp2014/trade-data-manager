import { describe, it, expect } from "vitest";
import { toCellExpr, usesCellPred } from "../useCellSet.js";
import { exprOfStages, type SetExpr, type SetTerm } from "../expr.js";
import type { FilterStage } from "../stage.js";
import { UNLINKED_GRID, gridLinkDeficiency } from "../../dailyGen/gridLink.js";

/** 연산자가 균일한 식 — 괄호가 없는 줄(대부분의 검사가 이 모양이다). */
const mk = (op: "and" | "or", id: string, of: SetTerm[]): SetExpr => ({ id, of, ops: of.slice(1).map(() => op), groups: [] });

// 좁히기(종단 어휘 → 셀 어휘)가 틀리면 화면이 **조용히 다른 모수**를 센다 — 그래서 순수부를 잠근다.

const stage = (id: string, predicates: FilterStage["predicates"], extra: Partial<FilterStage> = {}): FilterStage =>
    ({ id, enabled: true, predicates, ...extra });

const cell = stage("c1", [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }]);
const axis = stage("a1", [{ kind: "axisValue", axisId: "x", ranges: [{ from: { kind: "value", value: 1 } }] }]);
const leafIds = (e: SetExpr): string[] => {
    const { expr } = toCellExpr(e);
    const out: string[] = [];
    const walk = (n: NonNullable<typeof expr>): void => {
        if (n.kind === "pred") { out.push(n.id); return; }
        for (const c of n.of) walk(c);
    };
    if (expr) walk(expr);
    return out;
};

describe("toCellExpr — 잎 변환", () => {
    it("셀 술어 잎은 그대로 넘어간다 · **전이가 술어에 실린다**(술어 하나짜리 칸)", () => {
        const withName = stage("c2", cell.predicates, { name: "돌파", transition: "firstOfDay" });
        const { expr } = toCellExpr(exprOfStages([withName]));
        // ⚠ 전이가 빠지면 "하루 처음"이 조용히 사라져 매 분 재발화한다(후보 수가 소리 없이 는다).
        expect(expr).toMatchObject({
            kind: "and",
            of: [{ kind: "pred", id: "c2", pred: { ...cell.predicates[0], transition: "firstOfDay" } }],
        });
    });

    it("술어가 여럿인 칸은 **AND 묶음**이 된다 — 첫 술어만 싣지 않는다", () => {
        const two = stage("c3", [
            cell.predicates[0]!,
            { kind: "time", ranges: [{ from: "09:00", to: "10:00" }] },
        ], { transition: "firstTrue" });
        const { expr } = toCellExpr(exprOfStages([two]));
        expect(expr).toMatchObject({
            kind: "and",
            of: [{ kind: "and", id: "c3", transition: "firstTrue", of: [{ kind: "pred" }, { kind: "pred" }] }],
        });
    });
});

describe("toCellExpr — 결손", () => {
    it("결손 잎은 빠지고 그 사실이 함께 나온다 — 조용히 0건이 되지 않는다", () => {
        const e: SetExpr = mk("or", "root", [{ kind: "cond", stage: cell }, { kind: "cond", stage: axis }]);
        const { stages } = toCellExpr(e);
        expect(leafIds(e)).toEqual(["c1"]);
        expect(stages.find((s) => s.stageId === "a1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "a1")!.reasons.length).toBeGreaterThan(0);
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: true, reasons: [] });
    });

    // ⚠ AND 에서 결손 잎만 빼면 그 묶음이 **느슨해진다**(사용자가 건 적 없는 더 넓은 집합).
    //   그래서 묶음째 뺀다 — 옛 평평한 시절의 "결손 술어가 든 칸을 통째로 뺀다"와 같은 규칙.
    it("AND 는 결손 형제 하나에 **묶음째** 빠진다 — 멀쩡한 잎에도 이유가 달린다", () => {
        const e = exprOfStages([cell, axis]); // 루트 AND
        expect(leafIds(e)).toEqual([]);
        const { stages } = toCellExpr(e);
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "c1")!.reasons[0]).toMatch(/묶음/);
    });

    it("OR 은 그 항만 빠진다 — 나머지 항이 그대로 선다", () => {
        const e: SetExpr = mk("or", "root", [{ kind: "cond", stage: axis }, { kind: "cond", stage: stage("c9", cell.predicates) }]);
        expect(leafIds(e)).toEqual(["c9"]);
    });
});

// 값의 주인은 줄, 판은 창(2026-09-25) — 미연동 돌파 줄은 값을 든 채 **미완성**이다(옛 값으로 조용히 돌지 않는다).
describe("toCellExpr — 미연동 돌파 줄 = 미완성", () => {
    const bo = stage("b1", [{ kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 } }]);

    it("판이 살아 있으면 평가, 없으면(미연동·소멸된 판) 결손 — AND 를 오염시켜 수가 안 선다", () => {
        const e = exprOfStages([cell, bo]);
        const live = toCellExpr(e, undefined, gridLinkDeficiency({ b1: "daily-grid-1" }, ["daily-grid-1"]));
        expect(live.expr).not.toBeNull();
        expect(live.stages.find((x) => x.stageId === "b1")).toMatchObject({ counted: true });
        for (const [bindings, slots] of [[{}, ["daily-grid-1"]], [{ b1: "daily-grid-9" }, ["daily-grid-1"]]] as const) {
            const r = toCellExpr(e, undefined, gridLinkDeficiency(bindings, slots));
            expect(r.expr).toBeNull();
            expect(r.stages.find((x) => x.stageId === "b1")).toMatchObject({ counted: false, reasons: [UNLINKED_GRID] });
        }
    });

    it("참조한 집합 안의 미연동 돌파 줄도 같은 문을 지난다", () => {
        const inner = exprOfStages([bo]);
        const e = mk("and", "root", [{ kind: "cond", stage: cell }, { kind: "ref", id: "r1", setId: "s1" }]);
        const r = toCellExpr(e, () => ({ expr: inner, universe: "daily" }), gridLinkDeficiency({}, ["daily-grid-1"]));
        expect(r.expr).toBeNull();
        expect(r.stages.find((x) => x.stageId === "b1")).toMatchObject({ counted: false, reasons: [UNLINKED_GRID] });
    });

    it("돌파가 아닌 줄은 연동과 무관하다", () => {
        expect(toCellExpr(exprOfStages([cell]), undefined, gridLinkDeficiency({}, [])).expr).not.toBeNull();
    });
});

describe("toCellExpr — 꺼짐·빈 술어는 부재다", () => {
    it("꺼진 잎·빈 술어 잎은 애초에 안 들어온다(status 에도 안 선다)", () => {
        const off = stage("off", cell.predicates, { enabled: false });
        const empty = stage("empty", [{ kind: "cellValue", field: "ratePct", ranges: [] }]);
        const { expr, stages } = toCellExpr(exprOfStages([off, empty]));
        expect(expr).toBeNull();
        expect(stages).toEqual([]);
    });

    // ⚠ 이 검사가 본론이다 — 전부 꺼진 식만 보면 "부재와 결손을 한 null 로 합류시킨" 버그가 안 잡힌다
    //   (그때도 답이 null 이라 통과한다). **섞인 AND** 에서만 드러난다.
    it("AND 안에서 잎 하나를 꺼도 **나머지가 그대로 산다** — 끄기는 결손이 아니라 부재다", () => {
        const on = stage("keep", cell.predicates);
        const off = stage("off", cell.predicates, { enabled: false });
        const { expr, stages } = toCellExpr(exprOfStages([on, off]));
        expect(leafIds(exprOfStages([on, off])), "꺼진 잎만 빠지고 묶음은 산다").toEqual(["keep"]);
        expect(expr).not.toBeNull();
        expect(stages.map((x) => x.stageId), "꺼진 잎은 결손이 아니다 — 이유가 붙지 않는다").toEqual(["keep"]);
    });

    it("OR 에서 잎을 꺼도 나머지 가지가 선다", () => {
        const e: SetExpr = mk("or", "root", [
                { kind: "cond", stage: stage("off", cell.predicates, { enabled: false }) },
                { kind: "cond", stage: stage("live", cell.predicates) },
            ]);
        expect(leafIds(e)).toEqual(["live"]);
    });
});

describe("toCellExpr — 결손 수는 덜 세어지지 않는다", () => {
    // ⚠ AND 가 k 번째에서 접힐 때 형제를 끝까지 안 걸으면 **뒤쪽 형제가 status 에 아예 안 실려**
    //   화면의 결손 수가 그만큼 적게 나온다("결손은 조용히 사라지지 않는다"가 제 구현에서 새던 자리).
    it("오염된 AND 의 **뒤쪽 형제도** status 에 실린다", () => {
        const e: SetExpr = mk("and", "root", [
                { kind: "cond", stage: axis },                                    // 결손(종단 술어)
                { kind: "cond", stage: stage("after1", cell.predicates) },        // 뒤쪽 형제 둘
                { kind: "cond", stage: stage("after2", cell.predicates) },
            ]);
        const { expr, stages } = toCellExpr(e);
        expect(expr).toBeNull();
        expect(stages.map((x) => x.stageId).sort()).toEqual(["a1", "after1", "after2"]);
        expect(stages.every((x) => !x.counted), "묶음째 빠졌으므로 전부 결손으로 선다").toBe(true);
    });
});

describe("toCellExpr — 부정", () => {
    it("잎·묶음의 부정이 그대로 실린다", () => {
        const e: SetExpr = mk("and", "root", [{ kind: "cond", stage: cell, neg: true }]);
        expect(toCellExpr(e).expr).toMatchObject({ of: [{ kind: "pred", id: "c1", neg: true }] });
    });
});

// ── 참조 인라인 전개 (2026-09-20) ──────────────────────────────────────────
//
// 하루 우주는 참조를 **그 자리에 펼친다**. 안 펼치면 참조가 결손이고, 「결손은 AND 를 오염시킨다」
// 규칙이 묶음 하나를 **집합 전체의 0건**으로 키운다 — 오류도 경고도 없이. 「묶음은 곧 이름 붙은
// 집합」(식 1층화) 이후로는 중첩이 전부 참조라 이 자리가 상시 경로가 된다.
describe("toCellExpr — 참조는 하루 집합만 펼친다", () => {
    const daily = (expr: SetExpr): { expr: SetExpr; universe: "daily" } => ({ expr, universe: "daily" });
    const ref = (setId: string, neg = false): SetTerm =>
        ({ kind: "ref", id: `r-${setId}`, setId, ...(neg ? { neg: true as const } : {}) });

    it("하루 집합 참조는 펼쳐져 조건이 그대로 걸린다", () => {
        const inner = exprOfStages([stage("in1", cell.predicates)]);
        const e: SetExpr = mk("and", "root", [{ kind: "cond", stage: cell }, ref("s1")]);
        const { expr, stages } = toCellExpr(e, (id) => (id === "s1" ? daily(inner) : undefined));
        expect(expr).not.toBeNull();
        expect(stages.map((x) => x.stageId).sort(), "안쪽 조건도 줄로 선다").toEqual(["c1", "in1"]);
        expect(stages.every((x) => x.counted)).toBe(true);
    });

    it("종단 집합 참조는 **여전히 결손**이다 — 키가 아예 다르다", () => {
        const e: SetExpr = mk("and", "root", [{ kind: "cond", stage: cell }, ref("s1")]);
        // ⚠ **비어 있지 않은** 종단 집합이어야 한다 — 빈 집합은 우주와 무관하게 "제한 없음"이다(아래 절).
        const { expr, stages } = toCellExpr(e, () => ({ expr: exprOfStages([axis]), universe: "longitudinal" }));
        expect(expr, "AND 가 오염돼 묶음째 빠진다").toBeNull();
        expect(stages.find((x) => x.stageId === "c1")?.counted, "멀쩡한 형제도 이유를 받는다").toBe(false);
    });

    it("지워진 집합을 가리키는 참조도 결손이다(조용히 통과시키지 않는다)", () => {
        const e: SetExpr = mk("and", "root", [ref("없는것")]);
        expect(toCellExpr(e, () => undefined).expr).toBeNull();
    });

    it("순환(A→B→A)은 무한재귀가 아니라 결손으로 끊긴다", () => {
        const a = daily(mk("and", "ga", [{ kind: "cond", stage: cell }, ref("B")]));
        const b = daily(mk("and", "gb", [ref("A")]));
        const look = (id: string): { expr: SetExpr; universe: "daily" } | undefined =>
            (id === "A" ? a : id === "B" ? b : undefined);
        expect(toCellExpr(mk("and", "root", [ref("A")]), look).expr).toBeNull();
    });

    it("같은 집합을 두 번 참조해도 **줄은 하나**다 — status 가 중복되지 않는다", () => {
        const inner = exprOfStages([stage("in1", cell.predicates)]);
        const e: SetExpr = mk("or", "root", [ref("s1"), ref("s1")]);
        const { stages } = toCellExpr(e, () => daily(inner));
        expect(stages.map((x) => x.stageId)).toEqual(["in1"]);
    });

    it("부정된 참조는 **감싸서** 싣는다 — 안쪽 neg 를 뒤집으면 이중 부정이 뜻을 잃는다", () => {
        const inner = exprOfStages([stage("in1", cell.predicates, {})]);
        const e: SetExpr = mk("and", "root", [ref("s1", true)]);
        const { expr } = toCellExpr(e, () => daily(inner));
        expect(expr).toMatchObject({ kind: "and", of: [{ kind: "and", id: "r-s1", neg: true }] });
    });

    it("펼친 안쪽의 비싼 재료도 **재료 탐지에 잡힌다** — 안 잡히면 조용히 아무것도 안 건다", () => {
        const gridStage = stage("g1", [{ kind: "gridPoint" }]);
        const e: SetExpr = mk("and", "root", [ref("s1")]);
        const { expr } = toCellExpr(e, () => daily(exprOfStages([gridStage])));
        expect(usesCellPred(expr, (p) => p.kind === "gridPoint")).toBe(true);
    });
});

describe("toCellExpr — 빈 집합 참조는 **부재**지 결손이 아니다", () => {
    const daily = (expr: SetExpr): { expr: SetExpr; universe: "daily" } => ({ expr, universe: "daily" });
    const ref = (setId: string): SetTerm => ({ kind: "ref", id: `r-${setId}`, setId });

    // ⚠ 종단에서 빈 집합 참조는 **공허참(= 제한 없음)** 이다(`and3([])`). 여기서 결손으로 접으면
    //   같은 식이 두 우주에서 다른 답을 낸다 — `＋ 묶음` 으로 갓 만든 빈 집합이 부모 하루 집합을
    //   **이유 없이 0건**으로 만들던 자리(2026-09-20 리뷰).
    it("AND 안의 빈 집합 참조는 그냥 빠진다 — 형제 조건이 산다", () => {
        const e: SetExpr = mk("and", "root", [{ kind: "cond", stage: cell }, ref("empty")]);
        const { expr, stages } = toCellExpr(e, () => daily(exprOfStages([])));
        expect(expr, "묶음이 통째로 빠지지 않는다").not.toBeNull();
        expect(stages.find((x) => x.stageId === "c1")?.counted, "형제가 오염되지 않는다").toBe(true);
    });

    it("**우주를 안 묻는다** — 갓 만든 빈 집합은 저장값이 종단이라도 통과한다", () => {
        const e: SetExpr = mk("and", "root", [{ kind: "cond", stage: cell }, ref("new")]);
        const { expr } = toCellExpr(e, () => ({ expr: exprOfStages([]), universe: "longitudinal" as const }));
        expect(expr).not.toBeNull();
    });

    it("OR 안의 빈 집합 참조는 **묶음 전체를 제한 없음**으로 만든다(참인 항이 하나면 OR 은 참)", () => {
        const e: SetExpr = mk("and", "root", [
            { kind: "cond", stage: cell },
            { kind: "ref", id: "r", setId: "orset" },
        ]);
        const orSet = daily(mk("or", "g", [{ kind: "cond", stage: stage("in", cell.predicates) }, ref("empty")]));
        const look = (id: string): { expr: SetExpr; universe: "daily" } | undefined =>
            (id === "orset" ? orSet : id === "empty" ? daily(exprOfStages([])) : undefined);
        const { expr } = toCellExpr(e, look);
        // OR 이 제한 없음 → AND 에서 빠지고 cell 만 남는다(묶음째 결손이 아니다).
        expect(leafIds(e)).toEqual([]); // setOf 없이 부르면 참조가 결손 — 대조군
        expect(expr).toMatchObject({ kind: "and", of: [{ kind: "pred", id: "c1" }] });
    });
});

// ── 괄호 한 겹 (2026-09-21) ────────────────────────────────────────────────
//
// ⚠ 괄호는 **한 층 더인 묶음**일 뿐이라 3치 규칙(결손 오염 / 부재 / 술어)이 그대로 내려가야 한다.
//   2026-09-21 리뷰가 "괄호 있는 식이 번역 검사에 하나도 없다"로 잡은 자리다.
describe("괄호 — 3치 규칙이 한 층 더 내려간다", () => {
    const cell2 = stage("c2", [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 9 } }] }]);

    /** `a AND (b OR c)` — 괄호 안이 OR. */
    const withParen = (terms: SetTerm[]): SetExpr =>
        ({ id: "root", of: terms, ops: ["and", "or"], groups: [{ from: 1, to: 2 }] });

    it("괄호가 **중첩 묶음**으로 번역된다 — 평평하게 펴지 않는다", () => {
        const e = withParen([{ kind: "cond", stage: cell }, { kind: "cond", stage: cell2 }, { kind: "cond", stage: stage("c3", cell.predicates) }]);
        const { expr } = toCellExpr(e);
        expect(expr).toMatchObject({ kind: "and", of: [{ kind: "pred", id: "c1" }, { kind: "or" }] });
    });

    it("괄호 **안**의 결손은 그 괄호만 오염시킨다 — 바깥 AND 는 산다", () => {
        // (결손 OR 셀) — OR 이라 결손 가지만 빠지고 나머지가 선다.
        const e = withParen([{ kind: "cond", stage: cell }, { kind: "cond", stage: axis }, { kind: "cond", stage: cell2 }]);
        const { expr, stages } = toCellExpr(e);
        expect(expr).toMatchObject({ kind: "and", of: [{ kind: "pred", id: "c1" }, { kind: "or", of: [{ kind: "pred", id: "c2" }] }] });
        expect(stages.find((s) => s.stageId === "a1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: true });
    });

    it("괄호가 **AND** 인데 안에 결손이 있으면 그 괄호가 통째로 빠지고 바깥 AND 가 오염된다", () => {
        // a OR (결손 AND c) — 바깥이 OR 이라 괄호만 빠지고 a 는 산다.
        const e: SetExpr = {
            id: "root",
            of: [{ kind: "cond", stage: cell }, { kind: "cond", stage: axis }, { kind: "cond", stage: cell2 }],
            ops: ["or", "and"], groups: [{ from: 1, to: 2 }],
        };
        const { expr, stages } = toCellExpr(e);
        expect(expr).toMatchObject({ kind: "or", of: [{ kind: "pred", id: "c1" }] });
        // 괄호가 통째로 빠졌으니 **그 안의 멀쩡한 조건도 이유를 받는다**(조용히 사라지지 않는다).
        expect(stages.find((s) => s.stageId === "c2")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "c2")!.reasons.length).toBeGreaterThan(0);
    });

    it("괄호 안이 **전부 부재**(꺼짐)면 괄호가 사라지고 바깥만 남는다", () => {
        const off = stage("off", cell2.predicates, { enabled: false });
        const e = withParen([{ kind: "cond", stage: cell }, { kind: "cond", stage: off }, { kind: "cond", stage: stage("off2", cell2.predicates, { enabled: false }) }]);
        const { expr } = toCellExpr(e);
        expect(expr).toMatchObject({ kind: "and", of: [{ kind: "pred", id: "c1" }] });
    });
});
