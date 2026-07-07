// /chart 조회 클라이언트 — wire 타입은 contracts/wire 에서 서버와 단일 계약으로 공유.
import type { ChartBundle } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { ChartBundle } from "@trade-data-manager/wire";

export const fetchChart = (code: string, date: string): Promise<ChartBundle> =>
    apiGet<ChartBundle>("chart", { code, date });
