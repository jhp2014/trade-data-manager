// /stocks/meta 조회 — 종목 메타(이름·시장) 경량. 이름 하나 얻으려 day-summary(수 MB)를 당기지 않으려는 것.
import type { StockMeta } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { StockMeta } from "@trade-data-manager/wire";

export const fetchStocksMeta = (codes: string[], signal?: AbortSignal): Promise<StockMeta[]> =>
    apiGet<StockMeta[]>("stocks/meta", { codes: codes.join(",") }, signal);
