// 식의 **한 줄 표기**(순수) — 집합 하나를 칩·연산자·괄호 조각으로 낸다.
//
// ## 괄호는 손으로 친 것을 그대로 그린다
// 옛 「최소 괄호」(우선순위로 복원되는 괄호는 안 그린다)는 **부활하지 않는다**. 저장물이 든
// `groups` 를 그대로 조각으로 낸다 — 숨은 우선순위가 없으므로 지워도 되는 괄호라는 개념 자체가 없다.
//
// ## 연산자 조각은 **제 자리(경계 번호)** 를 들고 나간다
// 화면이 그 자리를 눌러 `AND ↔ OR` 을 바꾸고 「이 자리를 바깥으로」를 건다. 번호가 없으면 화면이
// 조각 순서에서 경계를 되계산해야 하는데, 괄호 조각이 섞여 있어 그 계산이 조용히 어긋난다.
//
// ⚠ 식을 **텍스트로 입력받는 입구는 만들지 않는다** — 칩 편집과 두 문법이 되면 옛 "필터 UI 가
// 두 곳"의 함정을 그대로 밟는다. 여기는 **출력 전용**이다.
import { idOf, opAt, type Op, type SetExpr } from "./expr.js";

/** 한 줄의 조각 — 화면이 칩·기호를 각자 다르게 칠할 수 있게 종류를 들고 나간다. */
export type ExprPiece =
    /** 조건 칩 — `id` 로 그 항의 편집면을 **아랫줄에** 연다. `neg` 면 앞에 NOT 이 붙은 채 그려진다. */
    | { kind: "leaf"; id: string; label: string; neg: boolean; enabled: boolean }
    /** 참조 칩 — 다른 집합 한 벌. 누르면 **그 집합으로 내려간다**(경로가 자란다). */
    | { kind: "ref"; id: string; setId: string; label: string; neg: boolean }
    /** 연산자 — 칩 사이의 접속. 낱말로 적고(`AND`/`OR`), `at` 은 그 경계의 번호다. */
    | { kind: "op"; op: Op; at: number; inGroup: boolean }
    /** 괄호 — 손으로 친 한 겹. `at` 은 그 괄호가 덮는 첫 항의 번호(열기·닫기가 같은 값). */
    | { kind: "open"; at: number }
    | { kind: "close"; at: number };

/**
 * 식 → 한 줄 조각들. `labelOf` 는 조건 한 줄의 이름을 주는 함수(보드의 `stageLabel` 을 그대로 넘긴다).
 * 항을 순서대로 늘어놓고 사이에 연산자를, 괄호 구간의 양끝에 괄호를 끼운다.
 */
export function renderExpr(
    e: SetExpr,
    labelOf: (id: string) => string,
    /** 참조의 이름 — 없으면 "(지워진 집합)". 안 주면 setId 를 그대로 적는다(테스트 편의). */
    setNameOf: (setId: string) => string = (id) => id,
): ExprPiece[] {
    const out: ExprPiece[] = [];
    const opens = new Map(e.groups.map((g) => [g.from, g] as const));
    const closes = new Map(e.groups.map((g) => [g.to, g] as const));
    e.of.forEach((t, i) => {
        if (i > 0) {
            // ⚠ 연산자는 **괄호 안쪽**에 서야 한다 — `(a AND b) OR c` 에서 AND 는 괄호 안, OR 은 밖.
            //   닫는 괄호를 연산자보다 먼저 내는 것이 그 순서를 만든다.
            const closed = closes.get(i - 1);
            if (closed) out.push({ kind: "close", at: closed.from });
            out.push({ kind: "op", op: opAt(e, i - 1), at: i - 1, inGroup: e.groups.some((g) => g.from <= i - 1 && i <= g.to) });
        }
        const opened = opens.get(i);
        if (opened) out.push({ kind: "open", at: opened.from });
        const neg = t.neg === true;
        if (t.kind === "cond") out.push({ kind: "leaf", id: idOf(t), label: labelOf(idOf(t)), neg, enabled: t.stage.enabled });
        else out.push({ kind: "ref", id: t.id, setId: t.setId, label: setNameOf(t.setId), neg });
    });
    const last = closes.get(e.of.length - 1);
    if (last) out.push({ kind: "close", at: last.from });
    return out;
}

/** 조각들 → 사람이 읽는 한 줄(테스트·툴팁이 쓴다). 화면은 조각을 직접 그린다. */
export function exprToText(pieces: readonly ExprPiece[]): string {
    let out = "";
    for (const p of pieces) {
        if (p.kind === "leaf" || p.kind === "ref") out += `${p.neg ? "NOT " : ""}${p.label}`;
        else if (p.kind === "op") out += p.op === "and" ? " AND " : " OR ";
        else if (p.kind === "open") out += "(";
        else out += ")";
    }
    // 괄호 안쪽 공백을 다듬는다 — `( a AND b )` 가 아니라 `(a AND b)` 로 읽혀야 한다.
    return out.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}
