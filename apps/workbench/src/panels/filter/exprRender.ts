// 식의 **한 줄 표기**(순수) — 인라인으로 접힌 노드가 무엇인지 한 줄로 말한다.
//
// ## 괄호는 "필요할 때만"이고, 치는 자리는 **여기 하나**다
// 우선순위는 관례 그대로 `¬` > `AND` > `OR`. 그 우선순위로 **복원되는** 구조엔 괄호를 안 친다:
//   · `a ∧ b ∨ c ∧ d` 는 `(a∧b) ∨ (c∧d)` 로 읽히므로 괄호가 군더더기다.
// 복원이 안 되는 경우는 둘뿐이라 그때만 친다:
//   · OR 이 AND 안에 들어갈 때 — `(a ∨ b) ∧ c`
//   · 부정이 묶음에 붙을 때   — `¬(a ∨ b)`  (부정은 가장 강해서 `¬a ∨ b` 로 읽히므로)
//
// 두 곳에서 괄호를 치면 같은 식이 두 화면에서 다르게 읽힌다 — `stageBinding.railKeyOf` 가 "판정은
// 한 곳"으로 지키던 것과 같은 규칙이다. 그래서 표기의 유일한 출처가 이 파일이다.
//
// ⚠ 식을 **텍스트로 입력받는 입구는 만들지 않는다**(2026-09-19 확정) — 칩 편집과 두 문법이 되면
// 옛 "필터 UI 가 두 곳"의 함정을 그대로 밟는다. 여기는 **출력 전용**이다.
import { idOf, type SetExpr } from "./expr.js";

/** 한 줄의 조각 — 화면이 칩·기호·괄호를 각자 다르게 칠할 수 있게 종류를 들고 나간다. */
export type ExprPiece =
    /** 조건 칩 — `id` 로 그 줄의 편집면을 연다. `neg` 면 앞에 ¬ 가 붙은 채 그려진다. */
    | { kind: "leaf"; id: string; label: string; neg: boolean; enabled: boolean }
    /** 참조 칩 — 다른 집합 한 벌. 클릭은 **그 집합 열기**(편집 대상 전환)지 이 자리 편집이 아니다. */
    | { kind: "ref"; id: string; setId: string; label: string; neg: boolean }
    /** 연산자 — 칩 사이의 접속. */
    | { kind: "op"; op: "and" | "or" }
    /** 괄호 — 위 두 경우에만 나온다. */
    | { kind: "paren"; open: boolean }
    /** 묶음 앞의 부정 — `¬(` 의 `¬` 자리(괄호는 따로 나온다). */
    | { kind: "neg" };

/** 우선순위 — 클수록 강하게 묶인다. 잎(조건·참조)은 원자라 가장 강하다. */
const prec = (e: SetExpr): number => (e.kind === "and" ? 2 : e.kind === "or" ? 1 : 3);

/**
 * 식 → 한 줄 조각들. `labelOf` 는 조건 한 줄의 이름을 주는 함수(보드의 `stageLabel` 을 그대로 넘긴다).
 *
 * 괄호 판정은 **자식의 우선순위가 부모보다 약할 때**만 참이다(위 머리 주석의 두 경우가 정확히 이것).
 * 부정된 묶음은 자기 우선순위와 무관하게 괄호를 받는다 — `¬` 가 가장 강해서 안 치면 첫 항에만 붙는다.
 */
export function renderExpr(
    e: SetExpr,
    labelOf: (id: string) => string,
    /** 참조의 이름 — 없으면 "(지워진 집합)". 안 주면 setId 를 그대로 적는다(테스트 편의). */
    setNameOf: (setId: string) => string = (id) => id,
): ExprPiece[] {
    const out: ExprPiece[] = [];

    const walk = (n: SetExpr, parentPrec: number): void => {
        const neg = n.neg === true;
        const group = n.kind === "and" || n.kind === "or";
        // 괄호가 필요한가 — ① 부모보다 약한 묶음이거나 ② 부정된 묶음(¬ 가 첫 항만 먹지 않게).
        const needParen = group && (prec(n) < parentPrec || neg);

        if (n.kind === "cond") {
            out.push({ kind: "leaf", id: idOf(n), label: labelOf(idOf(n)), neg, enabled: n.stage.enabled });
            return;
        }
        if (n.kind === "ref") {
            out.push({ kind: "ref", id: idOf(n), setId: n.setId, label: setNameOf(n.setId), neg });
            return;
        }
        if (neg) out.push({ kind: "neg" });
        if (needParen) out.push({ kind: "paren", open: true });
        n.of.forEach((c, i) => {
            if (i > 0) out.push({ kind: "op", op: n.kind });
            // 부정된 묶음은 이미 괄호 안이라 자식은 그 묶음의 우선순위만 보면 된다.
            walk(c, prec(n));
        });
        if (needParen) out.push({ kind: "paren", open: false });
    };

    // 루트는 부모가 없다 — 가장 약한 우선순위로 들어가 바깥 괄호가 안 생긴다.
    walk(e, 0);
    return out;
}

/** 조각들 → 사람이 읽는 한 줄(테스트·툴팁이 쓴다). 화면은 조각을 직접 그린다. */
export function exprToText(pieces: readonly ExprPiece[]): string {
    let out = "";
    for (const p of pieces) {
        if (p.kind === "leaf") out += `${p.neg ? "¬" : ""}${p.label}`;
        else if (p.kind === "ref") out += `${p.neg ? "¬" : ""}∈${p.label}`;
        else if (p.kind === "op") out += p.op === "and" ? " ∧ " : " ∨ ";
        else if (p.kind === "neg") out += "¬";
        else out += p.open ? "(" : ")";
    }
    return out;
}
