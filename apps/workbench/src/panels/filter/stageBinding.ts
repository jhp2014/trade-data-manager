// 레일 ↔ 필터의 **1:1 규칙**(순수). 보드에서 그은 선이 어느 필터가 되는가.
//
// 레일 하나가 필터 하나다. 여러 축을 한 필터에 AND 로 묶지 않는 이유:
//   · **표현력 손실이 없다** — 필터끼리 이미 AND 라, 축 셋을 걸려면 필터 셋을 만들면 그만이다.
//     같은 축의 두 구간 AND 는 애초에 뜻이 없고(교집합 = 구간 하나), OR 은 한 레일 안 구간 여럿으로 된다.
//   · **한계 기여도가 축별로 나온다** — 묶으면 "새로 죽임"이 뭉개져 어느 축이 장식인지 못 본다.
//   · **매핑이 함수가 된다** — 레일 → 필터도, 필터 → 레일에 그릴 구간도 모호함이 없다. 묶는 순간
//     "지금 어느 필터를 편집 중인가"가 상태로 살아나고, 한 축이 여러 필터에 나타나면 레일에 무엇을
//     그릴지부터 답이 없어진다.
//
// ⚠ 그룹은 레일이 아니다(순서가 없다) — railKeyOf 가 null 을 준다. 그룹 조건은 보드에서 리스트로 관리하고
// 필터 여러 개가 될 수 있다(테마A / 돌파형을 나눠 걸어야 각각의 기여도가 보인다).
import { addStage, removeStage, setStagePredicates, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

/** 레일 하나를 가리키는 열쇠. 축은 id 로, 날짜·시간은 종류만으로 유일하다. */
export type RailKey =
    | { kind: "axis"; axisId: string }
    | { kind: "date" }
    | { kind: "time" };

/** 이 술어가 사는 레일. 그룹은 레일이 없어 null. */
export function railKeyOf(p: FilterPredicate): RailKey | null {
    switch (p.kind) {
        case "axisBand":
        case "axisValue": return { kind: "axis", axisId: p.axisId };
        case "date": return { kind: "date" };
        case "time": return { kind: "time" };
        case "group": return null;
    }
}

export function sameRailKey(a: RailKey, b: RailKey): boolean {
    return a.kind === b.kind && (a.kind !== "axis" || a.axisId === (b as { axisId: string }).axisId);
}

/** 이 레일에 매인 필터들 — 정상은 0~1개. 옛 저장본에서 2개 이상일 수 있어 리스트로 답한다. */
export function stagesFor(stages: readonly FilterStage[], key: RailKey): FilterStage[] {
    return stages.filter((s) => s.predicates.some((p) => {
        const k = railKeyOf(p);
        return k !== null && sameRailKey(k, key);
    }));
}

/** 이 레일이 지금 들고 있는 술어(첫 필터의 것). 없으면 undefined. */
export function predicateFor(stages: readonly FilterStage[], key: RailKey): FilterPredicate | undefined {
    const first = stagesFor(stages, key)[0];
    return first?.predicates.find((p) => {
        const k = railKeyOf(p);
        return k !== null && sameRailKey(k, key);
    });
}

/**
 * 이 레일의 술어를 **종류까지 맞춰** 꺼낸다. 레일은 종류가 하나로 정해져 있는데(계산 축 = 값 구간,
 * 판단 축 = 자리 밴드) 옛 저장본이나 축 성격 변경으로 다른 종류가 그 자리에 있을 수 있다 —
 * 그때는 없는 것으로 본다(레일이 빈 채로 뜨고, 새로 그으면 제 종류로 덮인다).
 */
export function predicateOfKind<K extends PredicateKind>(
    stages: readonly FilterStage[],
    key: RailKey,
    kind: K,
): Extract<FilterPredicate, { kind: K }> | undefined {
    const p = predicateFor(stages, key);
    return p?.kind === kind ? (p as Extract<FilterPredicate, { kind: K }>) : undefined;
}

/**
 * 레일 편집을 필터 리스트에 반영.
 *   · 술어가 있으면 — 그 레일의 **첫 필터**를 갈아끼우고, 없으면 새로 만든다.
 *   · null(조건 없음) 이면 — 그 필터를 **지운다**. 빈 필터를 남기면 화면에 아무 일도 안 하는 줄이 쌓인다.
 * 둘 이상 매여 있으면 첫 것만 건드린다 — 나머지는 목록에서 손으로 정리하게 두는 편이,
 * 그은 선 하나가 보이지 않는 필터까지 조용히 지우는 것보다 낫다.
 */
export function applyRailPredicate(
    stages: readonly FilterStage[],
    key: RailKey,
    predicate: FilterPredicate | null,
): FilterStage[] {
    const first = stagesFor(stages, key)[0];
    if (predicate === null) return first ? removeStage(stages, first.id) : [...stages];
    return first ? setStagePredicates(stages, first.id, [predicate]) : addStage(stages, [predicate]);
}
