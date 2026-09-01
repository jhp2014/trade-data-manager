// 집합 참조 리졸버 — SetRef 하나를 실제 항목 집합으로 푼다. **판정은 집합의 고유 층위에서**(층위 변환 법칙).
//
// 재료는 전부 ctx 로 주입받는다(깔때기 evaluate 와 같은 이유) — 저장 방식이 바뀌어도 풀이 규칙은
// 안 바뀌어야 하고, 그래야 규칙만 테스트로 못박을 수 있다. 판정 함수는 깔때기 것을 **그대로 재사용**한다
// (evalStage·tallyFunnel) — 두 번째 판정 엔진을 만들면 언젠가 둘이 다른 답을 낸다.
//
// 저장 집합은 **자립 저장물**이라 정산도 집합마다 따로 돈다 — 같은 조건이 두 집합에 복사돼 있어도
// 두 번 평가한다. 집합 수 규모에서 무시할 비용이고, 그 대가로 "하나를 고치면 형제가 암묵적으로
// 바뀌는" 일이 원리적으로 없다(사용자 확정).
//
// **깨진 참조는 빈 집합 + broken 표식**이다. 유니버스로 조용히 폴백하지 않는다 — 실패가 조용히
// **넓어지는** 방향이라, 집합 하나 지웠는데 어느 패널이 전체를 보며 틀린 분모로 계속 읽게 된다.
// "결손은 결손"(축 규칙 3)이 참조에도 적용되는 것.
import {
    expandUniverse, tallyFunnel,
    type ChartRef, type FunnelCell, type FunnelItem, type FunnelResult, type Grain,
} from "@trade-data-manager/market/domain";
import type { SetRef } from "../../lib/setRef.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { toFunnelStages, type EvalLookup } from "./evaluate.js";
import { activeStages, funnelOrder, resolveAutoGrain, type FilterStage, type GrainLookup } from "./stage.js";

/** 풀이에 필요한 바깥 재료. 없는 것(지워진 그룹·집합)은 undefined = 깨진 참조. */
export interface SetResolveCtx {
    /** 유니버스 — 후보 하루 전부. 어느 참조든 이 분모 위에서 풀린다. */
    candidates: readonly ChartRef[];
    /** 그 하루의 타점 시각들(타점 0이면 빈 배열). */
    timesOf: (c: ChartRef) => readonly string[];
    /** 적용 그룹(직접 ∪ 계층조상) — 깔때기와 같은 판정. */
    appliedGroupNamesOf: (item: FunnelItem) => readonly string[];
    /** 사전에 있는 그룹인가. false = 지워진 그룹(깨진 참조). */
    hasGroup: (name: string) => boolean;
    /** 작업 깔때기의 단계들(조건 한 벌) — survivors·cell 참조의 재료. */
    activeStages: readonly FilterStage[];
    /** 저장 집합 사전. undefined 반환 = 지워진 집합(깨진 참조). */
    savedSetOf: (id: string) => SavedSet | undefined;
    /**
     * 작업 깔때기의 **이미 끝난 정산** — 깔때기 훅이 방금 만든 것을 그대로 꽂는다.
     * 없으면 여기서 새로 정산하는데, 그러면 같은 조건을 두 번 평가할 뿐 아니라 **grain 이 갈릴 수 있다**:
     * 훅은 자동 해상도(걸린 조건 중 가장 가는 층위)로 펼치는데, 리졸버 단독으로는 그 판정 재료가 없다.
     * "연동"과 "최종 생존" 바인딩이 같은 집합이려면 반드시 이 재사용 경로여야 한다.
     */
    activeFilter?: ResolvedFilter;
    /**
     * 재료 세대 — 유니버스·타점·사전·축 값 **전부**가 의존성인 토큰(발급은 깔때기 훅). 있으면 저장 집합의
     * 정산이 세션 캐시(아래)를 탄다: 같은 세대 안에서는 정의가 같은 집합을 재정산하지 않는다.
     * ⚠ 재료 하나라도 빠진 채 발급되면 낡은 정산이 조용히 살아남는다 — 발급부 의존성 목록이 곧 계약이다.
     */
    materialsEpoch?: string;
    evalLook: EvalLookup;
    grainLook: GrainLookup;
}

/** 조건 한 벌의 정산 결과 — survivors/cell 부위 추출이 공유하고, 작업 깔때기는 훅에서 주입된다. */
export interface ResolvedFilter {
    grain: Grain;
    active: FilterStage[];
    tally: FunnelResult;
}

export interface ResolvedSet {
    /** 참조가 가리키는 대상이 사라졌다(지워진 그룹·집합·단계). 빈 집합과 달라야 화면이 이유를 말한다. */
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

        case "survivors": {
            const r = resolveDef(null, ctx);
            return { broken: false, grain: r.grain, items: r.tally.survivors };
        }

        case "cell": {
            // 작업 깔때기의 짚은 칸 — 단계가 지워졌거나 꺼졌으면 그 칸은 존재하지 않는다(깨진 참조).
            const r = resolveDef(null, ctx);
            return cellItems(r, ref.stageId, ref.cells);
        }

        case "saved": {
            const s = ctx.savedSetOf(ref.setId);
            if (s === undefined) return BROKEN;
            const r = resolveDef(ref.setId, ctx);
            if (s.part.kind === "survivors") return { broken: false, grain: r.grain, items: r.tally.survivors };
            return cellItems(r, s.part.stageId, s.part.cells);
        }

        case "groupChain": {
            // 그룹은 전부 하루(차트) 층위다 — 판정도 그 층위에서 한다.
            if (ref.names.some((n) => !ctx.hasGroup(n))) return BROKEN;
            const grain: Grain = "day";
            const items = expandUniverse(ctx.candidates, grain, ctx.timesOf).filter((i) => {
                const applied = ctx.appliedGroupNamesOf(i);
                return ref.names.every((n) => applied.includes(n));
            });
            return { broken: false, grain, items };
        }

        case "items":
            return {
                broken: false,
                grain: ref.items.some((i) => i.time !== undefined) ? "point" : "day",
                items: [...ref.items],
            };

        case "orphan":
            // 폐지된 옛 바인딩의 잔해 — 항상 깨진 참조. 화면이 라벨과 "다시 고르기"로 받는다.
            return BROKEN;
    }
}

/** 부위 추출 — 정산에서 한 단계의 칸들을 꺼낸다. 한 단계의 칸들은 서로소라 합집합에 dedupe 가 필요 없다. */
function cellItems(r: ResolvedFilter, stageId: string, cells: readonly FunnelCell[]): ResolvedSet {
    const i = r.active.findIndex((s) => s.id === stageId);
    if (i < 0) return BROKEN;
    const t = r.tally.stages[i]!;
    return { broken: false, grain: r.grain, items: cells.flatMap((c) => t.cells[c]) };
}

/** 리졸버 호출 한 번(= ctx 한 벌) 안에서 조건 정산을 정의(작업 깔때기 | 저장 집합)당 한 번만 —
 *  같은 집합을 여러 패널이 바인딩해도 정산은 한 벌이다. ctx 가 재료 변경마다 새로 만들어지므로 낡을 수 없다. */
const filterMemo = new WeakMap<SetResolveCtx, Map<string | null, ResolvedFilter>>();

/**
 * 세션 캐시 — 저장 집합의 정산을 **(재료 세대 × 정의)**로 기억한다. ctx 는 깔때기 편집마다 새로 서는데
 * (작업 깔때기의 조건이 ctx 의 일부라서), 그때마다 목록의 저장 집합 전부를 재정산하면 무관한 레일 편집 한 번이
 * O(집합 수 × 유니버스)가 된다. 저장 집합의 정산은 제 정의와 재료에만 의존한다 — 세대가 같고 정의가
 * 같으면(JSON 직렬화 일치) 재사용하고, 세대가 바뀌면 통째로 버린다(유니버스·사전·축 값 변경은 반드시 무효).
 * 크기는 저장 집합 수에 유계다 — 작업 깔때기(정의가 편집마다 변함)는 일부러 안 태운다.
 */
let sessionEpoch: string | undefined;
const sessionDefCache = new Map<string, ResolvedFilter>();

/**
 * 조건 한 벌을 정산까지. null = 작업 깔때기, 문자열 = 저장 집합의 id(**호출 전에 존재 확인**).
 * 작업 깔때기는 **훅의 정산을 재사용**한다(ctx.activeFilter — grain·비용 둘 다의 이유, 필드 주석 참조).
 * ⚠ 단계 순서는 깔때기 화면과 같은 규칙(funnelOrder — 하루 먼저)이어야 한다: 칸(근접 탈락)은 순서
 * 종속이라, 여기만 다른 순서로 접으면 짚은 칸과 다른 집합이 나온다.
 */
function resolveDef(setId: string | null, ctx: SetResolveCtx): ResolvedFilter {
    if (setId === null && ctx.activeFilter) return ctx.activeFilter;
    let memo = filterMemo.get(ctx);
    if (!memo) filterMemo.set(ctx, (memo = new Map()));
    const hit = memo.get(setId);
    if (hit !== undefined) return hit;

    const stages = setId === null ? ctx.activeStages : (ctx.savedSetOf(setId)?.stages ?? []);

    let sessionKey: string | null = null;
    if (setId !== null && ctx.materialsEpoch !== undefined) {
        if (ctx.materialsEpoch !== sessionEpoch) {
            sessionEpoch = ctx.materialsEpoch;
            sessionDefCache.clear();
        }
        sessionKey = JSON.stringify(stages);
        const sHit = sessionDefCache.get(sessionKey);
        if (sHit !== undefined) {
            memo.set(setId, sHit);
            return sHit;
        }
    }

    const active = activeStages(funnelOrder(stages, ctx.grainLook).map((e) => e.stage));
    const grain = resolveAutoGrain(stages, ctx.grainLook);
    const items = expandUniverse(ctx.candidates, grain, ctx.timesOf);
    const r: ResolvedFilter = { grain, active, tally: tallyFunnel(items, toFunnelStages(active, ctx.evalLook)) };
    memo.set(setId, r);
    if (sessionKey !== null) sessionDefCache.set(sessionKey, r);
    return r;
}
