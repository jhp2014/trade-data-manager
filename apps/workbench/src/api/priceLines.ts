// 차트 가격선 주석 CRUD 클라이언트. 우클릭으로 긋는 수평선(자동 저장).
export interface PriceLine {
    id?: string; // surrogate(bigint) — 저장 후 존재
    stockCode: string;
    date: string; // YYYY-MM-DD
    price: string; // 원(무손실 string)
    memo?: string; // 선 종류: "D"=일봉 고점 / "M"=분봉
}

export async function fetchPriceLines(code: string, date: string): Promise<PriceLine[]> {
    const res = await fetch(`/api/price-lines?${new URLSearchParams({ code, date })}`);
    if (!res.ok) throw new Error(`GET /price-lines ${res.status}`);
    return res.json() as Promise<PriceLine[]>;
}

export async function addPriceLine(line: { stockCode: string; date: string; price: string; memo?: string }): Promise<PriceLine> {
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
