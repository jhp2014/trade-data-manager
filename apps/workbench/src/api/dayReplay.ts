// /day-replay 조회 — wire 타입(DayReplay·ReplayStock·MinuteDerived)은 contracts/wire 공유.
// 모든 %는 원주가 직전 거래일 종가 대비(서버 계산). 클라는 시점 스냅샷만 파생.
import type { DayReplay } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { DayReplay, ReplayStock, MinuteDerived } from "@trade-data-manager/wire";

export const fetchDayReplay = (date: string, signal?: AbortSignal): Promise<DayReplay> => apiGet<DayReplay>("day-replay", { date }, signal);
