// 깔때기 배선 — 조각 넷을 실제 데이터로 잇는 단 하나의 자리.
//   유니버스(후보 하루) → 표시 알갱이로 펼치기 → 단계별 3치 판정 → 정산(5칸·한계 기여도)
//
// 순수 조각들(stage·evaluate·core/funnel)은 이 훅 없이도 테스트되고, 여기서는 **재료를 꽂는 일만** 한다.
// 그래서 저장 방식이 바뀌면 이 파일만 바뀐다. 시선 쪽(참조 풀기·보는 집합)은 useSetViews 가 잇는다 —
// 여기는 재료와 정산까지, 저쪽은 그 위의 뷰(수명이 다르다: 재료는 사전을, 시선은 클릭을 따라 산다).
//
// ⚠ **사전이 오기 전에는 아무것도 정하지 않는다.** 알갱이 판정이 사전을 보는데, 로딩 중의 "모름"은
// "없음"이 아니라 "곧 옴"이다. 그때 해상도를 확정하면 사전이 도착하는 순간 화면이 통째로 다시 그려지고,
// 더 나쁘게는 그 사이의 5칸 숫자가 전부 미배치로 부풀어 사용자가 그걸 사실로 읽는다.
import { useMemo } from "react";
import {
    expandUniverse, tallyFunnel, type FunnelItem, type FunnelResult,
} from "@trade-data-manager/market/domain";
import { usePointRows } from "../../lib/usePointRows.js";
import { useCandidateDays } from "../../lib/useCandidateDays.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { themeProjectionOf } from "../../lib/themeStrength.js";
import { chartKey, pointKey, rowKeyToChartKey } from "../../lib/pointKey.js";
import type { SetRef } from "../../lib/setRef.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { buildAxisOrderIndexes } from "./axisLookup.js";
import { resolveBound, toFunnelStages, type EvalLookup } from "./evaluate.js";
import type { LabelLookup } from "./label.js";
import type { ResolvedSet, SetResolveCtx } from "./resolveSet.js";
import { useSetViews, type ViewedSet } from "./useSetViews.js";
import {
    activeStages, funnelOrder, isPredicateDead, resolveAutoGrain,
    type FilterStage, type Grain, type GrainLookup, type OrderedStage,
} from "./stage.js";

export interface FunnelView {
    /** 사전(그룹·축·후보·타점)이 다 오기 전 — 이때 숫자를 읽으면 안 된다. */
    isLoading: boolean;
    /** 표시 해상도 — **자동 하나**(걸린 단계 중 가장 가는 층위). 손잡이는 없다(stage.ts 주석 참고). */
    grain: Grain;
    /** 분모. **편집에 따라 조용히 변하므로 화면에 상시 띄운다**(앵커 하나 지우면 그 하루가 빠진다). */
    universe: number;
    /** 전 단계(빈 것·꺼진 것 포함) — 하루가 먼저, 층위 접힘 포함. 화면의 칸 나누기가 이걸 그대로 쓴다. */
    stagesOrdered: OrderedStage[];
    /** 평가에 실제로 들어간 단계 — stagesOrdered 에서 활성만 남긴 것(정산 인덱스와 1:1). */
    active: FilterStage[];
    // ⚠ "지금 보는 집합"(viewedItems 등)은 **계약에 없다** — viewOf 로만 나간다. 한때 최상위 필드였는데,
    // 선택 포인터 도입 후 그 필드는 포인터를 무시한 작업 깔때기 시선이라, 직접 읽는 소비자가 생기는
    // 순간 "목록에서 집합을 골랐는데 이 패널만 안 따라온다"는 조용한 갈림이 된다.
    /** 정산 결과. 로딩 중이면 null. */
    result: FunnelResult | null;
    /** 죽은 참조(지워진 그룹·축)를 든 단계 id — 화면이 표시하고, 정리는 사용자가 결정한다. */
    deadStageIds: string[];
    /** 이름 조회 — 깔때기가 이미 사전을 들고 있으니 라벨을 만드는 자리마다 다시 조립하지 않게. */
    labelLook: LabelLookup;
    // 축 재료(axes)는 **여기서 실어 나르지 않는다.** 한때 필드로 있었던 건 소비자가 useRankAxes 를
    // 다시 부르면 계산 축 값 맵이 여러 벌 만들어졌기 때문인데, 이제 RankAxesProvider 가 한 벌을
    // 보장하므로 그 이유가 사라졌다. 축이 필요한 화면은 useRankAxes() 를 직접 부른다 —
    // 깔때기 계약에 남겨 두면 "축을 어디서 얻나"의 답이 둘이 된다.
    // (blockedLabels — "이 항목을 어느 단계가 막았나" — 도 있었다: 결과 목록의 열이었는데 목록과
    //  함께 갔다. 필요해지면 blockedBy(core)를 다시 감싸면 된다.)
    /**
     * 집합 참조 풀기 — 짚음 채널·패널 바인딩이 실은 SetRef 를 항목 집합으로. 깔때기가 이미 들고 있는
     * 재료(유니버스·사전·판정기)를 그대로 쓰므로 **여기가 유일한 리졸버 자리**다(두 벌이면 딴 답을 낸다).
     * 같은 참조는 캐시로 한 번만 푼다(정규화 키) — 재료가 바뀌면 캐시째 새로 선다. 로딩 중엔 빈 집합.
     */
    resolveSet: (ref: SetRef) => ResolvedSet;
    /**
     * 패널이 보는 집합 — 바인딩 하나로 ViewedSet 을 돌려준다.
     * null = **연동**(필터 패널의 선택 포인터를 따라간다 — 목록에서 고른 집합, 없으면 작업 깔때기 시선),
     * 참조 = 그 집합에 고정(층위 변환 포함).
     * 소비 패널은 viewOf(자기 바인딩) 하나만 읽으면 되고, 바인딩이 없던 시절의 코드와 같은 필드를 쓴다.
     */
    viewOf: (ref: SetRef | null) => ViewedSet;
}

/** 재료 세대 일련번호 — 값 자체엔 뜻이 없고 "바뀌었다"만 말한다(발급은 아래 materialsEpoch). */
let materialsSeq = 0;

/** 테마 재료가 필요 없는 상태의 고정 참조 — 재료 refetch 가 epoch 를 안 올리게 하는 열쇠. */
const NO_SECTION = (): null => null;

const hasThemePredicate = (stages: readonly FilterStage[]): boolean =>
    stages.some((s) => s.predicates.some((p) => p.kind === "themeStrength"));

/** ⚠ 직접 부르지 말 것 — FunnelProvider 가 유일한 호출자다(소비는 useFunnel). 두 번 부르면 정산이 두 벌 돈다. */
export function useFilterFunnel(): FunnelView {
    const stages = useWorkbench(selectFilterStages);
    const savedSets = useWorkbench((s) => s.savedSets);

    const gv = useGroups();
    const ax = useRankAxes();
    const cand = useCandidateDays(); // 복제본 파생 — 서버 왕복 없음(candidateDaysOf)
    const pts = usePointRows(); // point 행 원천(격자 파생 한 벌) — 깔때기 모수가 여기서 온다

    const isLoading = gv.isLoading || ax.isLoading || cand.isLoading || pts.isLoading;

    // 테마 강도 재료 — **전역 게이트(isLoading)에 안 넣는다.** 테마 술어가 없는 화면까지 이 로딩을
    // 기다리게 할 이유가 없고, 술어 판정이 3치라 재료 미도착은 그 술어만 미배치 칸으로 세어진다(탈락 아님).
    // ready(데이터 실도착)로 접는다 — isLoading 만 보면 paused 류에서 빈 인덱스가 "전부 탈락"으로 위장한다.
    const sections = useRankSections();
    const themes = useThemeIndex();
    const themeProj = useMemo(
        () => (!themes.ready || themes.error !== null ? null : themeProjectionOf(themes.index)),
        [themes.ready, themes.error, themes.index],
    );
    // 테마 술어가 **어디에도 없으면**(활성 단계 ∪ 저장 집합) 재료를 상수로 끊는다 — 안 그러면 30분
    // stale 의 멤버십 refetch 가 evalLook → materialsEpoch 를 올려, 테마와 무관한 화면 전체의
    // 정산·저장 집합 캐시가 주기적으로 통째 재계산된다.
    const themeInUse = useMemo(
        () => hasThemePredicate(stages) || savedSets.some((f) => hasThemePredicate(f.stages)),
        [stages, savedSets],
    );
    const sectionRanksAt = themeInUse ? sections.sectionAt : NO_SECTION;
    const themeProjEff = themeInUse ? themeProj : null;

    // ── 색인 ── 조립 규칙과 그 함정은 axisLookup 에(순수·테스트됨).
    const placements = useMemo(() => buildAxisOrderIndexes(ax.linesByAxis), [ax.linesByAxis]);

    /** 후보 하루 → 그 하루의 타점 시각들. 타점 0인 하루는 빈 배열(항목 하나로 남는다). */
    const timesByChart = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const p of pts.points) {
            const k = chartKey(p);
            const list = m.get(k);
            if (list) list.push(p.time);
            else m.set(k, [p.time]);
        }
        return m;
    }, [pts.points]);

    const axisScopes = useMemo(() => new Map(ax.axes.map((a) => [a.key, a.scope as Grain])), [ax.axes]);

    // ── 조회기 ────────────────────────────────────────────────────────────
    const grainLook = useMemo<GrainLookup>(
        () => ({
            groupScope: (id) => gv.groupByName.get(id)?.scope,
            axisScope: (id) => axisScopes.get(id),
        }),
        [gv.groupByName, axisScopes],
    );

    const evalLook = useMemo<EvalLookup>(
        () => ({
            // 적용 집합(직접 ∪ 하루 상속 ∪ 계층 조상) — "테마" 필터가 "테마 ▸ 2차전지" 소속도 잡는다.
            groupNamesOf: (i) => gv.appliedGroupNamesOf({ stockCode: i.stockCode, date: i.date, time: i.time }),
            // "…그룹 없음"은 **그 층위만** 센다(하루 상속 제외) — 위의 합집합으로는 못 묻는 것.
            anyGroupAt: (i, scope) => gv.anyGroupAt({ stockCode: i.stockCode, date: i.date, time: i.time }, scope),
            hasGroup: (id) => gv.groupByName.has(id),
            orderKeyOf: (axisId, i) => {
                const idx = placements.get(axisId);
                if (!idx) return undefined; // 지워진 축 — 판단 불가
                // 타점 항목은 타점 키 → 차트 키 폴백(day 축 행 = 차트) · 하루 항목은 차트 키만.
                return i.time === undefined
                    ? idx.get(chartKey(i))
                    : (idx.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time })) ?? idx.get(chartKey(i)));
            },
            // 경계 앵커 키는 그 축의 행 키다. 옛 저장물(day 축인데 타점 키)은 시각을 벗겨 흡수(rowKeyToChartKey).
            bandBoundOrderKey: (axisKey, point) => {
                const idx = placements.get(axisKey);
                return idx?.get(point) ?? idx?.get(rowKeyToChartKey(point));
            },
            // 값 맵의 키 = 행 키. 타점 항목은 폴백으로 day 축 행(차트)에 닿고, 하루 항목은 차트 키로 직접.
            // point 축을 하루 항목이 만나는 일은 없다(단계에 point 축이 있으면 해상도가 타점).
            axisValueOf: (axisId, i) => {
                const values = ax.computedValues.get(axisId);
                if (!values) return undefined;
                return i.time === undefined
                    ? values.get(chartKey(i))
                    : (values.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time })) ?? values.get(chartKey(i)));
            },
            boundValue: (axisId, b) => resolveBound(b, ax.computedValues.get(axisId)),
            // 순위 단면(구운 번들) — 로딩·오류면 sectionAt 이 null 을 줘 테마 술어가 미배치로 선다.
            sectionRanksAt,
            themeProj: themeProjEff,
        }),
        [gv, placements, ax.computedValues, sectionRanksAt, themeProjEff],
    );

    // ── 정산 ── 표시와 정산이 **같은 순서**를 봐야 한다(하루 먼저) — 어긋나면 "상류"가 화면과 다른 걸 가리킨다.
    const stagesOrdered = useMemo(() => funnelOrder(stages, grainLook), [stages, grainLook]);
    const active = useMemo(() => activeStages(stagesOrdered.map((e) => e.stage)), [stagesOrdered]);

    // 사전이 온 뒤에만 해상도를 확정한다 — 로딩 중의 모름은 "없음"이 아니다.
    const grain = isLoading ? "day" : resolveAutoGrain(stages, grainLook);

    const items = useMemo<FunnelItem[]>(() => {
        if (isLoading) return [];
        return expandUniverse(cand.candidates, grain, (c) => timesByChart.get(chartKey(c)) ?? []);
    }, [isLoading, cand.candidates, grain, timesByChart]);

    const result = useMemo<FunnelResult | null>(
        () => (isLoading ? null : tallyFunnel(items, toFunnelStages(active, evalLook))),
        [isLoading, items, active, evalLook],
    );

    /**
     * 재료 세대 — 정산의 재료(유니버스·타점·사전·축 값·로딩) **전부**를 의존성으로 발급하는 토큰.
     * 리졸버의 세션 캐시가 이 토큰으로 낡음을 판정한다: 세대가 같으면 저장 집합의 정산을 재사용하고
     * (무관한 깔때기 편집이 목록 카운트를 전부 다시 돌리지 않게), 재료가 바뀌면 반드시 무효가 된다.
     * evalLook(그룹·배치·계산 축 값)·grainLook(scope 사전)이 각자의 재료 변경마다 새로 서므로 둘을
     * 물면 축 값·사전 변경이 전부 잡힌다.
     */
    const materialsEpoch = useMemo(
        () => `e${++materialsSeq}`,
        [cand.candidates, timesByChart, evalLook, grainLook, isLoading],
    );

    /**
     * 리졸버 재료 한 벌 — **재료가 하나라도 바뀌면 새로 선다.** useSetViews 의 리졸버·뷰 캐시 수명이
     * 이 객체의 참조 동일성에 매여 있다(낡은 ctx 로 캐시가 살아남으면 낡은 집합을 돌려준다).
     * 작업 깔때기의 정산(result)을 activeFilter 로 그대로 꽂는다 — 이유는 SetResolveCtx 필드 주석 참조.
     */
    const setCtx = useMemo<SetResolveCtx>(
        () => ({
            candidates: cand.candidates,
            timesOf: (c) => timesByChart.get(chartKey(c)) ?? [],
            appliedGroupNamesOf: (i) => gv.appliedGroupNamesOf({ stockCode: i.stockCode, date: i.date, time: i.time }),
            groupScope: (n) => gv.groupByName.get(n)?.scope,
            activeStages: stages,
            savedSetOf: (id) => savedSets.find((f) => f.id === id),
            ...(result !== null ? { activeFilter: { grain, active, tally: result } } : {}),
            materialsEpoch,
            evalLook,
            grainLook,
        }),
        [cand.candidates, timesByChart, gv, evalLook, grainLook, stages, savedSets, grain, active, result, materialsEpoch],
    );

    const { resolveSet, viewOf } = useSetViews(result, setCtx);

    const deadStageIds = useMemo(
        () => (isLoading ? [] : stages.filter((s) => s.predicates.some((p) => isPredicateDead(p, grainLook))).map((s) => s.id)),
        [isLoading, stages, grainLook],
    );

    const labelLook = useMemo<LabelLookup>(
        () => ({
            groupName: (id) => gv.groupByName.get(id)?.name,
            axisName: (id) => ax.axes.find((a) => a.key === id)?.name,
        }),
        [gv.groupByName, ax.axes],
    );

    const universe = items.length;

    // 계약 객체는 필드가 실제로 바뀔 때만 새로 선다 — Provider 로 나가는 값이라, 매 렌더 새 객체면
    // FunnelContext 구독자 전부가 아무 변화 없이도 리렌더된다.
    return useMemo<FunnelView>(
        () => ({
            isLoading,
            grain,
            universe,
            stagesOrdered,
            active,
            result,
            deadStageIds,
            labelLook,
            resolveSet,
            viewOf,
        }),
        [isLoading, grain, universe, stagesOrdered, active, result, deadStageIds, labelLook, resolveSet, viewOf],
    );
}
