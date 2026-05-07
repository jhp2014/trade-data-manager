import type { ReactNode } from "react";
import type { StockMetricsDTO } from "@/types/deck";

export interface ColumnRenderCtx {
    tradeTime: string;
}

export interface ColumnDef {
    id: string;
    label: string;
    width: string;
    render: (m: StockMetricsDTO, ctx: ColumnRenderCtx) => ReactNode;
    sortKey?: (m: StockMetricsDTO) => number | null;
}
