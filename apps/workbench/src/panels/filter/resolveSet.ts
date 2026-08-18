// 집합 참조 리졸버 — SetRef 하나를 실제 항목 집합으로 푼다. **판정은 집합의 고유 층위에서**(층위 변환 법칙).
//
// 재료는 전부 ctx 로 주입받는다(깔때기 evaluate 와 같은 이유) — 저장 방식이 바뀌어도 풀이 규칙은
// 안 바뀌어야 하고, 그래야 규칙만 테스트로 못박을 수 있다. 판정 함수는 깔때기 것을 **그대로 재사용**한다
// (evalStage·tallyFunnel) — 두 번째 판정 엔진을 만들면 언젠가 둘이 다른 답을 낸다.
//
// **깨진 참조는 빈 집합 + broken 표식**이다. 유니버스로 조용히 폴백하지 않는다 — 실패가 조용히
// **넓어지는** 방향이라, 필터 하나 지웠는데 어느 패널이 전체를 보며 틀린 분모로 계속 읽게 된다.
// "결손은 결손"(축 규칙 3)이 참조에도 적용되는 것.
import {
    expandUniverse, finestGrain, tallyFunnel,
    type ChartRef, type FunnelItem, type FunnelResult, type Grain,
} from "@trade-data-manager/market/domain";
import type { SetRef } from "../../lib/setRef.js";
import { toFunnelStages, type EvalLookup } from "./evaluate.js";
import { activeStages, funnelOrder, resolveAutoGrain, type FilterStage, type GrainLookup } from "./stage.js";

/** 풀이에 필요한 바깥 재료. 없는 것(지워진 그룹·필터)은 undefined = 깨진 참조. */
export interface SetResolveCtx {
    /** 유니버스 — 후보 하루 전부. 어느 참조든 이 분모 위에서 풀린다. */
    candidates: readonly ChartRef[];
    /** 그 하루의 타점 시각들(타점 0이면 빈 배열). */
    timesOf: (c: ChartRef) => readonly string[];
    /** 적용 그룹(직접 ∪ 하루상속 ∪ 계층조상) — 깔때기와 같은 판정. */
    appliedGroupNamesOf: (item: FunnelItem) => readonly string[];
    /** 그룹의 층위. undefined = 지워진 그룹(깨진 참조). */
    groupScope: (name: string) => Grain | undefined;
    /** 필터 정의. null = 활성 슬롯. undefined 반환 = 지워진 필터(깨진 참조). */
    stagesOf: (filterId: string | null) => readonly FilterStage[] | undefined;
    /**
     * 활성 슬롯(filterId=null)의 **이미 끝난 정산** — 깔때기 훅이 방금 만든 것을 그대로 꽂는다.
     * 없으면 여기서 새로 정산하는데, 그러면 같은 필터를 두 번 평가할 뿐 아니라 **grain 이 갈릴 수 있다**:
     * 훅은 displayGrain("타점으로 펼치기" 반영)으로 펼치고 리졸버 단독으로는 그 토글을 모른다.
     * 연동과 "활성 필터" 바인딩이 같은 집합이려면 반드시 이 재사용 경로여야 한다.
     */
    activeFilter?: ResolvedFilter;
    evalLook: EvalLookup;
    grainLook: GrainLookup;
}

/** 필터 한 벌의 정산 결과 — filter/cell 참조가 공유하고, 활성 슬롯은 훅에서 주입된다. */
export interface ResolvedFilter {
    grain: Grain;
    active: FilterStage[];
    tally: FunnelResult;
}

export interface ResolvedSet {
    /** 참조가 가리키는 대상이 사라졌다(지워진 그룹·필터·단계). 빈 집합과 달라야 화면이 이유를 말한다. */
    broken: boolean;
    /** 고유 층위 — 판정이 일어난 알갱이. 표시 변환(전개/투영)은 소비 패널의 일이다. */
    grain: Grain;
    items: FunnelItem[];
}

const BROKEN: ResolvedSet = { broken: true, grain: "day", items: [] };

export function resolveSetRef(ref: SetRef, ctx: SetResolveCtx): ResolvedSet {
    switch (ref.kind) {
        case "universe":
            return { broken: false, grain: "day", items: expandUniverse(ctx.candidates, "day", ctx.timesOf) };

        case "group": {
            const scope = ctx.groupScope(ref.name);
            if (scope === undefined) return BROKEN;
            // 고유 층위 = 그룹 scope. point 그룹이면 타점으로 펼쳐 판정한다 — 타점 0인 하루는 펼쳐도
            // 시각 없는 항목으로 남는데, 타점 그룹의 멤버일 수 없어 자연히 걸러진다(조용한 소멸이 아니라 사실).
            const items = expandUniverse(ctx.candidates, scope, ctx.timesOf)
                .filter((i) => ctx.appliedGroupNamesOf(i).includes(ref.name));
            return { broken: false, grain: scope, items };
        }

        case "groupChain": {
            // 교집합 판정은 **가장 가는 층위**에서 — 하루 그룹은 상속(∀ 전개와 동치)으로 타점에 적용된다.
            const scopes = ref.names.map((n) => ctx.groupScope(n));
            if (scopes.some((s) => s === undefined)) return BROKEN;
            const grain = finestGrain(scopes as Grain[]);
            const items = expandUniverse(ctx.candidates, grain, ctx.timesOf).filter((i) => {
                const applied = ctx.appliedGroupNamesOf(i);
                return ref.names.every((n) => applied.includes(n));
            });
            return { broken: false, grain, items };
        }

        case "filter": {
            const r = resolveFilter(ref.filterId, ctx);
            return r === null ? BROKEN : { broken: false, grain: r.grain, items: r.tally.survivors };
        }

        case "cell": {
            const r = resolveFilter(ref.filterId, ctx);
            if (r === null) return BROKEN;
            const i = r.active.findIndex((s) => s.id === ref.stageId);
            // 단계가 지워졌거나 꺼졌으면 그 칸은 존재하지 않는다 — 깨진 참조.
            if (i < 0) return BROKEN;
            const t = r.tally.stages[i]!;
            // 한 단계의 칸들은 서로소라 합집합에 dedupe 가 필요 없다.
            return { broken: false, grain: r.grain, items: ref.cells.flatMap((c) => t.cells[c]) };
        }

        case "items":
            return {
                broken: false,
                grain: ref.items.some((i) => i.time !== undefined) ? "point" : "day",
                items: [...ref.items],
            };
    }
}

/** 리졸버 호출 한 번(= ctx 한 벌) 안에서 필터 정산을 filterId 당 한 번만 — 같은 필터의 filter/cell
 *  참조가 몇 개든 정산은 한 벌이다. ctx 가 재료 변경마다 새로 만들어지므로 낡을 수 없다. */
const filterMemo = new WeakMap<SetResolveCtx, Map<string | null, ResolvedFilter | null>>();

/**
 * 필터 한 벌을 정산까지. 칸 참조가 같은 정산을 봐야 하므로 filter/cell 이 이 한 함수를 공유한다.
 * 활성 슬롯은 **훅의 정산을 재사용**한다(ctx.activeFilter — grain·비용 둘 다의 이유, 필드 주석 참조).
 * ⚠ 단계 순서는 깔때기 화면과 같은 규칙(funnelOrder — 하루 먼저)이어야 한다: 칸(근접 탈락)은 순서
 * 종속이라, 여기만 다른 순서로 접으면 짚은 칸과 다른 집합이 나온다.
 */
function resolveFilter(filterId: string | null, ctx: SetResolveCtx): ResolvedFilter | null {
    if (filterId === null && ctx.activeFilter) return ctx.activeFilter;
    let memo = filterMemo.get(ctx);
    if (!memo) filterMemo.set(ctx, (memo = new Map()));
    const hit = memo.get(filterId);
    if (hit !== undefined) return hit;

    const stages = ctx.stagesOf(filterId);
    if (stages === undefined) {
        memo.set(filterId, null);
        return null;
    }
    const active = activeStages(funnelOrder(stages, ctx.grainLook).map((e) => e.stage));
    const grain = resolveAutoGrain(stages, ctx.grainLook);
    const items = expandUniverse(ctx.candidates, grain, ctx.timesOf);
    const r: ResolvedFilter = { grain, active, tally: tallyFunnel(items, toFunnelStages(active, ctx.evalLook)) };
    memo.set(filterId, r);
    return r;
}
