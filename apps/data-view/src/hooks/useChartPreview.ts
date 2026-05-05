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
    queryFn: () => fetchChartPreviewAction(params!),
    enabled: params !== null,
  });
}
