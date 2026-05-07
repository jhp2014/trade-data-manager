"use client";

import { useQuery } from "@tanstack/react-query";
import {
    fetchChartPreviewAction,
    type ChartPreviewDTO,
} from "@/actions/chartPreview";

export function useChartPreview(
    params: { stockCode: string; tradeDate: string; tradeTime: string } | null
) {
    return useQuery<ChartPreviewDTO>({
        queryKey: [
            "chart-preview",
            params?.stockCode,
            params?.tradeDate,
            params?.tradeTime,
        ],
        queryFn: async () => {
            const res = await fetchChartPreviewAction(params!);
            if (!res.ok) throw new Error(res.error);
            return res.data;
        },
        enabled: params !== null,
    });
}
