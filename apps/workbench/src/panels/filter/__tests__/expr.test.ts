// 식(`SetExpr`)의 순수부 — **한 층**이다(2026-09-20). 중첩은 식 안이 아니라 집합 사이(참조)에 있다.
//
// 여기서 잠그는 것 넷:
//  ① `leavesOf` 의 **참조 동일성** — 셀렉터 얕은 비교가 이것 하나에 걸려 있다.
//  ② 편집 함수가 안 바뀐 항의 **객체를 유지**한다(React memo 가 헛돌지 않게).
//  ③ 파싱은 **항 단위로 관대**하다 — 항 하나가 깨져도 집합 전체가 증발하지 않는다.
//  ④ 참조는 **조건이 아니다** — 조건 목록·조건 수에 안 든다(내용이 남의 것이라).
import { describe, it, expect } from "vitest";
import {
    activeExpr, appendLeaf, appendTerm, emptyExpr, exprOfStages, filterLeaves, findTerm, foldExpr,
    hasCycle, isFoldedNode, leafCount, leavesOf, mapLeaves, negOf, negateTerm, opAt, parseExpr,
    promoteBoundary, refNode, refsOf, removeTerm, replaceTerm, setAllOps, setOpAt, topOpOf,
    type Op, type SetExpr, type SetTerm,
} from "../expr.js";
import { parseStages, type FilterStage } from "../stage.js";

const st = (id: string, name?: string): FilterStage =>
    ({ id, enabled: true, predicates: [{ kind: "date", ranges: [{ from: "2026-01-01", to: "2026-01-31" }] }], ...(name ? { name } : {}) });
const cond = (id: string, neg = false): SetTerm => ({ kind: "cond", stage: st(id), ...(neg ? { neg: true as const } : {}) });
const expr = (kind: Op, of: SetTerm[]): SetExpr => ({ id: "root", of, ops: of.slice(1).map(() => kind), groups: [] });
/** 읽기 좋은 한 줄 표기 — 괄호까지 눈으로 본다. */
const shape = (e: SetExpr): string => {
    const n = foldExpr(e);
    return n.of.map((x) => (isFoldedNode(x) ? `(${x.of.map(idOfTerm).join(` ${x.kind} `)})` : idOfTerm(x))).join(` ${n.kind} `);
};
const idOfTerm = (t: SetTerm | { kind: string }): string => ("stage" in t ? (t as Extract<SetTerm, { kind: "cond" }>).stage.id : (t as Extract<SetTerm, { kind: "ref" }>).setId);

describe("leavesOf — 평평한 목록을 읽는 소비자의 투영", () => {
    it("표시 순서 그대로", () => {
        expect(leavesOf(expr("and", [cond("a"), cond("b")])).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("같은 식이면 **같은 배열**을 돌려준다 — 셀렉터 얕은 비교가 성립해야 한다", () => {
        const e = expr("and", [cond("a")]);
        expect(leavesOf(e)).toBe(leavesOf(e));
    });

    it("식이 바뀌면 새 배열 — 캐시가 낡지 않는다", () => {
        const e = expr("and", [cond("a")]);
        expect(leavesOf(appendLeaf(e, st("b")))).not.toBe(leavesOf(e));
    });

    it("leafCount 는 leavesOf().length 와 같다(배열을 안 만드는 판)", () => {
        const e = expr("or", [cond("a"), refNode("fs1"), cond("b")]);
        expect(leafCount(e)).toBe(leavesOf(e).length);
        expect(leafCount(e), "참조는 조건 수에 안 든다").toBe(2);
    });
});

describe("편집 — 안 바뀐 항은 객체가 유지된다", () => {
    it("mapLeaves: 아무것도 안 바뀌면 식 자체가 같은 객체", () => {
        const e = expr("and", [cond("a"), cond("b")]);
        expect(mapLeaves(e, (s) => s)).toBe(e);
    });

    it("mapLeaves: 바뀐 조건만 새 객체 — 형제는 그대로", () => {
        const e = expr("and", [cond("a"), cond("b")]);
        const next = mapLeaves(e, (s) => (s.id === "a" ? { ...s, enabled: false } : s));
        expect(next).not.toBe(e);
        expect(next.of[1]).toBe(e.of[1]);
    });

    it("filterLeaves: 참조는 조건 필터의 대상이 아니다 — 통과한다", () => {
        const e = expr("and", [cond("a"), refNode("fs1")]);
        const next = filterLeaves(e, () => false);
        expect(next.of.map((t) => t.kind)).toEqual(["ref"]);
    });

    it("filterLeaves: 전부 걸러내도 빈 루트가 남는다 — 붙이기·비우기가 늘 성립하게", () => {
        expect(filterLeaves(expr("and", [cond("a")]), () => false).of).toEqual([]);
    });

    it("replaceTerm/removeTerm/negateTerm — 주소는 항 id(조건은 stage.id)", () => {
        const e = expr("and", [cond("a"), refNode("fs1")]);
        const refId = e.of[1]!.kind === "ref" ? e.of[1]!.id : "";
        expect(negOf(negateTerm(e, "a"), "a")).toBe(true);
        expect(negOf(negateTerm(negateTerm(e, "a"), "a"), "a"), "두 번 누르면 꺼진다").toBe(false);
        expect(removeTerm(e, refId).of).toHaveLength(1);
        expect(removeTerm(e, "없는것"), "없는 주소는 식을 안 바꾼다").toBe(e);
        expect(findTerm(e, "a")?.kind).toBe("cond");
        expect(replaceTerm(e, "a", (t) => t)).toBe(e);
    });

    it("setAllOps — 줄 전체를 한 연산자로 밀면 괄호가 통째로 사라진다", () => {
        const mixed = setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or");
        expect(mixed.groups).toHaveLength(1);
        expect(setAllOps(mixed, "and").groups, "섞임이 없으면 괄호도 없다").toEqual([]);
    });
});

describe("activeExpr — 끄기는 결손이 아니라 **부재**다", () => {
    it("꺼진 조건·빈 술어 조건은 평가에서 빠진다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("off"), enabled: false } };
        const empty: SetTerm = { kind: "cond", stage: { id: "e", enabled: true, predicates: [{ kind: "date", ranges: [] }] } };
        expect(leavesOf(activeExpr(expr("and", [cond("a"), off, empty]))).map((s) => s.id)).toEqual(["a"]);
    });

    it("OR 에서 조건을 끄면 나머지 항이 남고 **연산자도 OR 그대로**다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("off"), enabled: false } };
        const next = activeExpr(expr("or", [off, cond("live"), cond("also")]));
        expect(topOpOf(next), "연산자는 안 바뀐다").toBe("or");
        expect(leavesOf(next).map((s) => s.id)).toEqual(["live", "also"]);
    });

    it("참조는 안 걷힌다 — 꺼짐이라는 개념이 없다(남의 것이다)", () => {
        expect(activeExpr(expr("and", [refNode("fs1")])).of).toHaveLength(1);
    });
});

describe("파싱 — 항 단위로 관대하다", () => {
    const round = (e: SetExpr): SetExpr | null => parseExpr(JSON.parse(JSON.stringify(e)), parseStages);

    it("왕복 항등 — 부정 수식어까지", () => {
        const e = expr("or", [cond("a", true), { ...refNode("fs1"), neg: true }]);
        expect(round(e)).toEqual(e);
    });

    it("부정 부재는 필드 없이 읽힌다 — 저장물이 필드 추가 없이 승계된다", () => {
        const e = expr("and", [cond("a")]);
        expect(round(e)!.of[0]).not.toHaveProperty("neg");
    });

    it("못 읽는 항만 떨어지고 나머지는 산다", () => {
        const raw = { kind: "and", id: "root", of: [{ kind: "cond", stage: { id: "a", enabled: true, predicates: [{ kind: "date", ranges: [] }] } }, { kind: "cond", stage: "쓰레기" }, { kind: "ref" }] };
        const e = parseExpr(raw, parseStages);
        expect(e!.of).toHaveLength(1);
    });

    it("항 id 가 없으면 발급한다(손으로 쓴 저장물)", () => {
        const e = parseExpr({ ops: ["or"], of: [{ kind: "ref", setId: "fs1" }, { kind: "ref", setId: "fs2" }] }, parseStages);
        expect(topOpOf(e!)).toBe("or");
        expect(e!.of[0]!.kind === "ref" && e!.of[0]!.id.length > 0).toBe(true);
    });

    it("모양이 아예 아니면 null — 호출부가 빈 식으로 떨어질 수 있게", () => {
        expect(parseExpr(null, parseStages)).toBeNull();
        expect(parseExpr({ kind: "cond" }, parseStages), "루트는 묶음이어야 한다").toBeNull();
    });
});

describe("참조 항 — 중첩이 사는 자리", () => {
    it("참조는 조건 목록에 안 든다 — 내용이 남의 것이다", () => {
        expect(leavesOf(expr("and", [cond("a"), refNode("fs1")])).map((s) => s.id)).toEqual(["a"]);
    });

    it("refsOf — 쓰는 집합 id 를 중복 없이 모은다", () => {
        expect(refsOf(expr("and", [refNode("fs1"), refNode("fs2"), refNode("fs1")])).sort()).toEqual(["fs1", "fs2"]);
    });

    it("appendTerm 으로 참조를 붙인다 — 조건과 같은 자격", () => {
        const e = appendTerm(expr("and", [cond("a")]), refNode("fs1"));
        expect(e.of.map((t) => t.kind)).toEqual(["cond", "ref"]);
    });
});

describe("순환 참조 — 저장 시 거절의 자", () => {
    const exprOfSet = (map: Record<string, SetExpr>) => (id: string): SetExpr | undefined => map[id];

    it("자기 자신을 가리키면 순환", () => {
        expect(hasCycle("A", expr("and", [refNode("A")]), exprOfSet({}))).toBe(true);
    });

    it("건너서 닿아도 순환 — A → B → A", () => {
        const map = { B: expr("and", [refNode("A")]) };
        expect(hasCycle("A", expr("and", [refNode("B")]), exprOfSet(map))).toBe(true);
    });

    it("닿지 않으면 순환이 아니다 — 같은 집합을 둘이 가리켜도(다이아몬드)", () => {
        const map = { B: expr("and", [refNode("C")]), C: expr("and", []), D: expr("and", [refNode("C")]) };
        expect(hasCycle("A", expr("and", [refNode("B"), refNode("D")]), exprOfSet(map))).toBe(false);
    });
});

describe("빈 식 · 승계 지름길", () => {
    it("exprOfStages — 조건 id 는 그대로, 루트는 AND", () => {
        const e = exprOfStages([st("a"), st("b")]);
        expect(topOpOf(e)).toBe("and");
        expect(leavesOf(e).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("빈 식 = 조건 0개('제한 없음'이지 '전부 탈락'이 아니다)", () => {
        expect(emptyExpr().of).toEqual([]);
        expect(exprOfStages([]).of).toEqual([]);
    });
});

// ── 연산자와 괄호 (2026-09-21) ─────────────────────────────────────────────
//
// 여기서 잠그는 것 셋:
//  ① **항 수를 바꾸는 손은 `ops`·`groups` 를 같이 옮긴다** — 안 옮기면 오류 없이 다른 식이 된다.
//  ② **숨은 우선순위가 없다** — 섞이는 순간 괄호가 박히고, 괄호 밖 연산자는 늘 한 종류다.
//  ③ **겹은 하나까지** — `foldExpr` 의 결과에 묶음 안의 묶음이 없다.

describe("항을 지우면 그 자리의 연산자도 같이 죽는다", () => {
    it("`a AND b OR c` 에서 b 를 빼면 `a OR c` — 남는 항 앞의 연산자를 물려받는다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or");
        expect(shape(e)).toBe("(a and b) or c");
        const next = removeTerm(e, "b");
        expect(next.ops, "경계가 하나 줄고").toHaveLength(1);
        expect(shape(next), "괄호는 항이 하나 남아 사라진다").toBe("a or c");
    });

    it("괄호 안의 항이 하나만 남으면 그 괄호는 사라진다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c"), cond("d")]), 2, "or");
        expect(shape(e)).toBe("(a and b and c) or d");
        expect(shape(removeTerm(removeTerm(e, "b"), "c"))).toBe("a or d");
    });

    it("activeExpr(꺼짐)도 같은 길을 지난다 — 부재가 연산자를 어긋나게 두지 않는다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("b"), enabled: false } };
        const e = setOpAt({ ...expr("and", [cond("a"), off, cond("c")]) }, 1, "or");
        const live = activeExpr(e);
        expect(live.ops).toHaveLength(live.of.length - 1);
        expect(shape(live)).toBe("a or c");
    });
});

describe("섞이는 순간 괄호가 박힌다 — 숨은 우선순위가 없다", () => {
    it("가운데를 OR 로 바꾸면 앞의 AND 구간이 괄호로 묶인다", () => {
        expect(shape(setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or"))).toBe("(a and b) or c");
    });

    it("「이 자리를 바깥으로」는 연산자를 안 건드리고 괄호만 뒤집는다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or");
        const flipped = promoteBoundary(e, 0);
        expect(shape(flipped)).toBe("a and (b or c)");
        expect(opAt(flipped, 0), "연산자는 그대로다").toBe("and");
        expect(opAt(flipped, 1)).toBe("or");
    });

    it("AND 구간이 둘이면 괄호도 둘 — 여전히 한 겹이다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c"), cond("d")]), 1, "or");
        expect(shape(e)).toBe("(a and b) or (c and d)");
        expect(foldExpr(e).of.filter(isFoldedNode)).toHaveLength(2);
    });

    it("연산자가 균일하면 괄호가 없다 — 줄 전체를 덮는 괄호는 뜻이 없다", () => {
        expect(expr("or", [cond("a"), cond("b")]).groups).toEqual([]);
        expect(setOpAt(expr("and", [cond("a"), cond("b")]), 0, "or").groups).toEqual([]);
    });

    it("다른 연산자로 항을 붙이면 그 자리에서 괄호가 생긴다", () => {
        const e = appendLeaf(expr("and", [cond("a"), cond("b")]), st("c"), "or");
        expect(shape(e)).toBe("(a and b) or c");
    });

    it("연산자를 안 주고 붙이면 **줄의 바깥 연산자**를 따른다 — 새 항이 조용히 뜻을 안 바꾼다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or");
        expect(shape(appendLeaf(e, st("d")))).toBe("(a and b) or c or d");
    });
});

describe("foldExpr — 접는 자리는 한 곳이고 겹은 하나다", () => {
    it("괄호가 없으면 항이 그대로 선다", () => {
        const n = foldExpr(expr("and", [cond("a"), cond("b")]));
        expect(n.kind).toBe("and");
        expect(n.of.every((x) => !isFoldedNode(x))).toBe(true);
    });

    it("묶음 안에 묶음이 없다", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c"), cond("d")]), 1, "or");
        for (const x of foldExpr(e).of) if (isFoldedNode(x)) expect(x.of.some(isFoldedNode)).toBe(false);
    });

    it("항이 하나면 묶음 하나에 항 하나 — 소비자가 갈래를 안 늘려도 된다", () => {
        expect(foldExpr(expr("and", [cond("a")])).of).toHaveLength(1);
    });
});

describe("파싱 — 연산자·괄호도 항 단위 관대를 따른다", () => {
    const round = (e: SetExpr): SetExpr | null => parseExpr(JSON.parse(JSON.stringify(e)), parseStages);

    it("괄호까지 왕복 항등", () => {
        const e = setOpAt(expr("and", [cond("a"), cond("b"), cond("c")]), 1, "or");
        expect(round(e)).toEqual(e);
    });

    it("항이 떨어지면 연산자·괄호가 그 자리에 맞춰 줄어든다", () => {
        const raw = {
            id: "root",
            of: [
                { kind: "cond", stage: { id: "a", enabled: true, predicates: [{ kind: "date", ranges: [] }] } },
                { kind: "cond", stage: "쓰레기" },
                { kind: "cond", stage: { id: "c", enabled: true, predicates: [{ kind: "date", ranges: [] }] } },
            ],
            ops: ["and", "or"],
            groups: [{ from: 0, to: 1 }],
        };
        const e = parseExpr(raw, parseStages)!;
        expect(e.of).toHaveLength(2);
        expect(e.ops, "c 앞에 있던 or 가 남는다").toEqual(["or"]);
        expect(e.groups, "항이 하나만 남은 괄호는 사라진다").toEqual([]);
    });

    it("연산자가 모자라면 and 로 채운다 — 손으로 쓴 저장물", () => {
        const e = parseExpr({ of: [{ kind: "ref", setId: "fs1" }, { kind: "ref", setId: "fs2" }] }, parseStages)!;
        expect(e.ops).toEqual(["and"]);
    });
});

// ⚠ 2026-09-21 리뷰가 잡은 자리 — 항이 줄면 **괄호가 사라진 자리에 섞인 연산자가 남을 수 있다**.
//   그러면 `foldExpr` 은 바깥 연산자 하나로 접고 나머지를 버리고, `renderExpr` 은 경계마다 제
//   연산자를 그려서 **표시와 평가가 갈린다**. `normalizeExpr` 이 늘 `regroup` 하는 이유가 이것이다.
describe("항이 줄어도 불변식이 선다 — 표시와 평가가 안 갈린다", () => {
    /** 괄호 밖 연산자가 전부 같고, 각 괄호 안도 같은가. */
    const sane = (e: SetExpr): boolean => {
        const outside: Op[] = [];
        for (let i = 0; i < e.ops.length; i++) {
            const g = e.groups.find((x) => x.from <= i && i + 1 <= x.to);
            if (g === undefined) outside.push(e.ops[i]!);
            else if (e.ops[i] !== e.ops[g.from]) return false;
        }
        return outside.every((o) => o === outside[0]);
    };

    it("`a AND (b OR c) AND d` 에서 b 를 지워도 뜻이 한 가지다", () => {
        const base = promoteBoundary(setOpAt(expr("and", [cond("a"), cond("b"), cond("c"), cond("d")]), 1, "or"), 0);
        expect(shape(base)).toBe("a and (b or c) and d");
        const next = removeTerm(base, "b");
        expect(sane(next), "괄호 밖이 섞인 채로 남지 않는다").toBe(true);
        expect(next.ops).toHaveLength(2);
    });

    it("**끄기**(activeExpr)도 같은 길을 지난다 — 조건 하나를 끄면 뜻이 조용히 안 바뀐다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("b"), enabled: false } };
        const raw = promoteBoundary(setOpAt({ ...expr("and", [cond("a"), off, cond("c"), cond("d")]) }, 1, "or"), 0);
        const live = activeExpr(raw);
        expect(sane(live)).toBe(true);
        expect(live.ops).toHaveLength(live.of.length - 1);
    });

    it("파싱도 같다 — 항 하나가 안 읽혀도 남은 식이 성립한다", () => {
        const raw = {
            id: "root",
            of: [
                { kind: "cond", stage: { id: "a", enabled: true, predicates: [{ kind: "date", ranges: [] }] } },
                { kind: "cond", stage: "쓰레기" },
                { kind: "cond", stage: { id: "c", enabled: true, predicates: [{ kind: "date", ranges: [] }] } },
                { kind: "cond", stage: { id: "d", enabled: true, predicates: [{ kind: "date", ranges: [] }] } },
            ],
            ops: ["and", "or", "and"],
            groups: [{ from: 1, to: 2 }],
        };
        expect(sane(parseExpr(raw, parseStages)!)).toBe(true);
    });
});
