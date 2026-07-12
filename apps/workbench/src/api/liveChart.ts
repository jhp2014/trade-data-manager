// 실시간 차트 — apps/live(/live 프록시 → :3002) 에서 선택 종목의 ChartBundle.
// EOD 차트(/api → apps/api, DB)와 같은 ChartBundle 계약이지만 백엔드가 kiwoom 라이브.
// date 미지정=오늘(마지막 세션), 지정=그 날짜(과거 탐색, REST).
import type { ChartBundle } from "@trade-data-manager/wire";

export async function fetchLiveChart(code: string, date?: string, signal?: AbortSignal): Promise<ChartBundle> {
    const q = new URLSearchParams({ code });
    if (date) q.set("date", date);
    const res = await fetch(`/live/chart?${q.toString()}`, { signal });
    if (!res.ok) throw new Error(`실시간 차트 ${res.status}`);
    return (await res.json()) as ChartBundle;
}
