import { describe, it, expect } from "vitest";
import {
    NONE_GROUP, NONE_LABEL, addGroupLiteral, isNoneLiteral, moveGroupLiteral, parseGroupExpr, removeGroupLiteral, groupLiteralCount, toggleGroupNeg, type GroupExpr,
} from "../groupFilter.js";

/** 읽기 쉬운 식 리터럴 — "a,!b | c" = (a ∧ !b) ∨ (c). */
const expr = (s: string): GroupExpr => ({
    groups: s.split("|").map((g) => ({
        literals: g.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("!") ? { groupId: t.slice(1), neg: true } : { groupId: t, neg: false })),
    })).filter((g) => g.literals.length > 0),
});
const show = (e: GroupExpr): string => e.groups.map((g) => g.literals.map((l) => (l.neg ? "!" : "") + l.groupId).join(",")).join("|");

describe("'그룹 없음' 리터럴", () => {
    it("저장 문자열은 승계값이다 — 바꾸면 저장된 필터의 리터럴이 유령이 된다", () => {
        expect(NONE_GROUP).toBe("@none:day");
        expect(isNoneLiteral(NONE_GROUP)).toBe(true);
    });

    it("실제 그룹 이름·옛 리터럴은 없음이 아니다", () => {
        expect(isNoneLiteral("돌파")).toBe(false);
        expect(isNoneLiteral("@none")).toBe(false);
        expect(isNoneLiteral("@none:point")).toBe(false);
    });

    it("화면 이름은 한 곳에서 온다", () => {
        expect(NONE_LABEL).toBe("그룹 없음");
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
    it("옛 없음 리터럴(@none·@none:point)은 리터럴째 버린다 — 그 조건만 넓어지고 나머지 절은 그대로", () => {
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: "@none", neg: false }, { groupId: "a", neg: false }] }] })!)).toBe("a");
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: "@none:point", neg: false }, { groupId: "a", neg: false }] }] })!)).toBe("a");
        // 절이 그것뿐이었으면 절째 사라진다(빈 절은 남기지 않는다)
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: "@none", neg: true }] }, { literals: [{ groupId: "b", neg: false }] }] })!)).toBe("b");
    });
    it("지금 쓰는 없음 리터럴은 그대로 산다", () => {
        expect(show(parseGroupExpr({ groups: [{ literals: [{ groupId: NONE_GROUP, neg: false }] }] })!)).toBe(NONE_GROUP);
    });
});
