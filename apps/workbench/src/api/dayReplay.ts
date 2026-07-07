// /day-replay 조회 — wire 타입(DayReplay·ReplayStock·MinuteDerived)은 contracts/wire 에서 서버와 단일 계약으로 공유.
// 모든 %는 원주가 직전 거래일 종가 대비(서버 계산). 클라는 시점 스냅샷만 파생.
import type { DayReplay } from "@trade-data-manager/wire";

export type { DayReplay, ReplayStock, MinuteDerived } from "@trade-data-manager/wire";

export async function fetchDayReplay(date: string): Promise<DayReplay> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-replay?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-replay ${res.status}: ${body}`);
    }
    return res.json() as Promise<DayReplay>;
}
