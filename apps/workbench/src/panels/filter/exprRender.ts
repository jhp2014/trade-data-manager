// 식의 **한 줄 표기**(순수) — 집합 하나를 칩 줄로 낸다.
//
// ## 괄호가 없다
// 식이 1층이고 **한 묶음 = 한 연산자**라(2026-09-20) 괄호가 원리적으로 안 생긴다. 중첩은 참조로
// 가고, 참조 칩은 그 자체로 괄호 노릇을 한다. 옛 최소 괄호 규칙(`¬ > AND > OR` 우선순위 복원)은
// 그래서 통째로 죽었다 — 판정할 것이 없다.
//
// ⚠ 식을 **텍스트로 입력받는 입구는 만들지 않는다**(2026-09-19 확정) — 칩 편집과 두 문법이 되면
// 옛 "필터 UI 가 두 곳"의 함정을 그대로 밟는다. 여기는 **출력 전용**이다.
import { idOf, type SetExpr } from "./expr.js";

/** 한 줄의 조각 — 화면이 칩·기호를 각자 다르게 칠할 수 있게 종류를 들고 나간다. */
export type ExprPiece =
    /** 조건 칩 — `id` 로 그 줄의 편집면을 연다. `neg` 면 앞에 NOT 이 붙은 채 그려진다. */
    | { kind: "leaf"; id: string; label: string; neg: boolean; enabled: boolean }
    /** 참조 칩 — 다른 집합 한 벌. 클릭은 **그 집합 열기**(편집 대상 전환)지 이 자리 편집이 아니다. */
    | { kind: "ref"; id: string; setId: string; label: string; neg: boolean }
    /** 연산자 — 칩 사이의 접속. 낱말로 적는다(`AND`/`OR`). */
    | { kind: "op"; op: "and" | "or" };

/**
 * 식 → 한 줄 조각들. `labelOf` 는 조건 한 줄의 이름을 주는 함수(보드의 `stageLabel` 을 그대로 넘긴다).
 * 한 층이라 순회가 없다 — 항을 순서대로 늘어놓고 사이에 연산자를 끼운다.
 */
export function renderExpr(
    e: SetExpr,
    labelOf: (id: string) => string,
    /** 참조의 이름 — 없으면 "(지워진 집합)". 안 주면 setId 를 그대로 적는다(테스트 편의). */
    setNameOf: (setId: string) => string = (id) => id,
): ExprPiece[] {
    const out: ExprPiece[] = [];
    e.of.forEach((t, i) => {
        if (i > 0) out.push({ kind: "op", op: e.kind });
        const neg = t.neg === true;
        if (t.kind === "cond") out.push({ kind: "leaf", id: idOf(t), label: labelOf(idOf(t)), neg, enabled: t.stage.enabled });
        else out.push({ kind: "ref", id: t.id, setId: t.setId, label: setNameOf(t.setId), neg });
    });
    return out;
}

/** 조각들 → 사람이 읽는 한 줄(테스트·툴팁이 쓴다). 화면은 조각을 직접 그린다. */
export function exprToText(pieces: readonly ExprPiece[]): string {
    let out = "";
    for (const p of pieces) {
        if (p.kind === "leaf") out += `${p.neg ? "NOT " : ""}${p.label}`;
        else if (p.kind === "ref") out += `${p.neg ? "NOT " : ""}∈${p.label}`;
        else out += p.op === "and" ? " AND " : " OR ";
    }
    return out;
}
