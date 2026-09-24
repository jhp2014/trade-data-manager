// 사슬 필터 식의 **말** — 조건 이름·칩 글자·식 한 줄 요약. 격자판의 칩·「＋ 조건」 메뉴와 생성소 줄 이름표·
// 기본 차트 사슬 층 출처 목록이 같은 이 한 벌을 쓴다(말이 두 벌이면 같은 조건을 두 이름으로 부른다).
import {
    foldFlat,
    isFoldedFlat,
    type CellPredicate,
    type ChainCond,
    type ChainCondKind,
    type ChainFilter,
    type ChainTerm,
    type FoldedFlat,
} from "@trade-data-manager/market/domain";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

export const COND_NAME: Record<ChainCondKind, string> = {
    pos: "봉 순번",
    amount: "봉 대금",
    openHigh: "시가→고가",
    openClose: "시가→종가",
    sessionHigh: "세션 고가 돌파",
    label: "이름표",
};

export const COND_HINT: Record<ChainCondKind, string> = {
    pos: "사슬 첫 봉 = 0 부터 센 봉 수 범위",
    amount: "그 봉 거래대금 ≥ N억",
    openHigh: "그 봉 시가 대비 고가 상승폭(%) 범위",
    openClose: "그 봉 시가 대비 종가(%) 범위 — 양봉 = 0 초과, 음봉 = 0 미만",
    sessionHigh: "그 봉 고가 ≥ 직전까지 세션 최고가(터치 포함) — 아님은 NOT",
    label: "그 봉 시점 이름표 — 기준선 돌파 / 고가 돌파",
};

/** 조건을 새로 걸 때의 첫 값 — 걸자마자 무언가를 거르도록. */
export function defaultCond(kind: ChainCondKind): ChainCond {
    switch (kind) {
        case "pos": return { kind: "pos", max: 10 };
        case "amount": return { kind: "amount", minEok: 50 };
        case "openHigh": return { kind: "openHigh", min: 1 };
        case "openClose": return { kind: "openClose", min: 0 };
        case "sessionHigh": return { kind: "sessionHigh" };
        case "label": return { kind: "label", label: "baseline" };
    }
}

const num = (v: number): string => String(Math.round(v * 100) / 100);

export function rangeText(r: { min?: number; max?: number }, unit: string): string {
    if (r.min !== undefined && r.max !== undefined) return `${num(r.min)}~${num(r.max)}${unit}`;
    if (r.min !== undefined) return `≥ ${num(r.min)}${unit}`;
    if (r.max !== undefined) return `≤ ${num(r.max)}${unit}`;
    return "무관";
}

/** 조건 칩의 글자(순번·NOT 없이). */
export function condText(c: ChainCond): string {
    switch (c.kind) {
        case "pos": return `봉 순번 ${rangeText(c, "봉")}`;
        case "amount": return `봉 대금 ≥ ${num(c.minEok)}억`;
        case "openHigh": return `시가→고가 ${rangeText(c, "%")}`;
        case "openClose": return `시가→종가 ${rangeText(c, "%")}`;
        case "sessionHigh": return "세션 고가 돌파";
        case "label": return c.label === "baseline" ? "기준선 돌파" : "고가 돌파";
    }
}

export const firstKText = (k: number): string => `처음 ${k}`;
export const rankText = (k: number | null): string => (k === null ? "전부" : `처음 ${k}개`);

const termText = (t: ChainTerm): string =>
    `${t.neg === true ? "NOT " : ""}${condText(t.cond)}${t.firstK !== undefined ? ` · ${firstKText(t.firstK)}` : ""}`;

/** 식 한 줄 — 접기(core foldFlat) 결과로 적는다(표시와 평가가 같은 접기를 지난다). 빈 식이면 "". */
export function chainExprText(f: ChainFilter): string {
    const item = (x: ChainTerm | FoldedFlat<ChainTerm>, root: boolean): string => {
        if (!isFoldedFlat(x)) return termText(x);
        const body = x.of.map((y) => item(y, false)).join(x.kind === "and" ? " AND " : " OR ");
        if (root) return body;
        return `${x.neg === true ? "NOT " : ""}(${body})${x.firstK !== undefined ? ` · ${firstKText(x.firstK)}` : ""}`;
    };
    return f.expr.of.length === 0 ? "" : item(foldFlat(f.expr), true);
}

/** 생성소 줄 이름표용 요약 — 식 + 식 전체 순번. */
export function chainSummary(p: BreakoutPred): string {
    const e = chainExprText(p.chain);
    return e === "" ? rankText(p.chain.firstK) : `${e} · ${rankText(p.chain.firstK)}`;
}

/** 「돌파」 술어의 표시 이름 — 생성소 줄 이름표·차트 사슬 층 출처 목록이 같은 한 벌. */
export const breakoutText = (p: BreakoutPred): string => `돌파 ${p.zigzagPct}%/${p.bandPct}% · ${chainSummary(p)}`;

/** 짧은 격자 이름 — 차트 사슬 층 출처 목록(좁은 판)용. 식은 hover 로. */
export const gridText = (p: BreakoutPred): string => `${p.zigzagPct}% / ${p.bandPct}% · ${rankText(p.chain.firstK)}`;
