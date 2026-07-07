// /price-lines 계약 — 차트 가격선 주석(앵커 기반). 저장/조회 값타입은 core/market 도메인 그대로라 재노출.
import type { PriceLine, PriceLinedStock, PriceLineField } from "@trade-data-manager/market";

export type { PriceLine, PriceLinedStock, PriceLineField };

/** POST /price-lines 요청 바디 — 가격이 아니라 앵커(캔들 좌표)를 저장한다. */
export interface AddPriceLineInput {
    stockCode: string;
    date: string; // 차트 로드 단위
    anchorDate: string; // 앵커 캔들 거래일
    anchorTime?: string; // 있으면 분봉 앵커, 없으면 일봉 앵커
    field?: PriceLineField; // 기본 high
    memo?: string;
}
