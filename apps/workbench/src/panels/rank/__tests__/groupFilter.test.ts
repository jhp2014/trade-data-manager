import { describe, it, expect } from "vitest";
import {
    NO_TAGS, addGroupLiteral, evalGroupExpr, moveGroupLiteral, parseGroupExpr, removeGroupLiteral, groupLiteralCount, toggleGroupNeg, type GroupExpr,
} from "../groupFilter.js";

/** 읽기 쉬운 식 리터럴 — "a,!b | c" = (a ∧ !b) ∨ (c). */
const expr = (s: string): GroupExpr => ({
    groups: s.split("|").map((g) => ({
        literals: g.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("!") ? { groupId: t.slice(1), neg: true } : { groupId: t, neg: false })),
    })).filter((g) => g.literals.length > 0),
});
const show = (e: GroupExpr): string => e.groups.map((g) => g.literals.map((l) => (l.neg ? "!" : "") + l.groupId).join(",")).join("|");

describe("evalGroupExpr", () => {
    it("빈 식은 전부 통과(이 차원 필터 없음)", () => {
        expect(evalGroupExpr([], { groups: [] })).toBe(true);
        expect(evalGroupExpr(["a"], { groups: [] })).toBe(true);
    });

    it("그룹 안은 AND, 그룹끼리는 OR", () => {
        const e = expr("a,b | c");
        expect(evalGroupExpr(["a", "b"], e)).toBe(true);
        expect(evalGroupExpr(["a"], e)).toBe(false); // b 없음 → 첫 그룹 탈락, c 도 없음
        expect(evalGroupExpr(["c"], e)).toBe(true); // 둘째 그룹 통과
        expect(evalGroupExpr(["a", "c"], e)).toBe(true);
    });

    it("부정 리터럴 — 안 붙은 그룹이 통과", () => {
        const e = expr("a,!b");
        expect(evalGroupExpr(["a"], e)).toBe(true);
        expect(evalGroupExpr(["a", "b"], e)).toBe(false);
        expect(evalGroupExpr([], expr("!b"))).toBe(true); // 그룹이 없어도 "b 아님"은 참
    });

    it("그룹 없음 리터럴 — 미분류 타점 찾기", () => {
        const none = expr(NO_TAGS);
        expect(evalGroupExpr([], none)).toBe(true);
        expect(evalGroupExpr(["a"], none)).toBe(false);
        // 부정하면 "그룹이 하나라도 있는 것"
        expect(evalGroupExpr(["a"], expr(`!${NO_TAGS}`))).toBe(true);
        expect(evalGroupExpr([], expr(`!${NO_TAGS}`))).toBe(false);
    });
});

describe("편집 — 추가·부정·제거", () => {
    it("팔레트 추가는 단독 그룹(OR)이고, 같은 그룹도 또 넣을 수 있다", () => {
        let e = addGroupLiteral({ groups: [] }, "a");
        e = addGroupLiteral(e, "b");
        e = addGroupLiteral(e, "a"); // 다른 그룹에 쓰려고 또 담는 건 정상
        expect(show(e)).toBe("a|b|a");
        expect(groupLiteralCount(e)).toBe(3);
    });

    it("부정 토글", () => {
        expect(show(toggleGroupNeg(expr("a,b"), 0, 1))).toBe("a,!b");
        expect(show(toggleGroupNeg(toggleGroupNeg(expr("a"), 0, 0), 0, 0))).toBe("a");
    });

    it("제거 — 비워진 그룹은 사라진다", () => {
        expect(show(removeGroupLiteral(expr("a,b | c"), 0, 0))).toBe("b|c");
        expect(show(removeGroupLiteral(expr("a | c"), 0, 0))).toBe("c");
    });
});

describe("편집 — 이동(드래그)", () => {
    it("다른 그룹에 얹으면 AND 로 합류하고, 비워진 그룹은 사라진다", () => {
        expect(show(moveGroupLiteral(expr("a | b"), 1, 0, 0))).toBe("a,b");
    });

    it("밖으로 빼면 단독 그룹(OR)", () => {
        expect(show(moveGroupLiteral(expr("a,b"), 0, 1, "new"))).toBe("a|b");
    });

    it("같은 그룹 안 중복·모순은 거부(원본 그대로)", () => {
        const dup = expr("a | a");
        expect(moveGroupLiteral(dup, 1, 0, 0)).toBe(dup); // a∧a
        const contra = expr("a | !a");
        expect(moveGroupLiteral(contra, 1, 0, 0)).toBe(contra); // a∧!a
    });

    it("제자리·이미 단독인데 빼기·없는 목표는 아무 일도 안 한다", () => {
        const e = expr("a,b | c");
        expect(moveGroupLiteral(e, 0, 0, 0)).toBe(e);
        expect(moveGroupLiteral(expr("a"), 0, 0, "new")).toEqual(expr("a"));
        expect(moveGroupLiteral(e, 0, 0, 9)).toBe(e);
        expect(moveGroupLiteral(e, 5, 0, 0)).toBe(e);
    });

    it("합류로 앞 그룹이 비면 뒤 인덱스가 당겨져도 결과가 어긋나지 않는다", () => {
        // (a) ∨ (b) ∨ (c) 에서 a 를 c 그룹으로 → (b) ∨ (c,a)
        expect(show(moveGroupLiteral(expr("a | b | c"), 0, 0, 2))).toBe("b|c,a");
    });
});

describe("parseGroupExpr — 영속 값 검증", () => {
    it("정상 값은 통과, 빈 그룹은 버린다", () => {
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: "a", neg: true }] }, { literals: [] }] })!)).toBe("!a");
    });
    it("형태가 안 맞으면 null", () => {
        expect(parseGroupExpr(null)).toBeNull();
        expect(parseGroupExpr({ groups: "x" })).toBeNull();
        expect(parseGroupExpr({ groups: [{ literals: [{ groupId: 1 }] }] })).toBeNull();
    });
    it("neg 누락은 false 로 채운다(옛 저장본 호환)", () => {
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: "a" }] }] })!)).toBe("a");
    });
});
