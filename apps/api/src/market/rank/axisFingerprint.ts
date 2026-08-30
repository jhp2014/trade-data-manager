// 앵커 지문 — params 선언 축의 자동 무효화(무효화의 심장). 순수 함수라 직접 테스트한다.
// 캐시 항목의 지문(f)과 현재 지문을 대조해 다른 타점만 다시 굽는 건 ComputedAxes 의 몫.
import type { ComputedAxisDef, ChartAnchor } from "@trade-data-manager/market";

/** 지문에 넣을 파라미터 = 필수 ∪ 선택. 선택 파라미터도 바뀌면 값이 바뀌므로 무효화 대상은 같다. */
export const fingerprintParams = (def: ComputedAxisDef): readonly string[] => [...(def.params ?? []), ...(def.optionalParams ?? [])];

/**
 * 이 축에서 타점의 입력 지문 — 선언된 파라미터(필수+선택) 앵커 좌표의 직렬화. 앵커가 바뀌면 문자열이 바뀐다.
 * 파라미터 없는 축은 항상 ""(= 지문 대조가 무의미, 캐시 히트는 존재 여부만으로).
 *
 * 앵커가 차트 소유가 된 뒤로 지문은 **그 차트에서 타점에 적용되는 앵커들**(anchorAppliesTo)로 만든다 —
 * 차트에 선 하나를 긋거나 지우면 그 차트의 모든 타점 지문이 바뀌어 같이 다시 구워진다(리졸버의 "가격
 * 최저"가 어느 선이든 바뀔 수 있으니 정확히 원하는 무효화다).
 *
 * **pointCoupled 축은 형제 타점 시각 목록도 지문에 넣는다** — 값이 같은 차트의 다른 타점 존재에
 * 의존하기 때문(타점 종가 합성). 타점을 추가/삭제하면 그 차트의 타점들이 같이 다시 구워진다.
 * 없으면 새 타점이 형제의 참값을 바꿨는데 캐시는 그대로인 조용한 스테일이 남는다.
 *
 * ⚠ 정렬은 **직렬화한 문자열 전체**로 한다. param 만으로 정렬하면 한 param 에 앵커가 여럿일 때(무시 캔들·
 *   다중 기준선) 순서가 DB 행 순서에 좌우돼, 아무것도 안 바꿨는데 지문이 달라지고 전량 재계산이 된다.
 */
export const fingerprintOf = (def: ComputedAxisDef, applicable: ChartAnchor[], siblingTimes: readonly string[]): string => {
    const params = fingerprintParams(def);
    if (params.length === 0) return "";
    const anchorsFp = anchorsFingerprint(applicable, params);
    return def.grain !== "day" && def.pointCoupled ? `${anchorsFp}#pts=${[...siblingTimes].sort().join(",")}` : anchorsFp;
};

/**
 * 앵커 좌표 직렬화 자체 — 축 정의와 무관한 순수 조각. 자동 타점 격자(grid/pointGrids)가 기준선 무효화
 * 지문으로 같은 직렬화를 쓴다 — 손으로 다시 적으면 정렬 규칙이 두 벌이 된다(위 ⚠의 재발).
 */
export const anchorsFingerprint = (anchors: readonly ChartAnchor[], params: readonly string[]): string =>
    anchors
        .filter((a) => params.includes(a.param))
        .map((a) => `${a.param}@${a.anchorDate}T${a.anchorTime ?? ""}|${a.field ?? ""}|${a.market ?? ""}`)
        .sort()
        .join(";");
