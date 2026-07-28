// ChartBundle 조회 — **날짜로 소스를 고르는 라우터**. wire 타입은 contracts/wire 로 서버와 단일 계약.
//
// 두 백엔드가 같은 번들을 만든다: apps/api ChartReadModel(DB) 과 apps/live LiveChartService(키움 REST) 는
// 같은 core 조립(chartDailyRange·densifyMinutes·basePricesOf)에 포트 구현만 다르다 — 일봉 2년 수정주가·
// dense 분봉·기준가가 같은 규칙으로 나온다. 그래서 날짜에 따라 소스를 갈아도 화면이 흔들리지 않는다.
//
// 정책:
//   · 당일    → 키움(DB 에 아직 없음이 확정 — 수집은 20:30 야간)
//   · 과거    → DB
//   · 과거인데 DB 에 분봉 없음(수집 실패·미수집일) → 키움에서 분봉만 빌림. 일봉 2년은 DB 가 진실이라 유지
//   · 어느 쪽도 안 되면 있는 것만(빈 분봉) — 없는 걸 지어내지 않는다
// 반대 방향 폴백도 둔다: 당일인데 apps/live 가 안 뜨면 DB 로(일봉만이라도 보이게).
import type { ChartBundle } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";
import { fetchLiveChart } from "./liveChart.js";
import { kstToday } from "../lib/date.js";

export type { ChartBundle } from "@trade-data-manager/wire";

/** DB 번들(apps/api) — 수집된 거래일. */
export const fetchChart = (code: string, date: string, signal?: AbortSignal): Promise<ChartBundle> =>
    apiGet<ChartBundle>("chart", { code, date }, signal);

/** 취소는 폴백 대상이 아니다 — react-query 의 취소 의미(키 변경·언마운트)를 그대로 전파해야 한다. */
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

/**
 * 날짜에 맞는 소스에서 번들을 가져온다. 모든 차트 소비자(차트 패널 2개·단축키·분석 오버레이)가
 * 이 한 함수를 통해서만 번들을 얻는다 — 그래서 RQ 키 하나(["chart", code, date])로 캐시가 공유된다.
 */
export async function fetchChartBundle(code: string, date: string, signal?: AbortSignal): Promise<ChartBundle> {
    if (date >= kstToday()) {
        // 당일(및 미래 날짜) — 브로커만 답을 갖는다. 실패하면 DB 로 내려가 일봉만이라도.
        try {
            return await fetchLiveChart(code, date, signal);
        } catch (e) {
            if (isAbort(e)) throw e;
            return fetchChart(code, date, signal);
        }
    }
    const bundle = await fetchChart(code, date, signal);
    if (bundle.minutes.length > 0) return bundle;
    // DB 에 그 날 분봉이 없다 → 브로커에서 분봉만 빌린다. 일봉·기준가는 DB 것 우선.
    try {
        const live = await fetchLiveChart(code, date, signal);
        if (live.minutes.length === 0) return bundle;
        return { ...bundle, minutes: live.minutes, basePrice: bundle.basePrice ?? live.basePrice };
    } catch (e) {
        if (isAbort(e)) throw e;
        return bundle; // 브로커도 못 주면 분봉 없는 채로(= 없다고 정직하게)
    }
}
