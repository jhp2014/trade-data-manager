import type { CaseSearchResult } from "@/services/caseSearch";
import type { HypothesisSnapshot } from "@/domain/types";

/**
 * 가설 불리언식: 작업대 "불리언 필터 모드"에서 전체 case 를 거르는 조건식.
 *
 *   문법:  ((H0001 & H0002) or H0003) and !H0004
 *   연산:  NOT(! / not) > AND(& / and) > OR(| / or)   — NOT 최우선
 *   리프:  가설 코드(H0001). 평가 시 코드를 가설 id 로 해석한다.
 *
 * AST 는 표시(재귀 그룹 렌더)와 평가에 공용으로 쓰므로 리프에 "코드"를 보존한다.
 * and/or 는 같은 연산자 연속을 하나로 평탄화한 n-항으로 둔다(그룹 렌더에 유리).
 */
export type HypExpr =
    | { kind: "ref"; code: string }
    | { kind: "not"; expr: HypExpr }
    | { kind: "and"; items: HypExpr[] }
    | { kind: "or"; items: HypExpr[] };

export type ParseResult = { ok: true; expr: HypExpr } | { ok: false; error: string };

type Token =
    | { t: "lparen" }
    | { t: "rparen" }
    | { t: "and" }
    | { t: "or" }
    | { t: "not" }
    | { t: "ref"; code: string };

const KEYWORDS: Record<string, Token["t"]> = { and: "and", or: "or", not: "not" };

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        const c = input[i];
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i++;
            continue;
        }
        if (c === "(") {
            tokens.push({ t: "lparen" });
            i++;
        } else if (c === ")") {
            tokens.push({ t: "rparen" });
            i++;
        } else if (c === "&") {
            tokens.push({ t: "and" });
            i++;
        } else if (c === "|") {
            tokens.push({ t: "or" });
            i++;
        } else if (c === "!") {
            tokens.push({ t: "not" });
            i++;
        } else if (/[A-Za-z0-9_]/.test(c)) {
            let j = i + 1;
            while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
            const word = input.slice(i, j);
            const kw = KEYWORDS[word.toLowerCase()];
            if (kw) tokens.push({ t: kw } as Token);
            else tokens.push({ t: "ref", code: word.toUpperCase() });
            i = j;
        } else {
            throw new Error(`알 수 없는 문자: '${c}'`);
        }
    }
    return tokens;
}

/** 재귀하강 파서. NOT > AND > OR. 같은 연산자 연속은 n-항으로 평탄화. */
export function parseHypExpr(input: string): ParseResult {
    let tokens: Token[];
    try {
        tokens = tokenize(input);
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
    if (tokens.length === 0) return { ok: false, error: "식이 비어 있습니다" };

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    function parseOr(): HypExpr {
        const items = [parseAnd()];
        while (peek()?.t === "or") {
            next();
            items.push(parseAnd());
        }
        return items.length === 1 ? items[0] : { kind: "or", items };
    }
    function parseAnd(): HypExpr {
        const items = [parseNot()];
        while (peek()?.t === "and") {
            next();
            items.push(parseNot());
        }
        return items.length === 1 ? items[0] : { kind: "and", items };
    }
    function parseNot(): HypExpr {
        if (peek()?.t === "not") {
            next();
            return { kind: "not", expr: parseNot() };
        }
        return parseAtom();
    }
    function parseAtom(): HypExpr {
        const tok = peek();
        if (!tok) throw new Error("가설 코드가 필요한 자리입니다");
        if (tok.t === "lparen") {
            next();
            const inner = parseOr();
            if (peek()?.t !== "rparen") throw new Error("괄호가 맞지 않습니다");
            next();
            return inner;
        }
        if (tok.t === "ref") {
            next();
            return { kind: "ref", code: tok.code };
        }
        throw new Error("가설 코드가 필요한 자리입니다");
    }

    let expr: HypExpr;
    try {
        expr = parseOr();
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
    if (pos !== tokens.length) {
        return { ok: false, error: peek()?.t === "rparen" ? "괄호가 맞지 않습니다" : "예기치 않은 토큰" };
    }
    return { ok: true, expr };
}

/** 식에 등장하는 모든 가설 코드(중복 제거, 등장 순서). */
export function collectRefs(expr: HypExpr): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const walk = (e: HypExpr) => {
        switch (e.kind) {
            case "ref":
                if (!seen.has(e.code)) {
                    seen.add(e.code);
                    out.push(e.code);
                }
                break;
            case "not":
                walk(e.expr);
                break;
            default:
                e.items.forEach(walk);
        }
    };
    walk(expr);
    return out;
}

/** 식의 코드 중 knownCodes 에 없는 것(알 수 없는 가설). UI 경고용. */
export function unknownRefs(expr: HypExpr, knownCodes: Iterable<string>): string[] {
    const known = new Set(knownCodes);
    return collectRefs(expr).filter((c) => !known.has(c));
}

/** hasCode(code) = "이 case 가 그 가설에 연결되어 있는가". 알 수 없는 코드는 false. */
export function evalHypExpr(expr: HypExpr, hasCode: (code: string) => boolean): boolean {
    switch (expr.kind) {
        case "ref":
            return hasCode(expr.code);
        case "not":
            return !evalHypExpr(expr.expr, hasCode);
        case "and":
            return expr.items.every((e) => evalHypExpr(e, hasCode));
        case "or":
            return expr.items.some((e) => evalHypExpr(e, hasCode));
    }
}

type SnapshotSlice = Pick<HypothesisSnapshot, "cases" | "hypothesisCases" | "hypotheses">;

/**
 * 불리언식으로 전체 case 를 거른다(모집단 = snapshot.cases 전체).
 * 가설이 0개 연결된 case 도 평가 대상 — 양수 리프엔 실패하고 NOT 엔 통과한다.
 */
export function searchCasesByExpr(snapshot: SnapshotSlice, expr: HypExpr): CaseSearchResult[] {
    const codeToId = new Map(snapshot.hypotheses.map((h) => [h.code, h.id]));
    const caseToHyps = new Map<string, Set<string>>();
    for (const hc of snapshot.hypothesisCases) {
        const set = caseToHyps.get(hc.caseId);
        if (set) set.add(hc.hypothesisId);
        else caseToHyps.set(hc.caseId, new Set([hc.hypothesisId]));
    }

    const results: CaseSearchResult[] = [];
    for (const c of snapshot.cases) {
        const hyps = caseToHyps.get(c.caseId) ?? new Set<string>();
        const hasCode = (code: string) => {
            const id = codeToId.get(code);
            return id != null && hyps.has(id);
        };
        if (evalHypExpr(expr, hasCode)) {
            results.push({ caseId: c.caseId, linkedHypothesisIds: [...hyps] });
        }
    }
    return results;
}
