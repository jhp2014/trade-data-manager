// ChartBundleSource 추상 — plane 별 소스 라우팅. 차트 패널은 이 훅만 쓰고 소스(REST/DB)를 모른다.
//  · live   = REST (apps/live /live/chart, DB 없음) — 과거 탐색도 REST.
//  · replay = DB (apps/api /chart) + 분봉만 없을 때 그 날짜 REST 폴백(일봉은 DB 유지, 분봉·rawBase 만 병합).
// [[two-plane-focus-data-routing]]
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ChartBundle } from "@trade-data-manager/wire";
import { fetchLiveChart } from "../api/liveChart.js";
import { fetchChart } from "../api/chart.js";

export type ChartPlane = "live" | "replay";

// 복기 분봉 REST 폴백 — DB 에 그 날짜 분봉이 없으면(수집 전 최근일 등) /live/chart 에서 분봉만 빌린다.
// 일봉(수정주가 2년)은 DB 가 진실이라 유지. rawBase(분봉 % 기준)는 DB 것 우선, 없으면 라이브 것.
// live 서버 다운/무데이터면 DB 번들 그대로(분봉 빈 채로 렌더 — 기존 동작).
async function fetchReplayChart(code: string, date: string, signal?: AbortSignal): Promise<ChartBundle> {
    const bundle = await fetchChart(code, date, signal);
    if (bundle.minutes.length > 0) return bundle;
    try {
        const live = await fetchLiveChart(code, date, signal);
        if (live.minutes.length === 0) return bundle;
        return { ...bundle, minutes: live.minutes, rawBase: bundle.rawBase ?? live.rawBase };
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e; // 취소는 그대로 전파(react-query 취소 의미 보존)
        return bundle;
    }
}

export function useChartBundle(
    plane: ChartPlane,
    code: string,
    date: string,
    opts?: { refetchInterval?: number | false },
): UseQueryResult<ChartBundle> {
    return useQuery({
        queryKey: ["chartBundle", plane, code, date],
        queryFn: ({ signal }) => (plane === "live" ? fetchLiveChart(code, date, signal) : fetchReplayChart(code, date, signal)),
        enabled: !!code && !!date,
        refetchInterval: opts?.refetchInterval ?? false,
        refetchOnWindowFocus: false,
        // 종목/날짜 전환 중 직전 번들 유지 — 차트가 로딩 화면으로 언마운트되지 않아 뷰 상태(스케일 고정 등)가
        // 보존된다. frameKey 를 데이터에서 파생하는 소비자와 한 쌍(placeholder 기간엔 리프레임 없음).
        placeholderData: keepPreviousData,
    });
}
