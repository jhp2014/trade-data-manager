// 실시간 차트 — apps/live(/live 프록시 → :3002) 에서 선택 종목의 ChartBundle.
// EOD 차트(/api → apps/api, DB)와 같은 ChartBundle 계약이지만 백엔드가 kiwoom 라이브.
// date 미지정=오늘(마지막 세션), 지정=그 날짜(과거 탐색, REST).
import type { ChartBundle } from "@trade-data-manager/wire";
import { liveGet } from "./http.js";

export const fetchLiveChart = (code: string, date?: string, signal?: AbortSignal): Promise<ChartBundle> =>
    liveGet<ChartBundle>("chart", date ? { code, date } : { code }, signal);
