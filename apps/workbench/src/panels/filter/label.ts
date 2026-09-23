// 단계·술어의 표시 이름(순수). 화면 폭이 좁아 **짧게, 그리고 지워진 것은 지워졌다고** 말해야 한다.
//
// 죽은 참조를 이름 없이 id 로 흘리면(또는 조용히 건너뛰면) 화면에는 멀쩡한 조건처럼 보인다.
// 그래서 이름을 못 찾은 자리는 `(지워짐)` 으로 **눈에 띄게** 남긴다 — 판정에서 그게 미배치를 만들고 있으니
// 숫자와 화면이 같은 이야기를 해야 한다.
import { CELL_VALUE_FIELDS, TRANSITION_LABEL } from "@trade-data-manager/market/domain";
import { NONE_LABEL, isNoneLiteral, type GroupExpr } from "../rank/groupFilter.js";
import { shortDate } from "../../lib/date.js";
import { OUTCOME_METRIC_NAME } from "../../lib/outcomeMetric.js";
import type { ThemeStrengthParams } from "../../lib/themeStrength.js";
import { isPredicateEmpty, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

export interface LabelLookup {
    groupName: (id: string) => string | undefined;
    axisName: (id: string) => string | undefined;
}

import type { SetExpr } from "./expr.js";

const GONE = "(지워짐)";

/** DNF 를 한 줄로: 절끼리 `|`, 절 안은 `&`, 부정은 `!`. */
export function groupExprLabel(expr: GroupExpr, look: LabelLookup): string {
    return expr.groups
        .map((clause) =>
            clause.literals
                .map((l) => {
                    const name = isNoneLiteral(l.groupId) ? NONE_LABEL : (look.groupName(l.groupId) ?? GONE);
                    return `${l.neg ? "!" : ""}${name}`;
                })
                .join(" & "),
        )
        .join(" | ");
}

export function predicateLabel(p: FilterPredicate, look: LabelLookup): string {
    switch (p.kind) {
        case "group": return groupExprLabel(p.expr, look);
        case "axisBand": return look.axisName(p.axisId) ?? GONE;
        case "axisValue": return `${look.axisName(p.axisId) ?? GONE} 값`;
        case "date":
            return p.ranges.length === 1
                ? `${shortDate(p.ranges[0]!.from)}~${shortDate(p.ranges[0]!.to)}`
                : `날짜 ${p.ranges.length}구간`;
        case "time":
            return p.ranges.length === 1
                ? `${p.ranges[0]!.from}~${p.ranges[0]!.to}`
                : `시간 ${p.ranges.length}구간`;
        case "themeStrength": return themeStrengthLabel(p.params);
        // T 를 라벨에 싣는다 — 같은 지표의 조건이 T 별로 여러 줄 설 수 있어(2026-09-09 인스턴스화)
        // T 가 없으면 보드 목록에서 두 줄이 같은 이름으로 보인다.
        case "outcome": return `${OUTCOME_METRIC_NAME[p.metric]} @T${p.t}%`;
        case "outcomeRecovery": return `${p.recovered ? "저가 회복" : "저가 미회복"} @T${p.t}%`;
        // (W,r) 을 라벨에 싣는다 — 결과의 @T 와 같은 이유: 인스턴스가 여럿이라 없으면 두 줄이 같은 이름이 된다.
        case "hotPoints": return `급타점 수 (${p.w}분/${p.r}%)`;
        case "cellValue": return cellValueLabel(p);
        case "priorHighBreak": return `전고 돌파 (${p.days}일)`;
        case "gridPoint": return "격자 Point";
        // 노브를 라벨에 싣는다 — 같은 종류가 게이트·zigzag 별로 여러 줄 설 수 있다(hotPoints 의 (W,r) 선례).
        case "baselineBreak": return `기준선 돌파 ${dayKnobLabel(p)}`;
        case "levelRebreak": return `마디 재돌파 ${p.zigzagPct}% ${dayKnobLabel(p)}`;
    }
}

/** 하루 타점 노브 꼬리 — `50억 · 양봉 · m'0.5 · 전부`. 기본(레벨당 하나)은 안 적는다. */
function dayKnobLabel(p: Extract<FilterPredicate, { kind: "baselineBreak" | "levelRebreak" }>): string {
    return [`${p.gateEok}억`, p.bullOnly ? "양봉" : null, `m'${p.approachPct}`, p.onePerLevel ? null : "전부"]
        .filter((x): x is string => x !== null).join(" · ");
}

/** 셀 값 술어 한 줄 — `등락률 ≥ 5%` 처럼 경계까지 싣는다(같은 필드의 조건이 여럿 설 수 있다). */
function cellValueLabel(p: Extract<FilterPredicate, { kind: "cellValue" }>): string {
    const meta = CELL_VALUE_FIELDS[p.field];
    const r = p.ranges[0];
    const bound = r?.from?.kind === "value" ? `≥${r.from.value}` : r?.to?.kind === "value" ? `≤${r.to.value}` : "";
    const more = p.ranges.length > 1 ? ` 외 ${p.ranges.length - 1}구간` : "";
    return `${meta.label} ${bound}${meta.suffix}${more}`;
}

/** 전이 접미 — 라벨 뒤에 붙는 "· 하루 처음". 전이가 없으면 빈 문자열(호출부가 그냥 이어 붙인다). */
export const transitionSuffix = (p: FilterPredicate): string => {
    const t = "transition" in p ? p.transition : undefined;
    return t ? ` · ${TRANSITION_LABEL[t]}` : "";
};

/** 테마 강도 묶음 한 줄 — 존 N/M·기준 + 활성 하위 조건. 보드 행·막대·패널 칩이 같은 표기를 쓴다. */
export function themeStrengthLabel(p: ThemeStrengthParams): string {
    const conds = [
        p.countOn ? `동료≥${p.countMin}` : null,
        p.baseRankOn ? `기본≤${p.baseRankMax}` : null,
        p.zoneRankOn ? `존순위≤${p.zoneRankMax}` : null,
    ].filter((s): s is string => s !== null);
    const basis = p.basis === "amount" ? "대금" : "등락";
    // 창 표기 — 60분 창 행이 당일 행과 같은 이름이 되면 어느 자로 재는지 못 읽는다(hotPoints 의 (W,r) 과 같은 이유).
    const win = p.zoneAmountWindow === 60 ? " · 60분" : "";
    return `존 ${p.zoneRateN}/${p.zoneAmountN}${win} · ${basis}${conds.length > 0 ? ` · ${conds.join(" · ")}` : ""}`;
}

/** 단계가 무슨 도구인가 — 막대 아래 한 줄. 한 단계는 한 종류라 첫 술어가 곧 단계의 종류다. */
export function kindLabel(kind: PredicateKind | undefined): string {
    if (kind === undefined) return "";
    switch (kind) {
        case "group": return "그룹";
        case "axisBand":
        case "axisValue": return "축";
        case "date": return "날짜";
        case "time": return "시간";
        case "themeStrength": return "테마";
        case "outcome":
        case "outcomeRecovery": return "결과";
        case "hotPoints": return "급타점";
        case "cellValue": return "셀 값";
        case "priorHighBreak": return "전고";
        case "gridPoint": return "격자";
        case "baselineBreak":
        case "levelRebreak": return "타점";
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
 *
 * ⚠ **저장 시점에 굽지 않는다.** 재료인 `LabelLookup`(축 이름·그룹 이름)은 훅 재료라 스토어가
 * 동기로 초기화되는 시점엔 아직 없다 — 거기서 구우면 `c:supply-gap` 같은 축 **키**가 그대로
 * 이름으로 굳는다. 그래서 `SavedSet.name` 은 옵셔널이고 부재가 곧 "자동 이름"이다(점선 칩).
 */
export function autoSetName(expr: SetExpr, look: LabelLookup, nameOfSet: (setId: string) => string): string {
    // ⚠ **항 전부를 센다 — 조건만 세면 안 된다.** 새 모델에서 제일 흔한 모양이 `AND(참조, 참조)`(조건
    //   0개)인데, `leavesOf` 로만 재면 그게 "빈 집합"으로 불린다(칩·빵부스러기·목록이 한꺼번에 거짓말).
    //   decisions 의 "`leavesOf` 로 재는 판정엔 `refsOf` 를 따로 물어야 한다"를 여기서 또 밟았었다.
    const terms = expr.of;
    if (terms.length === 0) return "빈 집합";
    const head = terms[0]!;
    const headLabel = head.kind === "cond" ? stageLabel(head.stage, look) : nameOfSet(head.setId);
    return terms.length === 1 ? headLabel : `${headLabel} 외 ${terms.length - 1}`;
}

/**
 * 집합이 화면에 쓰는 이름 — **여기가 유일한 출처**다. 손 이름이 있으면 그것, 없으면 자동 이름.
 * 두 곳에서 지으면 같은 집합이 칩과 목록에서 다른 이름으로 선다.
 */
export const setDisplayName = (
    set: { name?: string; expr: SetExpr },
    look: LabelLookup,
    /** 참조 항의 이름 — 안 주면 "(묶음)". 재귀를 안 타는 이유: 이름 짓다가 그래프를 걷지 않는다. */
    nameOfSet: (setId: string) => string = () => "(묶음)",
): string => set.name ?? autoSetName(set.expr, look, nameOfSet);

/** 손으로 준 이름이 있으면 그것, 없으면 조건에서 만든다. 빈 술어는 이름에 안 낀다. */
export function stageLabel(s: FilterStage, look: LabelLookup): string {
    if (s.name) return s.name;
    const parts = s.predicates.filter((p) => !isPredicateEmpty(p)).map((p) => predicateLabel(p, look));
    return parts.length === 0 ? "조건 없음" : parts.join(" · ");
}
