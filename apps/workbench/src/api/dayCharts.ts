// 당일 전체 차트 조회 — GET /day-charts?date → 그날 universe 전 종목 ChartBundle[](raw).
// 클라가 통째로 들고 시점별 파생(리플레이). 응답은 서버 gzip(수십MB→~3MB).
import type { ChartBundle } from "./chart.js";

export async function fetchDayCharts(date: string): Promise<ChartBundle[]> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-charts?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-charts ${res.status}: ${body}`);
    }
    return res.json() as Promise<ChartBundle[]>;
}
