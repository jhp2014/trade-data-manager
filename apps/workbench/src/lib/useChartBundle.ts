// 차트 번들(일봉 2년 + 당일 분봉) 읽기 — **읽기 포트**. 소스 라우팅(당일=브로커/과거=DB)은 chartQuery 가
// 날짜로 고르고, 여기는 **observer 옵션 규칙**을 한 곳에 박는다:
//   · keepPreviousData 상시 — 종목 전환 중 직전 번들을 들고 있어 차트가 로딩으로 언마운트되지 않는다
//     (뷰 상태·스케일 고정 보존). 대신 "번들이 이 종목 것인가" 가드는 소비자 몫(ownBundle 류).
//   · live 일 때만 폴링(LIVE_CADENCE_MS) — 실시간 차트의 오늘 형성봉 갱신. 과거로 드리프트한 분봉은 정적.
// 캐시 키는 chartQuery 하나라 복기·실시간·단축키·분석 오버레이가 **같은 번들 한 벌**을 본다(중복 페치 0) —
// RQ 는 observer 별로 refetchInterval·placeholderData 를 따로 적용하므로 옵션이 달라도 캐시는 안 갈린다.
// 옛날엔 이 규칙이 ChartPanel·RealtimeChartPanel 두 파일에 흩어져 있었다.
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ChartBundle } from "../api/chart.js";
import { chartQuery } from "../api/queries.js";
import { LIVE_CADENCE_MS } from "./liveCadence.js";

export interface ChartBundleOptions {
    /** 장중 폴링 — 실시간 플레인에서 오늘 날짜를 볼 때만 true. */
    live?: boolean;
}

export function useChartBundle(code: string, date: string, opts: ChartBundleOptions = {}): UseQueryResult<ChartBundle, Error> {
    return useQuery({
        ...chartQuery(code, date),
        placeholderData: keepPreviousData,
        refetchInterval: opts.live ? LIVE_CADENCE_MS : false,
    });
}
