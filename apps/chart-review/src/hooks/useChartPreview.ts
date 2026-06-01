"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChartPreviewDTO } from "@/types/chart";

/**
 * (stockCode, tradeDate) 단위로 캐시.
 * tradeTime 은 마커 위치 정보일 뿐이라 캐시 키에서 제외.
 *
 * GET /api/chart-preview 로 조회한다. (Server Action 을 쓰면 호출마다 Next 가
 * 라우트를 재렌더 → loadSheetRows 재실행 → 재조회 루프가 발생하므로 GET 사용)
 */
export function useChartPreview(
    params: { stockCode: string; tradeDate: string } | null,
) {
    return useQuery<ChartPreviewDTO>({
        queryKey: ["chart-preview", params?.stockCode, params?.tradeDate],
        queryFn: async () => {
            const qs = new URLSearchParams({
                stockCode: params!.stockCode,
                tradeDate: params!.tradeDate,
            });
            const res = await fetch(`/api/chart-preview?${qs.toString()}`);
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? `차트 조회 실패 (${res.status})`);
            }
            return (await res.json()) as ChartPreviewDTO;
        },
        enabled: params !== null,
    });
}
