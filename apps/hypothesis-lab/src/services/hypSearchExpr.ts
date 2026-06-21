/**
 * 가설 텍스트 검색식: 가설 패널 "검색 모드"에서 가설 자체를 거르는 조건식.
 *
 *   문법:  삼성 반도체 | #급등 & !장기
 *   리프:  일반 단어(text 부분일치) / #태그(태그 일치)
 *   연산:  NOT(!) > AND(공백 또는 &) > OR(|)   — 공백은 암묵적 AND
 *
 * 케이스를 거르는 hypExpr 와 달리 리프가 한글 단어·#태그라 별도 파서가 필요하다.
 * 키워드(and/or/not)는 가설 텍스트에 실제로 등장할 수 있어 쓰지 않고 기호만 쓴다.
 */
export type HypSearchExpr =
    | { kind: "term"; field: "text" | "tag"; value: string }
    | { kind: "not"; expr: HypSearchExpr }
    | { kind: "and"; items: HypSearchExpr[] }
    | { kind: "or"; items: HypSearchExpr[] };

export type SearchParseResult =
    | { ok: true; expr: HypSearchExpr }
    | { ok: false; error: string };

type Token =
    | { t: "lparen" }
    | { t: "rparen" }
    | { t: "and" }
    | { t: "or" }
    | { t: "not" }
    | { t: "term"; field: "text" | "tag"; value: string };

const OPERATORS = new Set(["(", ")", "&", "|", "!"]);

function isWordChar(c: string): boolean {
    return c !== " " && c !== "\t" && c !== "\n" && c !== "\r" && !OPERATORS.has(c);
}

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
        } else {
            // 단어 런: 공백·연산자 전까지. 선두 # 면 태그 리프.
            let j = i;
            while (j < input.length && isWordChar(input[j])) j++;
            const word = input.slice(i, j);
            if (word.startsWith("#")) {
                tokens.push({ t: "term", field: "tag", value: word.slice(1) });
            } else {
                tokens.push({ t: "term", field: "text", value: word });
            }
            i = j;
        }
    }
    return tokens;
}

/** 재귀하강 파서. NOT > AND(공백 암묵) > OR. 같은 연산자 연속은 n-항으로 평탄화. */
export function parseHypSearchExpr(input: string): SearchParseResult {
    const tokens = tokenize(input);
    if (tokens.length === 0) return { ok: false, error: "검색어가 비어 있습니다" };

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const atomStart = (t: Token | undefined) =>
        t != null && (t.t === "term" || t.t === "not" || t.t === "lparen");

    function parseOr(): HypSearchExpr {
        const items = [parseAnd()];
        while (peek()?.t === "or") {
            next();
            items.push(parseAnd());
        }
        return items.length === 1 ? items[0] : { kind: "or", items };
    }
    function parseAnd(): HypSearchExpr {
        const items = [parseNot()];
        while (true) {
            const t = peek();
            if (t?.t === "and") {
                next();
                items.push(parseNot());
            } else if (atomStart(t)) {
                // 연산자 없이 이어지는 단어 → 암묵적 AND
                items.push(parseNot());
            } else {
                break;
            }
        }
        return items.length === 1 ? items[0] : { kind: "and", items };
    }
    function parseNot(): HypSearchExpr {
        if (peek()?.t === "not") {
            next();
            return { kind: "not", expr: parseNot() };
        }
        return parseAtom();
    }
    function parseAtom(): HypSearchExpr {
        const tok = peek();
        if (!tok) throw new Error("검색어가 필요한 자리입니다");
        if (tok.t === "lparen") {
            next();
            const inner = parseOr();
            if (peek()?.t !== "rparen") throw new Error("괄호가 맞지 않습니다");
            next();
            return inner;
        }
        if (tok.t === "term") {
            next();
            return { kind: "term", field: tok.field, value: tok.value };
        }
        throw new Error("검색어가 필요한 자리입니다");
    }

    let expr: HypSearchExpr;
    try {
        expr = parseOr();
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
    if (pos !== tokens.length) {
        return {
            ok: false,
            error: peek()?.t === "rparen" ? "괄호가 맞지 않습니다" : "예기치 않은 토큰",
        };
    }
    return { ok: true, expr };
}

/** 검색 대상 가설의 텍스트와 태그 목록. */
export type HypMatchTarget = { text: string; tags: string[] };

/** 식이 이 가설에 매칭되는가. text=부분일치, tag=태그명 부분일치(둘 다 대소문자 무시). */
export function matchHypSearch(expr: HypSearchExpr, target: HypMatchTarget): boolean {
    switch (expr.kind) {
        case "term": {
            const needle = expr.value.toLowerCase();
            if (expr.field === "text") return target.text.toLowerCase().includes(needle);
            return target.tags.some((t) => t.toLowerCase().includes(needle));
        }
        case "not":
            return !matchHypSearch(expr.expr, target);
        case "and":
            return expr.items.every((e) => matchHypSearch(e, target));
        case "or":
            return expr.items.some((e) => matchHypSearch(e, target));
    }
}
