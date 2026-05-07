/**
 * URL ↔ 필터 값 직렬화에 사용되는 플랫 파라미터 타입.
 * nuqs의 파서 반환 타입과 1:1 대응된다.
 * See: hooks/useFilterState.ts, lib/filter/registry/types.ts
 */
export interface FilterUrlParams {
    tsMin: number | null;
    tsMax: number | null;
    tmRateMin: number | null;
    tmRateMax: number | null;
    tmAmtMin: number | null;
    tmCntMin: number | null;
    codes: string[] | null;
    dFrom: string | null;
    dTo: string | null;
    tFrom: string | null;
    tTo: string | null;
    rateMin: number | null;
    rateMax: number | null;
    rankMin: number | null;
    rankMax: number | null;
    pbMin: number | null;
    pbMax: number | null;
    mshMin: number | null;
    mshMax: number | null;
    opt: string[] | null;
}
