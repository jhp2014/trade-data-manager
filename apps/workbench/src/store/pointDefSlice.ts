// 타점 정의 슬라이스 — 자동 타점의 읽기 층 정의(게이트·제외 창·병합) **한 벌**(영속).
//
// 정의는 깔때기 단이 아니라 **모수 선언**이다(decisions.md "깔때기 조건 UI") — 돌리면 자동 Point 의
// 존재·위치가 바뀌어 전 레일 분포가 재계산되므로, 필터 조건과 같은 줄에 서지 않고 편성 보드 머리가
// 편집한다. SavedSet payload 에 사본이 실린다(집합 자립 — savedSetsSlice 가 persistPointDef 를 쓴다).
import type { StateCreator } from "zustand";
import { DEFAULT_POINT_DEFINITION, type PointDefinition } from "@trade-data-manager/market/domain";
import { parsePointDef } from "../lib/pointDef.js";
import { persistedField } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

const POINT_DEF = persistedField<PointDefinition>("wb.pointDef.v1", parsePointDef, DEFAULT_POINT_DEFINITION);

/** 저장까지 한 손에 — 다른 슬라이스(집합 열기)가 정의를 되돌릴 때도 같은 영속 경로를 지나게 한다. */
export const persistPointDef = (def: PointDefinition): PointDefinition => POINT_DEF.save(def);

/** point 행의 출처 — auto(격자 파생) / hand(수동 review_points). 합집합은 안 만든다:
 *  같은 (종목,날짜,분)의 키 충돌과 "이 숫자가 어디서 왔는지 모르는 화면"이 생긴다(planner 확정). */
export type PointSource = "auto" | "hand";
const POINT_SOURCE = persistedField<PointSource>(
    "wb.pointSource.v1",
    (o) => (o === "auto" || o === "hand" ? o : null),
    "auto",
);

export interface PointDefSlice {
    /** 자동 타점 판정 정의 — pointsOf 의 유일한 입력(usePointGrids·차트 마커·특징 축이 같은 한 벌을 본다). */
    pointDef: PointDefinition;
    /** 시트·깔때기·작업셋의 point 행 출처(usePointRows 가 소비). 차트 저장/삭제(useChartPoints)는 손 타점 고정. */
    pointSource: PointSource;
    setPointDef: (patch: Partial<PointDefinition>) => void;
    resetPointDef: () => void;
    setPointSource: (source: PointSource) => void;
}

export const createPointDefSlice: StateCreator<WorkbenchState, [], [], PointDefSlice> = (set) => ({
    pointDef: POINT_DEF.load(),
    pointSource: POINT_SOURCE.load(),
    setPointDef: (patch) => set((s) => ({ pointDef: persistPointDef(parsePointDef({ ...s.pointDef, ...patch }) ?? DEFAULT_POINT_DEFINITION) })),
    resetPointDef: () => set(() => ({ pointDef: persistPointDef(DEFAULT_POINT_DEFINITION) })),
    setPointSource: (source) => set(() => ({ pointSource: POINT_SOURCE.save(source) })),
});
