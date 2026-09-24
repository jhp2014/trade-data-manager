// 사슬 필터 봉 조건의 **말** — 이름·값 설명·요약. 격자판의 레인 이름표·마우스 설명·「＋ 사슬 필터」 메뉴와
// 생성소 줄 이름표가 같은 이 한 벌을 쓴다(말이 두 벌이면 같은 조건을 두 이름으로 부른다).
import {
    movePct,
    type BreakoutLabelFilter,
    type ChainBar,
    type ChainCheck,
    type ChainFilter,
    type ChainRange,
    type ChainSeries,
    type CellPredicate,
} from "@trade-data-manager/market/domain";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

export const CHECK_NAME: Record<ChainCheck, string> = {
    pos: "봉 순번",
    amount: "봉 대금",
    openHigh: "시가→고가",
    openClose: "시가→종가",
    sessionHigh: "세션 고가",
    label: "이름표",
};

export const CHECK_HINT: Record<ChainCheck, string> = {
    pos: "사슬 첫 봉 = 0 부터 센 봉 수 범위",
    amount: "그 봉 거래대금 ≥ N억",
    openHigh: "그 봉 시가 대비 고가 상승폭(%) 범위",
    openClose: "그 봉 시가 대비 종가(%) 범위 — 양봉 = 0 초과, 음봉 = 0 미만",
    sessionHigh: "그 봉 고가 ≥ 직전까지 세션 최고가(터치 포함)",
    label: "그 봉 시점 이름표 — 기준선 돌파 / 고가 돌파",
};

const num = (v: number): string => String(Math.round(v * 100) / 100);

export function rangeText(r: ChainRange | undefined, unit: string): string {
    if (r === undefined) return "무관";
    if (r.min !== undefined && r.max !== undefined) return `${num(r.min)}~${num(r.max)}${unit}`;
    if (r.min !== undefined) return `≥ ${num(r.min)}${unit}`;
    if (r.max !== undefined) return `≤ ${num(r.max)}${unit}`;
    return "무관";
}

export const labelText = (l: BreakoutLabelFilter): string => (l === "baseline" ? "기준선 돌파" : l === "high" ? "고가 돌파" : "전부");

/** 조건의 기준(무엇을 요구하나) — 레인 이름표·설명. */
export function checkRuleText(c: ChainCheck, f: ChainFilter, label: BreakoutLabelFilter): string {
    switch (c) {
        case "pos": return rangeText(f.pos, "봉");
        case "amount": return f.amountEok === undefined ? "무관" : `≥ ${num(f.amountEok)}억`;
        case "openHigh": return rangeText(f.openHigh, "%");
        case "openClose": return rangeText(f.openClose, "%");
        case "sessionHigh": return f.sessionHigh === "yes" ? "돌파만" : f.sessionHigh === "no" ? "아님" : "무관";
        case "label": return `${labelText(label)}만`;
    }
}

/** 그 봉의 실제 값 — 마우스 설명("무엇이 왜 떨어졌나"). */
export function checkValueText(c: ChainCheck, b: ChainBar, s: ChainSeries): string {
    switch (c) {
        case "pos": return `${b.pos}봉`;
        case "amount": return `${num(b.tv / 1e8)}억`;
        case "openHigh": return `${num(movePct(s.minuteOpen[b.i], s.minuteHigh[b.i]))}%`;
        case "openClose": return `${num(movePct(s.minuteOpen[b.i], s.rate[b.i]))}%`;
        case "sessionHigh": return b.sessionHigh ? "돌파" : "아님";
        case "label": return labelText(b.label);
    }
}

export const rankText = (f: ChainFilter): string => (f.firstK === null ? "전부" : `처음 ${f.firstK}개`);

/** 생성소 줄 이름표용 한 줄 요약 — 걸린 봉 조건 + 순번. */
export function chainSummary(p: BreakoutPred): string {
    const f = p.chain;
    const parts: string[] = [];
    if (f.pos) parts.push(`봉 ${rangeText(f.pos, "")}`);
    if (f.amountEok !== undefined) parts.push(`${num(f.amountEok)}억↑`);
    if (f.openHigh) parts.push(`시→고 ${rangeText(f.openHigh, "%")}`);
    if (f.openClose) parts.push(`시→종 ${rangeText(f.openClose, "%")}`);
    if (f.sessionHigh) parts.push(f.sessionHigh === "yes" ? "세션고가" : "세션고가 아님");
    if (p.label !== "all") parts.push(p.label === "baseline" ? "기준선" : "고가");
    parts.push(rankText(f));
    return parts.join(" · ");
}
