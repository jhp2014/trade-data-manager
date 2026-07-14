// 차트 가격선 주석 CRUD 클라이언트. wire 타입(PriceLine·PriceLinedStock·PriceLineField·AddPriceLineInput)은 contracts/wire 공유.
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 표시 시점에 로드된 캔들에서 값을 읽어 RenderLine 으로 해소.
import type { PriceLine, PriceLinedStock, AddPriceLineInput } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { PriceLine, PriceLinedStock, PriceLineField, AddPriceLineInput } from "@trade-data-manager/wire";

/** 차트 렌더용 — 앵커를 로드된 캔들에서 해소한 결과. 차트 컴포넌트는 이것만 안다(와이어 아님, 클라 뷰모델). */
export interface RenderLine {
    id: string;
    price: number; // 해소된 raw 가격(원)
    kind: "D" | "M" | "A"; // 일봉/분봉 앵커(주석) 또는 A=알람 가격조건 — 색·라벨
}

export const fetchPriceLines = (code: string, date: string, signal?: AbortSignal): Promise<PriceLine[]> =>
    apiGet<PriceLine[]>("price-lines", { code, date }, signal);

export const addPriceLine = (line: AddPriceLineInput): Promise<PriceLine> => apiPost<PriceLine>("price-lines", line);

export const removePriceLine = (id: string): Promise<void> => apiDelete(`price-lines/${id}`);

/** 선이 하나라도 있는 (종목,날짜) 전부 — 월 그룹은 클라. 날짜 내림차순. */
export const fetchPriceLinedStocks = (signal?: AbortSignal): Promise<PriceLinedStock[]> => apiGet<PriceLinedStock[]>("price-lines/stocks", undefined, signal);
