// 차트 가격선 주석 CRUD 클라이언트. 우클릭으로 긋는 수평선(자동 저장).
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 표시 시점에 로드된 캔들에서 값을 읽어 RenderLine 으로 해소.
// 이점: 수정계수가 바뀌어도 선이 캔들을 따라 자동 이동(재수정 불필요).
export type PriceLineField = "high" | "low" | "open" | "close";

/** 저장/조회되는 가격선(앵커 기반, wire). */
export interface PriceLine {
    id?: string; // surrogate(bigint) — 저장 후 존재
    stockCode: string;
    date: string; // YYYY-MM-DD — 이 선이 속한 차트(로드 단위)
    anchorDate: string; // YYYY-MM-DD — 값을 읽어올 앵커 캔들의 거래일
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커, 없으면 일봉 앵커
    field: PriceLineField; // 앵커 캔들에서 읽을 값(기본 high)
    memo?: string;
}

/** 차트 렌더용 — 앵커를 로드된 캔들에서 해소한 결과. 차트 컴포넌트는 이것만 안다. */
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

export interface AddPriceLineInput {
    stockCode: string;
    date: string;
    anchorDate: string;
    anchorTime?: string;
    field?: PriceLineField;
    memo?: string;
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

/** 작업셋 항목 — 선이 있는 (종목,날짜) 1건. name/lineCount 는 서버 집계 파생. */
export interface PriceLinedStock {
    stockCode: string;
    date: string; // YYYY-MM-DD
    name: string | null;
    lineCount: number;
}

/** 선이 하나라도 있는 (종목,날짜) 전부 — 월 그룹은 클라. 날짜 내림차순. */
export async function fetchPriceLinedStocks(): Promise<PriceLinedStock[]> {
    const res = await fetch("/api/price-lines/stocks");
    if (!res.ok) throw new Error(`GET /price-lines/stocks ${res.status}`);
    return res.json() as Promise<PriceLinedStock[]>;
}
