// 단계·술어의 표시 이름(순수). 화면 폭이 좁아 **짧게, 그리고 지워진 것은 지워졌다고** 말해야 한다.
//
// 죽은 참조를 이름 없이 id 로 흘리면(또는 조용히 건너뛰면) 화면에는 멀쩡한 조건처럼 보인다.
// 그래서 이름을 못 찾은 자리는 `(지워짐)` 으로 **눈에 띄게** 남긴다 — 판정에서 그게 미배치를 만들고 있으니
// 숫자와 화면이 같은 이야기를 해야 한다.
import { noneLabelOf, noneScope, type GroupExpr } from "../rank/groupFilter.js";
import { shortDate } from "../../lib/date.js";
import type { ThemeStrengthParams } from "../../lib/themeStrength.js";
import { isPredicateEmpty, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

export interface LabelLookup {
    groupName: (id: string) => string | undefined;
    axisName: (id: string) => string | undefined;
}

const GONE = "(지워짐)";

/** DNF 를 한 줄로: 절끼리 `|`, 절 안은 `&`, 부정은 `!`. */
export function groupExprLabel(expr: GroupExpr, look: LabelLookup): string {
    return expr.groups
        .map((clause) =>
            clause.literals
                .map((l) => {
                    const none = noneScope(l.groupId);
                    const name = none !== undefined ? noneLabelOf(none) : (look.groupName(l.groupId) ?? GONE);
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
    }
}

/** 테마 강도 묶음 한 줄 — 존 N/M·기준 + 활성 하위 조건. 보드 행·막대·패널 칩이 같은 표기를 쓴다. */
export function themeStrengthLabel(p: ThemeStrengthParams): string {
    const conds = [
        p.countOn ? `동료≥${p.countMin}` : null,
        p.baseRankOn ? `기본≤${p.baseRankMax}` : null,
        p.zoneRankOn ? `존순위≤${p.zoneRankMax}` : null,
    ].filter((s): s is string => s !== null);
    const basis = p.basis === "amount" ? "대금" : "등락";
    return `존 ${p.zoneRateN}/${p.zoneAmountN} · ${basis}${conds.length > 0 ? ` · ${conds.join(" · ")}` : ""}`;
}

/** 단계가 무슨 도구인가 — 막대 아래 한 줄. 한 단계는 한 종류라 첫 술어가 곧 단계의 종류다. */
export function kindLabel(kind: PredicateKind | undefined): string {
    switch (kind) {
        case "group": return "그룹";
        case "axisBand":
        case "axisValue": return "축";
        case "date": return "날짜";
        case "time": return "시간";
        case "themeStrength": return "테마";
        default: return "";
    }
}

/** 손으로 준 이름이 있으면 그것, 없으면 조건에서 만든다. 빈 술어는 이름에 안 낀다. */
export function stageLabel(s: FilterStage, look: LabelLookup): string {
    if (s.name) return s.name;
    const parts = s.predicates.filter((p) => !isPredicateEmpty(p)).map((p) => predicateLabel(p, look));
    return parts.length === 0 ? "조건 없음" : parts.join(" · ");
}
