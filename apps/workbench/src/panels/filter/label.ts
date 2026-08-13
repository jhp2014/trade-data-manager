// 단계·술어의 표시 이름(순수). 화면 폭이 좁아 **짧게, 그리고 지워진 것은 지워졌다고** 말해야 한다.
//
// 죽은 참조를 이름 없이 id 로 흘리면(또는 조용히 건너뛰면) 화면에는 멀쩡한 조건처럼 보인다.
// 그래서 이름을 못 찾은 자리는 `(지워짐)` 으로 **눈에 띄게** 남긴다 — 판정에서 그게 미배치를 만들고 있으니
// 숫자와 화면이 같은 이야기를 해야 한다.
import { NO_TAGS, type GroupExpr } from "../rank/groupFilter.js";
import { shortDate } from "./datetime.js";
import { isPredicateEmpty, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

export interface LabelLookup {
    groupName: (id: string) => string | undefined;
    axisName: (id: string) => string | undefined;
}

const GONE = "(지워짐)";
const NONE_LABEL = "그룹 없음";

/** DNF 를 한 줄로: 절끼리 `|`, 절 안은 `&`, 부정은 `!`. */
export function groupExprLabel(expr: GroupExpr, look: LabelLookup): string {
    return expr.groups
        .map((clause) =>
            clause.literals
                .map((l) => {
                    const name = l.groupId === NO_TAGS ? NONE_LABEL : (look.groupName(l.groupId) ?? GONE);
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
    }
}

/** 단계가 무슨 도구인가 — 막대 아래 한 줄. 한 단계는 한 종류라 첫 술어가 곧 단계의 종류다. */
export function kindLabel(kind: PredicateKind | undefined): string {
    switch (kind) {
        case "group": return "그룹";
        case "axisBand":
        case "axisValue": return "축";
        case "date": return "날짜";
        case "time": return "시간";
        default: return "";
    }
}

/** 손으로 준 이름이 있으면 그것, 없으면 조건에서 만든다. 빈 술어는 이름에 안 낀다. */
export function stageLabel(s: FilterStage, look: LabelLookup): string {
    if (s.name) return s.name;
    const parts = s.predicates.filter((p) => !isPredicateEmpty(p)).map((p) => predicateLabel(p, look));
    return parts.length === 0 ? "조건 없음" : parts.join(" · ");
}
