// 도메인 헤드라인 ↔ DB 행 매퍼. 한 헤드라인은 태깅 종목 수만큼 (종목,srno) 행으로 펼쳐진다(평탄화).
// 태그 0개면 stock_code="" 한 행(매크로 피드). srno: string↔BigInt 무손실.
import type { NewsHeadline } from "@trade-data-manager/market";
import type { StockNewsRow, StockNewsInsert } from "../schema/market.js";

export function newsHeadlineToRows(h: NewsHeadline): StockNewsInsert[] {
    // 종목 중복 태그 방어(같은 코드 두 칸) — 같은 PK 행이 한 배치에 두 번 들어가지 않게.
    const codes = h.stockCodes.length > 0 ? [...new Set(h.stockCodes)] : [""];
    return codes.map((stockCode) => ({
        publishedDate: h.date,
        stockCode,
        srno: BigInt(h.srno),
        publishedTime: h.time,
        title: h.title,
        sourceCode: h.sourceCode,
        sourceName: h.sourceName,
        categoryCode: h.categoryCode,
    }));
}

/** 행 → 헤드라인. 한 종목으로 조회한 결과라 stockCodes 는 그 종목(""면 빈 배열)만 채운다. */
export function rowToNewsHeadline(r: StockNewsRow): NewsHeadline {
    return {
        srno: r.srno.toString(),
        date: r.publishedDate,
        time: r.publishedTime,
        title: r.title,
        sourceCode: r.sourceCode,
        sourceName: r.sourceName,
        categoryCode: r.categoryCode,
        stockCodes: r.stockCode ? [r.stockCode] : [],
    };
}
