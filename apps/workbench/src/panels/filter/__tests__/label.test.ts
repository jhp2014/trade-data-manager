import { describe, it, expect } from "vitest";
import { kindLabel, predicateLabel, setDisplayName, stageLabel } from "../label.js";
import type { FilterPredicate, FilterStage } from "../stage.js";
import { exprOfStages, type SetExpr, type SetTerm } from "../expr.js";
import { breakoutText } from "../../breakout/chainChecks.js";

type BreakoutPred = Parameters<typeof breakoutText>[0];

/** 연산자가 균일한 식 — 괄호가 없는 줄(대부분의 검사가 이 모양이다). */
const mk = (op: "and" | "or", id: string, of: SetTerm[]): SetExpr => ({ id, of, ops: of.slice(1).map(() => op), groups: [] });


const stage = (predicates: FilterPredicate[], name?: string): FilterStage => ({ id: "s", enabled: true, name, predicates });

describe("predicateLabel", () => {
    it("시간은 하나면 구간 그대로, 여럿이면 개수", () => {
        expect(predicateLabel({ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] })).toBe("09:00~10:30");
        expect(predicateLabel({ kind: "time", ranges: [{ from: "09:00", to: "10:30" }, { from: "13:00", to: "14:00" }] })).toBe("시간 2구간");
    });
});
describe("kindLabel", () => {
    it("종류를 사람 말로", () => {
        expect(kindLabel("time")).toBe("시간");
        expect(kindLabel("breakout")).toBe("타점");
        expect(kindLabel("candleShape")).toBe("캔들");
        expect(kindLabel("theme")).toBe("테마"); // 컴파일러가 안 잡는 자리(default "") — 빠지면 빈 라벨로 조용히 뜬다
        expect(kindLabel(undefined)).toBe("");
    });
});
describe("stageLabel", () => {
    it("손으로 준 이름이 우선", () => {
        expect(stageLabel(stage([{ kind: "time", ranges: [] }], "1차 거르기"))).toBe("1차 거르기");
    });

    it("없으면 조건에서 만든다", () => {
        const s = stage([{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }]);
        expect(stageLabel(s)).toBe("09:00~10:30");
    });

    it("빈 술어는 이름에 안 낀다", () => {
        const s = stage([
            { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
            { kind: "time", ranges: [] },
        ]);
        expect(stageLabel(s)).toBe("09:00~10:30");
    });

    it("조건이 하나도 없으면 그렇다고 말한다", () => {
        expect(stageLabel(stage([]))).toBe("조건 없음");
    });
});

// ── 집합 표시 이름 (2026-09-20) ────────────────────────────────────────────
//
// `SavedSet.name` 은 옵셔널이고 **부재 = 자동 이름**이다(점선 칩). 저장 시점에 굽지 않는 이유는
// 재료(이름 사전)가 스토어 동기 초기화 시점엔 없었기 때문이다(지금은 이름이 전부 payload).
describe("setDisplayName — 손 이름이 없으면 내용에서 만든다", () => {
    const st = (id: string, from: number): FilterStage =>
        ({ id, enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: from } }] }] });

    it("손 이름이 있으면 그대로", () => {
        expect(setDisplayName({ name: "아침 돌파", expr: exprOfStages([st("a", 5)]) })).toBe("아침 돌파");
    });

    it("없으면 첫 조건 + 외 N", () => {
        expect(setDisplayName({ expr: exprOfStages([st("a", 5)]) })).toBe(stageLabel(st("a", 5)));
        expect(setDisplayName({ expr: exprOfStages([st("a", 5), st("b", 8)]) }))
            .toBe(`${stageLabel(st("a", 5))} 외 1`);
    });

    it("조건이 하나도 없으면 '빈 집합'", () => {
        expect(setDisplayName({ expr: exprOfStages([]) })).toBe("빈 집합");
    });
});

// ⚠ 새 모델에서 제일 흔한 모양은 `AND(참조, 참조)`(조건 0개)다 — 조건만 세면 그게 "빈 집합"으로
//   불리고 칩·빵부스러기·목록이 한꺼번에 거짓말한다(2026-09-20 리뷰가 잡은 자리).
describe("setDisplayName — 참조도 항이다", () => {
    const ref = (setId: string): SetTerm => ({ kind: "ref", id: `r-${setId}`, setId });

    it("참조만 든 집합은 '빈 집합'이 아니다 — 첫 항의 이름 + 외 N", () => {
        const expr: SetExpr = mk("and", "root", [ref("a"), ref("b")]);
        expect(setDisplayName({ expr }, (id: string) => (id === "a" ? "아침 돌파" : "거래대금"))).toBe("아침 돌파 외 1");
    });

    it("참조 이름을 안 주면 (묶음) — 이름 짓다가 그래프를 걷지 않는다", () => {
        const expr: SetExpr = mk("and", "root", [ref("a")]);
        expect(setDisplayName({ expr })).toBe("(묶음)");
    });

    it("진짜 빈 식만 '빈 집합'이다", () => {
        expect(setDisplayName({ expr: mk("and", "root", []) })).toBe("빈 집합");
    });
});

describe("돌파 생성기 라벨 = breakoutText 요약(2026-09-26 — 옛 「돌파」 한 단어·판 이름 규칙 은퇴)", () => {
    it("라벨에 zigzag/밴드와 사슬 필터 식이 실린다 — 돌파 두 줄이 서로 갈린다", () => {
        const a: FilterPredicate = { kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 } };
        const b: FilterPredicate = {
            kind: "breakout", zigzagPct: 3, bandPct: 1,
            chain: {
                expr: {
                    id: "chain",
                    of: [
                        { kind: "check", id: "a", cond: { kind: "amount", minEok: 50 }, firstK: 1 },
                        { kind: "check", id: "b", cond: { kind: "sessionHigh" } },
                        { kind: "check", id: "c", cond: { kind: "label", label: "baseline" }, neg: true },
                    ],
                    ops: ["and", "or"],
                    groups: [{ from: 1, to: 2, firstK: 2 }],
                },
                firstK: null,
            },
        };
        const c: FilterPredicate = { kind: "candleShape", shape: "bear" };
        expect(predicateLabel(a)).toBe("돌파 2%/0.5% · 처음 1개");
        expect(predicateLabel(b)).toBe(breakoutText(b as BreakoutPred));
        expect(breakoutText(a as BreakoutPred)).toBe("돌파 2%/0.5% · 처음 1개");
        expect(breakoutText(b as BreakoutPred)).toBe("돌파 3%/1% · 봉 대금 ≥ 50억 · 처음 1 AND (세션 고가 돌파 OR NOT 기준선 돌파) · 처음 2 · 전부");
        expect(predicateLabel(c)).toBe("음봉");
        expect(kindLabel("breakout")).toBe("타점");
    });
});
