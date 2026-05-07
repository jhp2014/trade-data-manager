import type { ComponentType } from "react";
import type { ThemeRowData } from "@/types/deck";
import type { FilterUrlParams } from "./urlParams";

export interface FilterChip {
    id: string;
    label: string;
}

export interface FilterDefinition<TValue> {
    id: string;
    label: string;
    /** 패널 내 섹션 */
    section: "theme" | "target";
    /** 빈(비활성) 상태의 기본값 */
    defaultValue: TValue;
    /** URL 파라미터 → 필터 값 역직렬화 */
    fromUrl: (p: FilterUrlParams) => TValue;
    /** 필터 값 → URL 파라미터 패치 직렬화 */
    toUrl: (v: TValue) => Partial<FilterUrlParams>;
    /** 활성 칩 목록 반환. 비활성이면 빈 배열 */
    chips: (v: TValue) => FilterChip[];
    /** 특정 칩을 제거한 새 값 반환 */
    clearChip: (chipId: string, current: TValue) => TValue;
    /** 해당 필터 기준으로 행 포함 여부 판단 */
    match: (row: ThemeRowData, v: TValue) => boolean;
    /** 필터 입력 UI 컴포넌트 */
    Input: ComponentType<{ value: TValue; onChange: (v: TValue) => void }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFilterDef = FilterDefinition<any>;
