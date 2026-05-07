import type { ReactNode } from "react";
import type { StockMetricsDTO } from "@/types/deck";

export interface ColumnRenderCtx {
    tradeTime: string;
}

export interface ColumnDef {
    id: string;
    /** 헤더에 표시되는 라벨 */
    label: string;
    /** 툴팁·문서용 설명 (선택) */
    description?: string;
    /** CSS grid 컬럼 너비. 고정값("100px") 또는 가변("1fr") */
    width: string;
    /** 셀 텍스트 정렬 (기본 right) */
    align?: "left" | "right" | "center";
    /** 셀 렌더 함수 */
    render: (m: StockMetricsDTO, ctx: ColumnRenderCtx) => ReactNode;
    /** 정렬 기준값 반환 함수. undefined면 이 컬럼은 정렬 대상에서 제외 */
    sortKey?: (m: StockMetricsDTO) => number | null;
    /** 컬럼 가시성 설정 (선택) */
    visibility?: { default: boolean; togglable: boolean };
}
