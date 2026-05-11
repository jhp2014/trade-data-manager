"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStockThemesAction, type StockThemesDTO } from "@/actions/chartPreview";

/**
 * (stockCode, tradeDate) → 테마 메타 목록 + self 종목명.
 *
 * Stock Chart 모드에서 테마 칩 표시용으로 사용. ChartModal 이 열릴 때
 * 호출되는 useChartPreview 와는 쿼리키를 분리한다 (페이로드 형태가 다름).
 *
 * staleTime / gcTime 은 QueryProvider 의 전역 기본값(5분 / 30분)을 상속.
 */
export function useStockThemes(
    params: { stockCode: string; tradeDate: string } | null,
) {
    return useQuery<StockThemesDTO>({
        queryKey: ["stock-themes", params?.stockCode, params?.tradeDate],
        queryFn: async () => {
            const res = await fetchStockThemesAction(params!);
            if (!res.ok) throw new Error(res.error);
            return res.data;
        },
        enabled: params !== null,
    });
}
