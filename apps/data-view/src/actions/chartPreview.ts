"use server";

import {
  fetchChartPreview,
  type ChartPreviewData,
  type ChartCandle,
  type ChartLinePoint,
  type ChartOverlaySeries,
} from "@trade-data-manager/feature-engine";
import { getDataViewDb } from "./db";

export type { ChartCandle, ChartLinePoint, ChartOverlaySeries };
export type ChartPreviewDTO = ChartPreviewData;

export async function fetchChartPreviewAction(params: {
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
}): Promise<ChartPreviewDTO> {
  const db = getDataViewDb();
  return await fetchChartPreview(db, params);
}
