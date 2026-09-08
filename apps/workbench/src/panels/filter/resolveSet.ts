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
    expandUniverse, funnelKey, tallyFunnel,
    type ChartRef, type FunnelCell, type FunnelItem, type FunnelResult, type Grain, type PointDefinition,
} from "@trade-data-manager/market/domain";
import { expandToPointItems } from "../../lib/grainView.js";
import { judgeKeyOf } from "../../lib/pointDef.js";
import type { SetRef } from "../../lib/setRef.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import type { Assembly } from "../../store/assembliesSlice.js";
import { unionGrain, unionOf, uniqueCounts, type UnionPart } from "./assembly.js";
import { toFunnelStages, type EvalLookup } from "./evaluate.js";
import { activeStages, funnelOrder, resolveAutoGrain, type FilterStage, type GrainLookup } from "./stage.js";

/**
 * 정의 하나의 판정 재료 — 저장 집합은 **자기 pointDef 로 처음부터 끝까지** 평가된다(자립 저장물의 완성).
 * 타점 시각(모수)·격자 축 값/줄·결과 단면이 전부 그 정의의 것이어야 "게이트 50억 vs 30억 비교 집합"이 성립한다.
 */
export interface DefMaterials {
    timesOf: (item: { stockCode: string; date: string }) => readonly string[];
    evalLook: EvalLookup;
    grainLook: GrainLookup;
}

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
    /** 조립 사전. undefined 반환 = 지워진 조립(깨진 참조). */
    assemblyOf: (id: string) => Assembly | undefined;
    /**
     * 정의 → 판정 재료. undefined(옛 저장물 — pointDef 없음)·현재 정의와 같은 키면 **현재 재료 그대로**
     * (비용 0). 다른 정의는 defDerived 캐시를 딛고 격자 축 값/줄·타점 시각·결과 단면을 그 정의 것으로
     * 덮어쓴 재료를 준다(발급은 깔때기 훅 — 재료가 바뀌면 함수째 새로 선다).
     */
    materialsFor: (def: PointDefinition | undefined) => DefMaterials;
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
    /** 저장 집합만: 전 단계 AND 미배치 수(그 정의 유니버스 기준) — 조립 부품 줄이 병기해 결손이 조용히 안 사라진다. */
    pending?: number;
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

        case "saved":
            return resolveSaved(ref.setId, ctx);

        case "assembly": {
            // 조립 = 켠 부품들의 합집합(순수 규칙은 assembly.ts). **죽은 부품은 그 부품만 빠진다** —
            // 조립 전체를 BROKEN 으로 접지 않는 건 진단이 부품 단위라서다(UI 가 부품 줄에 깨짐을 표시한다).
            // groupChain 의 "하나라도 죽으면 통째"와 다른 규칙(사용자 확정).
            const a = ctx.assemblyOf(ref.id);
            if (a === undefined) return BROKEN;
            const u = unionOf(liveUnionParts(a, ctx));
            return { broken: false, grain: u.grain, items: u.items };
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

/** 켠·살아있는 부품들의 합집합 재료 — 부품의 전개 시각은 **그 부품 정의**의 것(자립). 조립 케이스와 타점 전개가 공유한다. */
function liveUnionParts(a: Assembly, ctx: SetResolveCtx): UnionPart[] {
    const parts: UnionPart[] = [];
    for (const m of a.members) {
        if (!m.enabled) continue;
        const r = resolveSaved(m.setId, ctx);
        if (r.broken) continue;
        parts.push({ grain: r.grain, items: r.items, timesOf: ctx.materialsFor(ctx.savedSetOf(m.setId)?.pointDef).timesOf });
    }
    return parts;
}

/**
 * 참조의 하루→타점 전개(∀) — **자기 정의의 시각으로**. 이미 타점 층위면 그대로.
 *   · 저장 집합 = 그 집합 pointDef 의 시각(전개까지 자립 — "게이트 30 집합"의 타점은 게이트 30 세계의 것).
 *   · day 조립 = 부품마다 자기 정의로 전개한 뒤 합집합(= 타점 층위 union 과 동치 — 항목이 어느 부품에서
 *     왔는지 물을 필요가 원리적으로 없다).
 *   · 그 외(유니버스·그룹 체인·작업 깔때기 유래) = 현재 정의의 시각(ctx.timesOf).
 * viewedPointRefs(구독 패널의 타점 전개)가 쓴다 — 여기만 다른 시각을 쓰면 시트 행과 칩 건수가 갈린다.
 */
export function expandRefToPoints(ref: SetRef, r: ResolvedSet, ctx: SetResolveCtx): FunnelItem[] {
    if (r.grain === "point") return [...r.items];
    if (ref.kind === "saved") return expandToPointItems(r.items, ctx.materialsFor(ctx.savedSetOf(ref.setId)?.pointDef).timesOf);
    if (ref.kind === "assembly") {
        const a = ctx.assemblyOf(ref.id);
        if (a !== undefined) {
            // 부품별 자기-정의 전개를 강제하려고 각 부품을 미리 타점으로 내린 뒤 합친다(중복은 unionOf 가 접는다).
            const parts = liveUnionParts(a, ctx).map((p): UnionPart => ({ grain: "point", items: expandToPointItems(p.items, p.timesOf), timesOf: p.timesOf }));
            return unionOf(parts).items;
        }
    }
    return expandToPointItems(r.items, ctx.timesOf);
}

/** 저장 집합 한 벌 — saved 참조와 조립의 부품이 같은 경로를 쓴다(두 벌이면 언젠가 다른 답을 낸다). */
function resolveSaved(setId: string, ctx: SetResolveCtx): ResolvedSet {
    const s = ctx.savedSetOf(setId);
    if (s === undefined) return BROKEN;
    const r = resolveDef(setId, ctx);
    if (s.part.kind === "survivors") return { broken: false, grain: r.grain, items: r.tally.survivors, pending: r.tally.pendingCount };
    const c = cellItems(r, s.part.stageId, s.part.cells);
    return c.broken ? c : { ...c, pending: r.tally.pendingCount };
}

/** 조립 진단 — 부품별 (건수 · 고유 기여 · 미배치 · 깨짐) + 합집합 크기. SetManager 펼침이 소비한다.
 *  고유 기여의 키는 **합집합과 같은 층위**로 만든다(층위가 갈리면 같은 항목이 다른 키가 되어 전부 고유로 부푼다). */
export interface AssemblyPartDiag {
    setId: string;
    enabled: boolean;
    broken: boolean;
    /** 부품 고유 층위의 건수(칩 툴팁과 같은 자). */
    count: number;
    /** 합집합 층위에서 이 부품만 든 항목 수 — "이 부품을 빼면 합집합이 얼마나 주나". 꺼짐·깨짐은 0. */
    unique: number;
    /** 그 부품 정의 유니버스의 전 단계 AND 미배치 — 생존도 탈락도 아닌 결손(조용히 안 사라진다). */
    pending: number;
}
export interface AssemblyDiag {
    grain: Grain;
    /** 합집합 크기(켠 부품들, 중복 접힘). */
    total: number;
    parts: AssemblyPartDiag[];
}

export function assemblyDiagOf(id: string, ctx: SetResolveCtx): AssemblyDiag | null {
    const a = ctx.assemblyOf(id);
    if (a === undefined) return null;
    const resolved = a.members.map((m) => ({ m, set: ctx.savedSetOf(m.setId), r: resolveSaved(m.setId, ctx) }));
    const live = resolved.filter((p) => p.m.enabled && !p.r.broken);
    const grain = unionGrain(live.map((p) => p.r));
    // 켠 부품들의 합집합-층위 키 집합 — day 부품의 전개는 그 부품 정의의 시각으로(리졸버의 규칙 그대로).
    const keySets = live.map((p) => {
        const items = grain === "point" ? expandToPointItems(p.r.items, ctx.materialsFor(p.set?.pointDef).timesOf) : p.r.items;
        return new Set(items.map(funnelKey));
    });
    const uniques = uniqueCounts(keySets);
    const union = new Set<string>();
    for (const s of keySets) for (const k of s) union.add(k);
    const parts: AssemblyPartDiag[] = resolved.map(({ m, r }) => {
        const li = live.findIndex((p) => p.m.setId === m.setId);
        return {
            setId: m.setId,
            enabled: m.enabled,
            broken: r.broken,
            count: r.items.length,
            unique: li >= 0 ? uniques[li]! : 0,
            pending: r.pending ?? 0,
        };
    });
    return { grain, total: union.size, parts };
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

    const set = setId === null ? undefined : ctx.savedSetOf(setId);
    const stages = setId === null ? ctx.activeStages : (set?.stages ?? []);
    // 저장 집합은 자기 정의로 평가된다 — 정의 사본이 없는 옛 저장물은 현재 정의(관대 병합 규칙 그대로).
    const mat = ctx.materialsFor(set?.pointDef);

    let sessionKey: string | null = null;
    if (setId !== null && ctx.materialsEpoch !== undefined) {
        if (ctx.materialsEpoch !== sessionEpoch) {
            sessionEpoch = ctx.materialsEpoch;
            sessionDefCache.clear();
        }
        // ⚠ 키에 **정의가 들어간다**(판정 노브 — T 는 술어에 있어 stages 직렬화가 이미 싣는다) —
        // 이게 없으면 같은 조건·다른 게이트 두 집합이 서로의 정산을 먹는다
        // (조용히 다른 집합). 정의 없는 옛 저장물은 "cur"(현재 정의) — 현재 정의가 바뀌면 평가에 닿는
        // 변경은 전부 재료(타점·축 값·결과)를 지나 세대가 바뀌므로 낡은 정산이 살아남지 못한다.
        sessionKey = `${set?.pointDef ? judgeKeyOf(set.pointDef) : "cur"}\n${JSON.stringify(stages)}`;
        const sHit = sessionDefCache.get(sessionKey);
        if (sHit !== undefined) {
            memo.set(setId, sHit);
            return sHit;
        }
    }

    const active = activeStages(funnelOrder(stages, mat.grainLook).map((e) => e.stage));
    const grain = resolveAutoGrain(stages, mat.grainLook);
    const items = expandUniverse(ctx.candidates, grain, mat.timesOf);
    const r: ResolvedFilter = { grain, active, tally: tallyFunnel(items, toFunnelStages(active, mat.evalLook)) };
    memo.set(setId, r);
    if (sessionKey !== null) sessionDefCache.set(sessionKey, r);
    return r;
}
