// 집합 시선 배선 — 깔때기 정산(result)과 리졸버 재료(ctx)를 받아 **보는 집합**을 만든다.
//
// useFilterFunnel 의 뒷반쪽을 뗀 것: 앞반쪽은 재료를 모아 정산까지(조회기·유니버스·tally), 여기는
// 그 재료로 참조를 풀고(resolveSet) 뷰 계약(ViewedSet)으로 포장한다(viewOf). 나뉜 이유는 수명이다 —
// 재료·정산은 사전과 편집을 따라 살고, 시선(짚은 칸·선택 포인터)은 클릭마다 산다.
//
// ⚠ result === null 이 곧 로딩이다("정산 결과. 로딩 중이면 null" — FunnelView 계약). 로딩 중의
// 빈 집합으로 거르면 빈 화면이 "조건에 다 걸렸다"로 읽히므로, 가드는 전부 여기(뷰 계약 안)에 있다.
import { useCallback, useMemo } from "react";
import type { FunnelItem, FunnelResult } from "@trade-data-manager/market/domain";
import { expandToPointItems } from "../../lib/grainView.js";
import { chartKey } from "../../lib/pointKey.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { useWorkbench } from "../../store/workbench.js";
import { resolveSetRef, type ResolvedSet, type SetResolveCtx } from "./resolveSet.js";
import { usePresenceIndex } from "../../lib/usePresence.js";
import { hasActiveDnf, matchesPresenceDnf } from "../../lib/presence.js";

const EMPTY_MARKS: ReadonlyMap<string, number> = new Map();
const EMPTY_GROUPS: readonly string[] = [];

/** 구독 패널이 소비하는 "보는 집합"의 계약 — viewOf 가 돌려주는 유일한 모양. */
export interface ViewedSet {
    /**
     * 걸린 게 있나 — false 면 구독자는 거르지 않는다(전체 = 제한 없음). 명시 바인딩은 로딩이 끝나면 true.
     * ⚠ 로딩 가드가 **여기 들어 있다**(로딩 중 false) — 판정이 안 끝난 빈 집합으로 거르면 빈 화면이
     * "조건에 다 걸렸다"로 읽히는데, 그 가드를 소비자마다 되풀이하게 두면 하나는 반드시 빠뜨린다.
     */
    isFiltering: boolean;
    /** 깨진 참조(지워진 그룹·필터·단계) — 빈 집합과 구분해 화면이 이유를 말해야 한다(자동 폴백 금지). */
    broken: boolean;
    viewedItems: FunnelItem[];
    viewedChartKeys: Set<string>;
    viewedPointRefs: { stockCode: string; date: string; time: string }[];
}

export interface SetViews {
    /** 집합 참조 풀기 — 계약과 캐시 규칙은 FunnelView.resolveSet 주석 참조. */
    resolveSet: (ref: SetRef) => ResolvedSet;
    /** 패널이 보는 집합 — 계약은 FunnelView.viewOf 주석 참조. */
    viewOf: (ref: SetRef | null) => ViewedSet;
}

/**
 * ctx 는 **재료가 하나라도 바뀌면 새로 서는** 메모여야 한다(useFilterFunnel 이 만든다) — 리졸버와
 * 그 캐시의 수명이 ctx 의 참조 동일성에 매여 있다.
 */
export function useSetViews(result: FunnelResult | null, ctx: SetResolveCtx): SetViews {
    const selection = useWorkbench((s) => s.funnelSelection);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    // 시선(전역) — "보는 집합 = 집합 ∩ 월 ∩ 존재필터"를 **여기 한 곳**에서 접는다. 소비자(골격·시트·
    // 그룹목록·작업셋 렌즈·레일 오버레이)마다 되풀이하면 하나는 빠뜨리고, 그 화면만 딴 것을 그린다.
    // 정산(tally·5칸 숫자)은 viewOf 를 안 거치므로 시선과 무관하다 — 시선은 조건이 아니다.
    // 존재필터의 낟알은 day: 타점 항목도 "그 날이 통과하면 통과"(작업셋 행 필터와 같은 의미론).
    const gazeMonths = useWorkbench((s) => s.gazeMonths);
    const gazePresence = useWorkbench((s) => s.gazePresence);
    const { index: presenceIdx } = usePresenceIndex();
    const presenceOn = hasActiveDnf(gazePresence);
    const inGaze = useCallback(
        (i: { stockCode: string; date: string }): boolean => {
            if (!(gazeMonths === null || gazeMonths.includes(i.date.slice(0, 7)))) return false;
            if (!presenceOn) return true;
            // 지도에 없는 날 = 존재 0 으로 평가(결손을 조용히 통과시키지 않는다 — "!골격"은 통과, "골격"은 탈락).
            const p = presenceIdx.get(chartKey(i)) ?? { stockCode: i.stockCode, date: i.date, marks: EMPTY_MARKS, points: 0, groups: EMPTY_GROUPS, comment: false };
            return matchesPresenceDnf(p, gazePresence);
        },
        [gazeMonths, presenceOn, gazePresence, presenceIdx],
    );

    const isLoading = result === null;

    /**
     * 리졸버 — 재료가 하나라도 바뀌면 함수째 새로 서고(ctx 메모), 그 안의 캐시도 같이 버려진다
     * (저장 집합의 정산만 재료 세대 기준 세션 캐시로 살아남는다 — resolveSet.ts 의 sessionDefCache).
     * 작업 깔때기(null)는 **깔때기 정산(result)을 그대로 재사용**한다(ctx.activeFilter) — 두 번 평가하지
     * 않을 뿐 아니라, "연동"과 "최종 생존" 바인딩이 같은 grain(자동 해상도)으로 풀린다.
     */
    const resolveSet = useMemo(() => {
        const cache = new Map<string, ResolvedSet>();
        return (ref: SetRef): ResolvedSet => {
            const k = setRefKey(ref);
            const hit = cache.get(k);
            if (hit) return hit;
            const r: ResolvedSet = isLoading ? { broken: false, grain: "day", items: [] } : resolveSetRef(ref, ctx);
            cache.set(k, r);
            return r;
        };
    }, [ctx, isLoading]);

    // 지금 보는 집합 — 짚은 칸이면 그 **칸 참조를 리졸버로** 푼다(칸 합집합 구현은 리졸버 한 벌뿐이어야
    // 한다 — 두 벌이면 언젠가 다른 답을 낸다). 리졸버는 깔때기 정산을 재사용하므로 비용은 fold 하나 그대로.
    // 칸이 못 풀리면(단계가 지워짐·꺼짐 — 편집 경로가 시선을 정리하므로 과도기뿐) 최종 생존으로.
    const viewedItems = useMemo<FunnelItem[]>(() => {
        if (!result) return [];
        if (selection) {
            const r = resolveSet({ kind: "cell", stageId: selection.stageId, cells: selection.cells });
            if (!r.broken) return r.items.filter(inGaze);
        }
        return result.survivors.filter(inGaze);
    }, [result, selection, resolveSet, inGaze]);

    // activeFilter 는 로딩 중에만 없다 — 그때는 어차피 아래 로딩 가드가 isFiltering 을 끈다.
    // 월·존재필터 시선도 "걸림"이다 — 조건 없이 시선만 좁혀도 구독 패널은 그만큼만 그려야 한다(안 그러면
    // 작업셋에서 달/필터를 눌렀는데 옆 패널이 무반응인, 시선이 두 벌이던 시절의 어긋남이 재생산된다).
    const isFiltering = (ctx.activeFilter?.active.length ?? 0) > 0 || selection !== null || gazeMonths !== null || presenceOn;
    const viewedChartKeys = useMemo(() => new Set(viewedItems.map((i) => chartKey(i))), [viewedItems]);
    const viewedPointRefs = useMemo(() => {
        const out: { stockCode: string; date: string; time: string }[] = [];
        for (const it of viewedItems) {
            if (it.time !== undefined) out.push({ stockCode: it.stockCode, date: it.date, time: it.time });
            else for (const t of ctx.timesOf(it)) out.push({ stockCode: it.stockCode, date: it.date, time: t });
        }
        return out;
    }, [viewedItems, ctx]);

    // 작업 깔때기 시선 뷰 — 시선(짚은 칸)이 바뀔 때만 새로 선다. 바인딩 뷰 캐시와 **일부러 분리**한다: 명시 바인딩의
    // 값은 시선과 무관한데 한 메모에 두면 칸 클릭마다 캐시가 통째로 버려져 바인딩 패널들이 헛돈다.
    // isFiltering 의 로딩 가드는 **뷰 계약 안에** 둔다 — 소비자마다 가드를 되풀이하면 하나는 빠뜨린다
    // (실제로 시트가 빠뜨려 로딩 중을 "조건에 맞는 타점이 없습니다"로 말했다).
    const gazeView = useMemo<ViewedSet>(
        () => ({ isFiltering: !isLoading && isFiltering, broken: false, viewedItems, viewedChartKeys, viewedPointRefs }),
        [isLoading, isFiltering, viewedItems, viewedChartKeys, viewedPointRefs],
    );
    const boundViewOf = useMemo(() => {
        const cache = new Map<string, ViewedSet>();
        return (ref: SetRef): ViewedSet => {
            const k = setRefKey(ref);
            const hit = cache.get(k);
            if (hit) return hit;
            const r = resolveSet(ref);
            const items = r.items.filter(inGaze); // 월 시선 — 집합 정의는 그대로, 보이는 창만 좁힌다
            const v: ViewedSet = {
                isFiltering: !isLoading, // 로딩 중의 빈 집합으로 거르면 "조건에 다 걸렸다"로 읽힌다
                broken: r.broken,
                viewedItems: items,
                viewedChartKeys: new Set(items.map((i) => chartKey(i))),
                // 전개(∀) — 하루 항목은 그날 타점 전부로. 타점 0인 하루는 대표가 없다(결손으로 보일 자리).
                viewedPointRefs: expandToPointItems(items, (c) => ctx.timesOf(c))
                    .map((i) => ({ stockCode: i.stockCode, date: i.date, time: i.time! })),
            };
            cache.set(k, v);
            return v;
        };
    }, [resolveSet, ctx, isLoading, inGaze]);
    // 연동(null) = **선택 포인터를 따라간다**: 목록에서 집합을 고르면 그 집합, 깔때기를 만지는 순간
    // 작업 깔때기 시선으로 복귀(포인터 리셋은 슬라이스가 한다 — 여기는 읽기만).
    const viewOf = useCallback(
        (ref: SetRef | null): ViewedSet => {
            const target = ref ?? selectedSetRef;
            return target === null ? gazeView : boundViewOf(target);
        },
        [gazeView, boundViewOf, selectedSetRef],
    );

    return { resolveSet, viewOf };
}
