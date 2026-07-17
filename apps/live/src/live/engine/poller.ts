// 시세·거래대금 소스: ka10095 관심종목정보(_AL 통합). 유니버스 일괄 조회, 100/콜 배치.
// 정본: market-eye/src/engine/quotePoller.ts. REST 는 tdm KiwoomRest.getMultiQuote(주입).
import { toAlCode, toCanonical } from "./codes.js";
import type { QuoteSource } from "./ports.js";
import type { Quote } from "./types.js";

const BATCH = 100;

/** '-352500' | '+1,234' | '' → number(부호 유지). 빈값/비수치 0. */
function num(v: unknown): number {
    if (v == null || v === "") return 0;
    const n = Number(String(v).replace(/[+,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/** 유니버스 종목들을 통합시세로 일괄 조회. now 는 수신 타임스탬프(호출자가 주입). */
export async function pollQuotes(rest: QuoteSource, codes: string[], now: number): Promise<Quote[]> {
    const uniq = [...new Set(codes.map(toCanonical))].filter(Boolean);
    const out: Quote[] = [];
    for (let i = 0; i < uniq.length; i += BATCH) {
        const batch = uniq.slice(i, i + BATCH).map(toAlCode);
        const { data } = await rest.getMultiQuote(batch);
        const arr = data.atn_stk_infr ?? [];
        for (const r of arr) {
            out.push({
                code: toCanonical(r.stk_cd),
                name: (r.stk_nm ?? "").trim(),
                price: Math.abs(num(r.cur_prc)), // 현재가 양수, 방향은 changeRate
                changeRate: num(r.flu_rt),
                volume: num(r.trde_qty),
                base: Math.abs(num(r.base_pric)),
                open: Math.abs(num(r.open_pric)),
                high: Math.abs(num(r.high_pric)),
                low: Math.abs(num(r.low_pric)),
                marketCap: num(r.mac),
                tradeValue: num(r.trde_prica),
                ts: now,
            });
        }
    }
    return out;
}
