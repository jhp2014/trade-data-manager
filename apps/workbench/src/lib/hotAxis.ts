// 급타점 수의 **축 인스턴스** — 조건(hotPoints 술어) 하나가 축 하나를 세운다.
// 규칙 원문은 `.claude/decisions.md` 「급타점 수 축」 절.
//
// ⚠ **축 id 는 조건 id 다**(`c:hot:<stageId>`) — 파라미터가 아니다. 값의 정체를 정하는 건 (W,r) 이지만
//   그걸 주소로 쓰면 **W 를 만질 때마다 열 폭·고정·숨김·정렬이 리셋된다**("축 키는 뜻의 주소" 규칙,
//   결과 열이 `out:i:<stageId>:<id>` 로 같은 함정을 피한 것과 같은 해법). 파라미터는 **이름에만** 싣는다.
//
// ⚠ 이 축은 「축(axis) 시스템」의 "런타임 등록 없음"의 **유일한 예외**다. 대가를 막는 장치 둘:
//   상한(HOT_MAX_INSTANCES, 생성 지점에서만) · 결정론적 키(조건이 지워지면 유령 청소가 걷어간다).
//
// 잎 모듈로 둔다(패널·스토어를 물지 않는다) — 시트·축 목록·청소가 전부 여기를 지나므로 순환이 생기면
// 그 셋이 한 덩어리가 된다.
import { useMemo } from "react";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { computedAxisId } from "./computedAxis.js";
import { derivedOfAuto } from "./defDerived.js";
import { hotCountsOf, hotPairsOf, type HotCounts, type HotPairs } from "./hotPoints.js";
import type { AutoPointsView } from "./usePointGrids.js";
import type { FilterStage } from "../panels/filter/stage.js";

/** 이 조건이 세우는 축의 키. */
export const hotAxisKey = (stageId: string): string => `hot:${stageId}`;
/** 이 조건이 세우는 축의 id — 시트 열·필터·레일 순서 pref 가 드는 주소. */
export const hotAxisId = (stageId: string): string => computedAxisId(hotAxisKey(stageId));

const HOT_ID_PREFIX = computedAxisId("hot:");
/** 급타점 축인가 — 편집 경로를 하나로 닫는 데 쓴다(레일 패널이 이 축을 안 깔게, 아래 주석). */
export const isHotAxisId = (axisId: string): boolean => axisId.startsWith(HOT_ID_PREFIX);

/** 축 이름 — 파라미터는 여기에만 산다(주소가 아니라). */
export const hotAxisName = (w: number, r: number): string => `급타점 수 (${w}분/${r}%)`;

export interface HotInstance {
    /** 이 인스턴스를 세운 조건. 축 주소의 재료. */
    stageId: string;
    w: number;
    r: number;
}

/**
 * 지금 선 인스턴스 목록 — **꺼둔 조건도 센다**. 그것이 "조건 없이 여러 (W,r) 을 열로 펼쳐 비교"가
 * 성립하는 유일한 근거다(탐색 = 꺼진 행, 결과 조건과 같은 어휘).
 * 상한(HOT_MAX_INSTANCES)은 **여기서 안 자른다** — 밖에서 온 저장 집합이 더 들고 오면 전부 세운다
 * (안 보이는데 필터링되는 것보다 정직하다. 상한은 생성 지점의 규칙이다).
 */
export function hotInstancesOf(stages: readonly FilterStage[]): HotInstance[] {
    const out: HotInstance[] = [];
    for (const s of stages) {
        const p = s.predicates.find((x) => x.kind === "hotPoints");
        if (p !== undefined && p.kind === "hotPoints") out.push({ stageId: s.id, w: p.w, r: p.r });
    }
    return out;
}

/**
 * 인스턴스 목록의 **내용 키**. 축 피드를 `stages` 배열 신원에 물면 아무 조건이나 한 번 만질 때마다
 * `computedValues → evalLook → materialsEpoch` 사슬이 **저장 집합 정산 캐시를 통째로 무효화**한다
 * (qualifyKeyOf 와 같은 처방).
 */
export const hotInstancesKeyOf = (list: readonly HotInstance[]): string =>
    list.map((h) => `${h.stageId}:${h.w}:${h.r}`).join(",");

/**
 * 인스턴스 → 축 피드. 값은 정의별 캐시의 (W,r) 슬라이스에서 오고, 캐시 산출물이 아닌 뷰(테스트 주입 등)
 * 면 직접 센다 — 격자 특징 피드(gridFeatureFeeds)의 폴백과 같은 결.
 */
export function hotAxisFeeds(view: AutoPointsView, instances: readonly HotInstance[]): ComputedAxisFeed[] {
    const derived = derivedOfAuto(view);
    return instances.map((h): ComputedAxisFeed => ({
        key: hotAxisKey(h.stageId),
        name: hotAxisName(h.w, h.r),
        strongerWhen: "higher", // 많이 세어질수록 오른쪽 — 큰 값이 곧 "부담이 큰 쪽"
        display: { suffix: "개", decimals: 0, signed: false },
        values: (derived?.hot(h.w, h.r) ?? hotCountsOf(view.points, h.w, h.r)).values,
    }));
}

/** 폴백 캐시 상한 — defDerived 를 못 딛는 뷰(테스트 주입)에서만 쓰인다. */
const FALLBACK_SLICES = 8;

/**
 * (W,r) 별 급타점 수 단면 **접근자** — 결과의 `useOutcomeSlices` 와 같은 관용구다.
 * 값의 출처는 정의별 캐시 한 곳(defDerived)이고, 캐시를 못 딛는 뷰만 지역 LRU 로 받는다.
 * 함수 신원은 `view` 에만 매인다 — (W,r) 을 옮겨도 이 접근자를 문 memo 는 안 갈린다.
 */
export function useHotCountsValue(view: AutoPointsView): (w: number, r: number) => HotCounts {
    return useMemo(() => {
        const derived = derivedOfAuto(view);
        if (derived) return (w: number, r: number): HotCounts => derived.hot(w, r);
        const cache = new Map<string, HotCounts>();
        return (w: number, r: number): HotCounts => {
            const k = `${w}|${r}`;
            const hit = cache.get(k);
            if (hit !== undefined) {
                cache.delete(k); // LRU 갱신
                cache.set(k, hit);
                return hit;
            }
            const made = hotCountsOf(view.points, w, r);
            cache.set(k, made);
            if (cache.size > FALLBACK_SLICES) cache.delete(cache.keys().next().value!);
            return made;
        };
    }, [view]);
}

/** 연속 쌍의 간격·상승률 한 벌(노브 무관) — W·r 레일의 과녁. */
export function useHotPairsValue(view: AutoPointsView): HotPairs {
    return useMemo(() => derivedOfAuto(view)?.hotPairs() ?? hotPairsOf(view.points), [view]);
}
