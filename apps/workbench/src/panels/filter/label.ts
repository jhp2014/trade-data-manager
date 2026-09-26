// 단계·술어의 표시 이름(순수). 화면 폭이 좁아 **짧게** 말해야 한다.
// (옛 LabelLookup — 그룹·축 이름 사전 — 은 2026-09-26 종단 폐기로 은퇴: 남은 종류는 이름 재료가 전부 payload 다.)
import { CANDLE_SHAPE_LABEL, CELL_VALUE_FIELDS } from "@trade-data-manager/market/domain";
import { isPredicateEmpty, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";
import { breakoutText } from "../breakout/chainChecks.js";

import type { SetExpr } from "./expr.js";

export function predicateLabel(p: FilterPredicate): string {
    switch (p.kind) {
        case "time":
            return p.ranges.length === 1
                ? `${p.ranges[0]!.from}~${p.ranges[0]!.to}`
                : `시간 ${p.ranges.length}구간`;
        case "theme": return themeZoneLabel(p);
        case "cellValue": return cellValueLabel(p);
        case "priorHighBreak": return `전고 돌파 (${p.days}일)`;
        // 요약 라벨(breakoutText) — 돌파 줄이 여럿이면 이 요약이 서로를 가른다.
        case "breakout": return breakoutText(p);
        case "candleShape": return CANDLE_SHAPE_LABEL[p.shape];
    }
}

/** 셀 값 술어 한 줄 — `등락률 ≥ 5%` 처럼 경계까지 싣는다(같은 필드의 조건이 여럿 설 수 있다). */
function cellValueLabel(p: Extract<FilterPredicate, { kind: "cellValue" }>): string {
    const meta = CELL_VALUE_FIELDS[p.field];
    const r = p.ranges[0];
    const bound = r?.from?.kind === "value" ? `≥${r.from.value}` : r?.to?.kind === "value" ? `≤${r.to.value}` : "";
    const more = p.ranges.length > 1 ? ` 외 ${p.ranges.length - 1}구간` : "";
    return `${meta.label} ${bound}${meta.suffix}${more}`;
}

/** 테마 존 술어 한 줄 — 존(창·대금 N·등락 축) + 켜진 컷만. 보드 행·막대·패널 칩이 같은 표기를 쓴다. */
export function themeZoneLabel(p: Extract<FilterPredicate, { kind: "theme" }>): string {
    const win = p.window === null ? "당일" : `${p.window}분`;
    const rate = p.rate.mode === "rank" ? `등락≤${p.rate.max}` : `등락≥${p.rate.minPct}%`;
    const cuts = [
        p.countOn ? `재적≥${p.countMin}` : null,
        p.zoneRankOn ? `존≤${p.zoneRankMax}` : null,
        p.baseRankOn ? `기본≤${p.baseRankMax}` : null,
    ].filter(Boolean).join(" ");
    return `테마 ${win} 대금≤${p.zoneAmountN}·${rate}${cuts ? ` ${cuts}` : ""}${p.enter === true ? " · 진입" : ""}`;
}

/** 단계가 무슨 도구인가 — 막대 아래 한 줄. 한 단계는 한 종류라 첫 술어가 곧 단계의 종류다. */
export function kindLabel(kind: PredicateKind | undefined): string {
    if (kind === undefined) return "";
    switch (kind) {
        case "time": return "시간";
        case "theme": return "테마";
        case "cellValue": return "셀 값";
        case "priorHighBreak": return "전고";
        case "breakout": return "타점";
        case "candleShape": return "캔들";
        default: {
            // 자물쇠 — 옛 `default: return ""` 는 종류를 빠뜨려도 컴파일이 통과하고 증상이 조용했다
            // (보드 줄의 종류 라벨만 빈칸). `never` 대입이 그 구멍을 컴파일 에러로 바꾼다.
            const missing: never = kind;
            void missing;
            return "";
        }
    }
}

/**
 * 집합의 **자동 이름** — 손으로 지은 이름이 없을 때 화면이 쓰는 것(2026-09-20).
 */
export function autoSetName(expr: SetExpr, nameOfSet: (setId: string) => string): string {
    // ⚠ **항 전부를 센다 — 조건만 세면 안 된다.** 새 모델에서 제일 흔한 모양이 `AND(참조, 참조)`(조건
    //   0개)인데, `leavesOf` 로만 재면 그게 "빈 집합"으로 불린다(칩·빵부스러기·목록이 한꺼번에 거짓말).
    //   decisions 의 "`leavesOf` 로 재는 판정엔 `refsOf` 를 따로 물어야 한다"를 여기서 또 밟았었다.
    const terms = expr.of;
    if (terms.length === 0) return "빈 집합";
    const head = terms[0]!;
    const headLabel = head.kind === "cond" ? stageLabel(head.stage) : nameOfSet(head.setId);
    return terms.length === 1 ? headLabel : `${headLabel} 외 ${terms.length - 1}`;
}

/**
 * 집합이 화면에 쓰는 이름 — **여기가 유일한 출처**다. 손 이름이 있으면 그것, 없으면 자동 이름.
 * 두 곳에서 지으면 같은 집합이 칩과 목록에서 다른 이름으로 선다.
 */
export const setDisplayName = (
    set: { name?: string; expr: SetExpr },
    /** 참조 항의 이름 — 안 주면 "(묶음)". 재귀를 안 타는 이유: 이름 짓다가 그래프를 걷지 않는다. */
    nameOfSet: (setId: string) => string = () => "(묶음)",
): string => set.name ?? autoSetName(set.expr, nameOfSet);

/** 손으로 준 이름이 있으면 그것, 없으면 조건에서 만든다. 빈 술어는 이름에 안 낀다. */
export function stageLabel(s: FilterStage): string {
    if (s.name) return s.name;
    const parts = s.predicates.filter((p) => !isPredicateEmpty(p)).map((p) => predicateLabel(p));
    return parts.length === 0 ? "조건 없음" : parts.join(" · ");
}
