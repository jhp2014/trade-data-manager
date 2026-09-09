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
import type { OutcomeMetric } from "../../lib/outcomeMetric.js";
import { addStage, removeStage, setStagePredicates, unknownPredicate, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

/** 레일 하나를 가리키는 열쇠. 축은 id 로, 결과는 지표로, 날짜·시간은 종류만으로 유일하다. */
export type RailKey =
    | { kind: "axis"; axisId: string }
    /** 결과는 **(지표 × 허용 폭 T)** 가 자리다 — T 가 술어로 내려오면서(2026-09-09) 같은 지표의 조건이
     *  T 별로 여러 개 설 수 있게 됐고, 키에 T 를 실어야 "이 레일에 뭘 그릴까"가 다시 함수가 된다
     *  (그 값은 지금 보는 T 슬라이스의 그 조건 하나). 조건의 T 를 옮기는 건 레일이 아니라 T 레일이 한다. */
    | { kind: "outcome"; metric: OutcomeMetric; t: number }
    | { kind: "date" }
    | { kind: "time" }
    /** 급타점 수는 **(창 W × 상승률 r)** 이 자리다 — 결과의 (지표 × T) 와 같은 근거: 파라미터가
     *  술어에 살아 같은 축의 조건이 (W,r) 별로 여럿 설 수 있으므로, 키에 실어야 "이 레일에 뭘 그릴까"가
     *  함수로 남는다. 대가는 **자리 충돌 거절**(hotLink) — 조용히 덮어쓰지 않는다. */
    | { kind: "hotPoints"; w: number; r: number };

/** 이 술어가 사는 레일. 그룹은 레일이 없어 null. */
export function railKeyOf(p: FilterPredicate): RailKey | null {
    switch (p.kind) {
        case "axisBand":
        case "axisValue": return { kind: "axis", axisId: p.axisId };
        case "outcome": return { kind: "outcome", metric: p.metric, t: p.t }; // 결과 패널의 레일(과거/미래 경계 저쪽)
        case "date": return { kind: "date" };
        case "time": return { kind: "time" };
        case "hotPoints": return { kind: "hotPoints", w: p.w, r: p.r }; // 급타점 패널의 레일
        case "group": return null;
        case "themeStrength": return null; // 레일이 아니다 — 보드 테마 칸의 목록 행(그룹과 동형)
        case "outcomeRecovery": return null; // 명목값 — 레일이 아니라 결과 패널 머리글 칩이 편집 입구
        // 자물쇠 — 빠뜨리면 그은 컷이 그 행에 조용히 안 붙는다(stage.ts).
        default: return unknownPredicate(p);
    }
}

export function sameRailKey(a: RailKey, b: RailKey): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "axis") return a.axisId === (b as { axisId: string }).axisId;
    if (a.kind === "outcome") { const o = b as { metric: OutcomeMetric; t: number }; return a.metric === o.metric && a.t === o.t; }
    if (a.kind === "hotPoints") { const h = b as { w: number; r: number }; return a.w === h.w && a.r === h.r; }
    return true;
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
 *   · 술어가 있으면 — 그 레일의 **첫 필터**에서 이 레일의 술어만 갈아끼우고, 없으면 새로 만든다.
 *   · null(조건 없음) 이면 — 이 레일의 술어를 지운다. 필터에 아무 술어도 안 남으면 필터째 지운다
 *     (빈 필터를 남기면 화면에 아무 일도 안 하는 줄이 쌓인다).
 * 갈아끼우는 범위는 **이 레일의 술어뿐**이다 — 옛 저장본은 한 필터에 다른 레일의 술어(다른 축의
 * 밴드·값구간)가 같이 있을 수 있는데, 통째 교체는 그은 선 하나가 안 보이는 형제 조건까지 조용히 지웠다.
 * 같은 레일 안에서는 종류가 달라도 교체된다(밴드 ↔ 값구간 — 한 축의 두 손잡이라 자리가 하나다).
 * 둘 이상 매여 있으면 첫 것만 건드린다 — 나머지는 목록에서 손으로 정리하게 두는 편이 낫다.
 */
export function applyRailPredicate(
    stages: readonly FilterStage[],
    key: RailKey,
    predicate: FilterPredicate | null,
): FilterStage[] {
    const first = stagesFor(stages, key)[0];
    if (!first) return predicate === null ? [...stages] : addStage(stages, [predicate]);

    const others = first.predicates.filter((p) => {
        const k = railKeyOf(p);
        return k === null || !sameRailKey(k, key);
    });
    if (predicate === null) {
        return others.length > 0 ? setStagePredicates(stages, first.id, others) : removeStage(stages, first.id);
    }
    return setStagePredicates(stages, first.id, [...others, predicate]);
}
