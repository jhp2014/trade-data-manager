// 실시간 차트 — apps/live(/live 프록시 → :3002) 에서 선택 종목의 오늘 ChartBundle.
// EOD 차트(/api → apps/api, DB)와 같은 ChartBundle 계약이지만 백엔드가 kiwoom 라이브라 date 인자 없음.
import type { ChartBundle } from "@trade-data-manager/wire";

export async function fetchLiveChart(code: string, signal?: AbortSignal): Promise<ChartBundle> {
    const res = await fetch(`/live/chart?code=${encodeURIComponent(code)}`, { signal });
    if (!res.ok) throw new Error(`실시간 차트 ${res.status}`);
    return (await res.json()) as ChartBundle;
}
