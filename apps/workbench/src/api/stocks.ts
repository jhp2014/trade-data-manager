// /stocks/master 조회 — 종목 마스터 전량(코드·이름·시장). 부팅에 한 번 받아 이름 사전을 만든다.
import type { StockMeta } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { StockMeta } from "@trade-data-manager/wire";

export const fetchStockMaster = (signal?: AbortSignal): Promise<StockMeta[]> =>
    apiGet<StockMeta[]>("stocks/master", undefined, signal);
