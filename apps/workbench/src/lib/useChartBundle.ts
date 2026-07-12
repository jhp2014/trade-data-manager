// ChartBundleSource 추상 — plane 별 소스 라우팅. 차트 패널은 이 훅만 쓰고 소스(REST/DB)를 모른다.
//  · live   = REST (apps/live /live/chart, DB 없음) — 과거 탐색도 REST.
//  · replay = DB (apps/api /chart). 분봉 없을 때 REST 폴백은 Stage 5 에서 이 계층에 추가.
// [[two-plane-focus-data-routing]]
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ChartBundle } from "@trade-data-manager/wire";
import { fetchLiveChart } from "../api/liveChart.js";
import { fetchChart } from "../api/chart.js";

export type ChartPlane = "live" | "replay";

export function useChartBundle(
    plane: ChartPlane,
    code: string,
    date: string,
    opts?: { refetchInterval?: number | false },
): UseQueryResult<ChartBundle> {
    return useQuery({
        queryKey: ["chartBundle", plane, code, date],
        queryFn: ({ signal }) => (plane === "live" ? fetchLiveChart(code, date, signal) : fetchChart(code, date, signal)),
        enabled: !!code && !!date,
        refetchInterval: opts?.refetchInterval ?? false,
        refetchOnWindowFocus: false,
    });
}
