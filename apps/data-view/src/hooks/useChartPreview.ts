"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchChartPreviewAction } from "@/actions/chartPreview";
import type { ChartPreviewDTO } from "@/types/chart";

/**
 * (stockCode, tradeDate) 단위로 캐시.
 * tradeTime 은 마커 위치 정보일 뿐이라 캐시 키에서 제외.
 */
export function useChartPreview(
    params: { stockCode: string; tradeDate: string } | null,
) {
    return useQuery<ChartPreviewDTO>({
        queryKey: ["chart-preview", params?.stockCode, params?.tradeDate],
        queryFn: async () => {
            const res = await fetchChartPreviewAction(params!);
            if (!res.ok) throw new Error(res.error);
            return res.data;
        },
        enabled: params !== null,
    });
}
