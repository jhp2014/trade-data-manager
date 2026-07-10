// /dates 조회 — 데이터(분봉) 있는 거래일 목록. data-aware 날짜피커용(전역, 종목무관).
import type { DataDate } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { DataDate } from "@trade-data-manager/wire";

export const fetchDataDates = (signal?: AbortSignal): Promise<DataDate[]> => apiGet<DataDate[]>("dates", undefined, signal);
