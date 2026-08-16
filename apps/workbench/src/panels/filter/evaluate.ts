// 판정기 — 이 항목이 이 조건에 맞나. 깔때기의 세 조각 중 마지막.
//   · 모양(무슨 조건이 몇 단계로) = stage.ts
//   · 판정(맞나 안 맞나 모르나) = 여기 — 재료(멤버십·배치줄·값·날짜)를 안다
//   · 정산(상류 AND·5칸·한계 기여도) = core/market 의 funnel — 술어를 모른다
//
// ⚠ **결손은 탈락이 아니다.** 옛 필터(makeAxisValuePredicate)는 값이 없으면 `false` 를 줬다. 그러면
// `(그룹 A) AND (깊이 상위구간)` 이 A 소속이지만 축에 아직 안 올린 항목을 소리 없이 떨군다 — 결과 숫자는
// 멀쩡한데 실제로는 **배치 진도를 측정**한 게 된다. 여기서는 `undefined`(미배치)로 갈라, 깔때기의
// 미배치 칸에서 "안 맞았다"가 아니라 "아직 안 했다"로 세어진다. 이게 3치를 쓰는 이유 전부다.
//
// 재료는 전부 **함수로 주입**받는다. 저장 방식(멤버십 피드 모양·배치줄 인덱스·값 캐시 키)이 바뀌어도
// 판정 규칙은 안 바뀌어야 하고, 그래야 규칙만 테스트로 못박을 수 있다.
// 3치 대수(and3·or3·not3)는 **도메인의 것**이다 — 여기서 다시 정의하면 "모름을 어떻게 다루나"라는
// 같은 규칙이 두 곳에서 각자 자란다. 이 파일은 그 대수로 술어를 조립하는 일만 한다.
import { and3, not3, or3, type FunnelItem, type Verdict } from "@trade-data-manager/market/domain";
import { NO_TAGS, type GroupExpr } from "../rank/groupFilter.js";
import { isPredicateEmpty, type AxisBound, type FilterPredicate, type FilterStage } from "./stage.js";

/** 판정에 필요한 바깥 재료. 없는 것은 전부 `undefined` = 판단 불가(탈락 아님). */
export interface EvalLookup {
    /** 이 항목에 적용되는 그룹 이름들 — **하루 상속 포함**(차트에 붙은 그룹은 그날 타점 전부에 적용). */
    groupNamesOf: (item: FunnelItem) => readonly string[];
    /** 사전에 있는 그룹인가. 없으면 죽은 참조라 그 리터럴은 판단 불가. */
    hasGroup: (groupId: string) => boolean;
    /** 이 항목의 그 축 배치 위치(orderKey). **미배치면 undefined** — 깔때기의 미배치 칸이 여기서 나온다. */
    orderKeyOf: (axisId: string, item: FunnelItem) => number | undefined;
    /**
     * 밴드 경계(**타점 앵커**) → 그 타점이 선 자리의 orderKey. 그 타점이 이 축에서 빠졌으면 undefined
     * (밴드가 깨진 것). 옛날엔 slotId 로 지목했는데, slot 은 비면 GC 되어 경계가 조용히 끊겼다 —
     * 타점 앵커는 계산 축 경계(AxisBound)가 이미 쓰던 규칙이라 두 종류 축의 경계가 같은 성질이 된다.
     */
    bandBoundOrderKey: (axisKey: string, point: string) => number | undefined;
    /** 계산 축 값. 결손이면 undefined. */
    axisValueOf: (axisId: string, item: FunnelItem) => number | undefined;
    /** 값 구간 경계 해석 — 타점 앵커면 그 타점의 값, 리터럴이면 그 수. 앵커가 사라졌으면 undefined. */
    boundValue: (axisId: string, bound: AxisBound) => number | undefined;
}

/**
 * 값 구간 경계 → 수치. 타점 앵커면 그 타점의 값, 리터럴이면 그 수. **앵커가 사라졌으면 undefined**.
 *
 * 판정만의 일이 아니라 **레일도 같은 물음을 던진다**("이 경계를 화면 어디에 그리나"). 두 벌이면
 * 앵커 소실을 한쪽은 모름으로, 다른 쪽은 0 으로 읽는 식으로 갈라진다 — 그래서 여기 한 곳에 둔다.
 */
export function resolveBound(b: AxisBound, values: Map<string, number> | undefined): number | undefined {
    return b.kind === "value" ? (Number.isFinite(b.value) ? b.value : undefined) : values?.get(b.point);
}

/**
 * 그룹 DNF 를 3치로. 절 안은 AND, 절끼리는 OR, 리터럴마다 부정.
 * 죽은 그룹 참조는 **모름**이다 — 멤버십이 cascade 로 지워져 "소속 아님"이 사실이긴 하지만,
 * 그 조건 자체가 뜻을 잃었으므로 "안 맞았다"로 세면 근접 탈락 집합이 오염된다.
 */
export function evalGroupExpr3(expr: GroupExpr, item: FunnelItem, look: EvalLookup): Verdict {
    if (expr.groups.length === 0) return true; // 빈 식 = 무제한
    const ids = look.groupNamesOf(item);
    /** 이 리터럴이 가리키는 사실이 참인가(부정 적용 전). 죽은 그룹은 모름. */
    const holds = (groupId: string): Verdict => {
        // "그룹 없음"은 그룹이 아니라 개수 조건이라 사전을 안 본다(죽을 수가 없다).
        if (groupId === NO_TAGS) return ids.length === 0;
        if (!look.hasGroup(groupId)) return undefined;
        return ids.includes(groupId);
    };
    return or3(
        expr.groups.map((clause) =>
            and3(clause.literals.map((l) => (l.neg ? not3(holds(l.groupId)) : holds(l.groupId)))),
        ),
    );
}

/** 술어 하나의 3치 판정. 빈 술어는 조건이 아니라 무제한이다(통과). */
export function evalPredicate3(p: FilterPredicate, item: FunnelItem, look: EvalLookup): Verdict {
    if (isPredicateEmpty(p)) return true;
    switch (p.kind) {
        case "date":
            // 날짜는 항목이 언제나 들고 있다 — 여기서 모름이 나올 수 없다.
            return p.ranges.some((r) => item.date >= r.from && item.date <= r.to);

        case "time": {
            // 시각이 없는 항목(타점을 아직 안 찍은 후보 하루)은 판단 불가 — 탈락시키면 조용히 사라진다.
            if (item.time === undefined) return undefined;
            const hm = item.time.slice(0, 5);
            return p.ranges.some((r) => hm >= r.from && hm <= r.to);
        }

        case "group":
            return evalGroupExpr3(p.expr, item, look);

        case "axisBand": {
            // 경계는 **타점 앵커**다. 지정한 경계가 안 풀리면 밴드가 깨진 것이라 판단 불가.
            const lo = p.band.lo === undefined ? -Infinity : look.bandBoundOrderKey(p.axisId, p.band.lo);
            const hi = p.band.hi === undefined ? Infinity : look.bandBoundOrderKey(p.axisId, p.band.hi);
            if (lo === undefined || hi === undefined) return undefined;
            const ok = look.orderKeyOf(p.axisId, item);
            if (ok === undefined) return undefined; // 미배치
            const [from, to] = lo <= hi ? [lo, hi] : [hi, lo]; // 어느 쪽을 먼저 찍었든 구간은 하나
            return ok >= from && ok <= to;
        }

        case "axisValue": {
            // 앵커가 사라진 구간은 버린다(옛 resolveRanges 규칙). 남는 게 없으면 조건이 뜻을 잃어 판단 불가.
            const resolved: [number, number][] = [];
            for (const r of p.ranges) {
                if (!r.from && !r.to) continue;
                const lo = r.from ? look.boundValue(p.axisId, r.from) : -Infinity;
                const hi = r.to ? look.boundValue(p.axisId, r.to) : Infinity;
                if (lo === undefined || hi === undefined) continue;
                resolved.push(lo <= hi ? [lo, hi] : [hi, lo]);
            }
            if (resolved.length === 0) return undefined;
            const v = look.axisValueOf(p.axisId, item);
            if (v === undefined) return undefined; // 결손 = 미배치(탈락 아님)
            return resolved.some(([from, to]) => v >= from && v <= to);
        }
    }
}

/** 단계 하나 = 그 술어들의 3치 AND. 빈 술어는 통과라 자연히 무해하다. */
export function evalStage(s: FilterStage, item: FunnelItem, look: EvalLookup): Verdict {
    return and3(s.predicates.map((p) => evalPredicate3(p, item, look)));
}

/**
 * 단계 리스트를 core 깔때기가 먹는 모양으로. 정산은 술어를 모르고, 판정은 정산을 모른다 —
 * 이 함수 하나가 그 둘을 잇는 유일한 자리다.
 */
export const toFunnelStages = (
    stages: readonly FilterStage[],
    look: EvalLookup,
): { id: string; verdictOf: (item: FunnelItem) => Verdict }[] =>
    stages.map((s) => ({ id: s.id, verdictOf: (item: FunnelItem) => evalStage(s, item, look) }));
