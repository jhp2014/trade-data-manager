// 차트 가격선 주석 CRUD 클라이언트. wire 타입(PriceLine·PriceLinedStock·PriceLineField·AddPriceLineInput)은 contracts/wire 공유.
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 표시 시점에 로드된 캔들에서 값을 읽어 RenderLine 으로 해소.
// 이점: 수정계수가 바뀌어도 선이 캔들을 따라 자동 이동(재수정 불필요).
import type { PriceLine, PriceLinedStock, AddPriceLineInput } from "@trade-data-manager/wire";

export type { PriceLine, PriceLinedStock, PriceLineField, AddPriceLineInput } from "@trade-data-manager/wire";

/** 차트 렌더용 — 앵커를 로드된 캔들에서 해소한 결과. 차트 컴포넌트는 이것만 안다(와이어 아님, 클라 뷰모델). */
export interface RenderLine {
    id: string;
    price: number; // 해소된 raw 가격(원)
    kind: "D" | "M"; // 일봉/분봉 앵커 — 색·라벨
}

export async function fetchPriceLines(code: string, date: string): Promise<PriceLine[]> {
    const res = await fetch(`/api/price-lines?${new URLSearchParams({ code, date })}`);
    if (!res.ok) throw new Error(`GET /price-lines ${res.status}`);
    return res.json() as Promise<PriceLine[]>;
}

export async function addPriceLine(line: AddPriceLineInput): Promise<PriceLine> {
    const res = await fetch("/api/price-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(line),
    });
    if (!res.ok) throw new Error(`POST /price-lines ${res.status}`);
    return res.json() as Promise<PriceLine>;
}

export async function removePriceLine(id: string): Promise<void> {
    const res = await fetch(`/api/price-lines/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /price-lines/${id} ${res.status}`);
}

/** 선이 하나라도 있는 (종목,날짜) 전부 — 월 그룹은 클라. 날짜 내림차순. */
export async function fetchPriceLinedStocks(): Promise<PriceLinedStock[]> {
    const res = await fetch("/api/price-lines/stocks");
    if (!res.ok) throw new Error(`GET /price-lines/stocks ${res.status}`);
    return res.json() as Promise<PriceLinedStock[]>;
}
