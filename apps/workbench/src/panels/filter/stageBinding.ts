// 레일 ↔ 필터의 **1:1 규칙**(순수). 보드에서 그은 선이 어느 필터가 되는가.
//
// 레일 하나가 필터 하나다. 여러 축을 한 필터에 AND 로 묶지 않는 이유:
//   · **표현력 손실이 없다** — 필터끼리 이미 AND 라, 축 셋을 걸려면 필터 셋을 만들면 그만이다.
//     같은 축의 두 구간 AND 는 애초에 뜻이 없고(교집합 = 구간 하나), OR 은 한 레일 안 구간 여럿으로 된다.
//   · **축별로 끌 수 있다** — 묶으면 한 축만 빼보는 손짓이 없어진다(끄기가 조건의 값어치를 재는 유일한 자다).
//   · **매핑이 함수가 된다** — 레일 → 필터도, 필터 → 레일에 그릴 구간도 모호함이 없다. 묶는 순간
//     "지금 어느 필터를 편집 중인가"가 상태로 살아나고, 한 축이 여러 필터에 나타나면 레일에 무엇을
//     그릴지부터 답이 없어진다.
//
// ⚠ 그룹은 레일이 아니다(순서가 없다) — railKeyOf 가 null 을 준다. 그룹 조건은 보드에서 리스트로 관리하고
// 필터 여러 개가 될 수 있다(테마A / 돌파형을 나눠 걸어야 각각을 따로 끄고 켤 수 있다).
import type { OutcomeMetric } from "../../lib/outcomeMetric.js";
import { newStage, unknownPredicate, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";
import { appendLeaf, filterLeaves, leavesOf, mapLeaves, type SetExpr } from "./expr.js";

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
        case "theme": return null; // 편집면은 조건판 팝오버 하나
        case "outcomeRecovery": return null; // 명목값 — 레일이 아니라 결과 패널 머리글 칩이 편집 입구
        // 셀 술어 — 하루 우주의 레일(분포 스트립)은 아직 없다. 켤 때 어댑터 하나로 붙는다.
        case "cellValue":
        case "priorHighBreak":
        case "gridPoint":
        case "breakout":
        case "candleShape": return null;
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
 * 레일 편집을 **식 트리**에 반영 — 이 규칙의 유일한 구현이다(리스트 전용 판은 2026-09-19 삭제:
 * 같은 규칙이 두 벌이면 언젠가 한쪽만 고쳐진다).
 *   · 술어가 있으면 — 주소가 가리키는 잎에서 이 레일의 술어만 갈아끼우고, 없으면 새로 만든다.
 *   · null(조건 없음) 이면 — 그 잎에서 이 레일의 술어를 지운다. 아무 술어도 안 남으면 잎째 지운다.
 *
 * ⚠ 트리를 **평평하게 만들지 않는다**(잎 목록으로 내렸다 되짚으면 묶음·부정·참조가 통째로 사라진다).
 */
export function applyRailToExpr(
    e: SetExpr,
    key: RailKey,
    predicate: FilterPredicate | null,
    /**
     * 고칠 줄의 **주소**. 세 값이 서로 다른 뜻이다:
     *  · `string`    — 그 조건을 고친다(없으면 새로 만든다).
     *  · `null`      — **무조건 새로 만든다**(팔레트에서 종류를 골라 만드는 길).
     *  · `undefined` — 주소를 안 준 것 = 옛 규칙("그 레일 키의 첫 조건"). 결과·급타점 **전문 패널의
     *    연동 거울**이 이 길로 온다 — 거기선 레일 키가 (지표 × T)/(W × r) 라 1:1 이 아직 참이다
     *    (decisions 「허용 폭 T」 ①).
     *
     * ⚠ 조건 보드는 **절대 `undefined` 로 안 온다.** 한 집합에 같은 레일 키가 여럿 서는 게 정상이라
     * "첫 조건" 규칙이 두 방향으로 거짓말을 한다: ① 새로 만들려 해도 기존 것이 조용히 갈린다
     * ② B 의 편집면을 열어 고쳤는데 A 가 바뀐다.
     */
    stageId?: string | null,
): SetExpr {
    const leaves = leavesOf(e);
    const first = stageId === null
        ? undefined
        : stageId === undefined
            ? stagesFor(leaves, key)[0]
            : leaves.find((s) => s.id === stageId);
    if (!first) return predicate === null ? e : appendLeaf(e, newStage([predicate]));

    const others = first.predicates.filter((p) => {
        const k = railKeyOf(p);
        return k === null || !sameRailKey(k, key);
    });
    if (predicate === null) {
        return others.length > 0
            ? mapLeaves(e, (s) => (s.id === first.id ? { ...s, predicates: others } : s))
            : filterLeaves(e, (s) => s.id !== first.id);
    }
    return mapLeaves(e, (s) => (s.id === first.id ? { ...s, predicates: [...others, predicate] } : s));
}
