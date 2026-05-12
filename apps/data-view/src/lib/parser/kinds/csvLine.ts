/**
 * CSV/TSV 한 줄 형식 파서.
 *
 * 입력 예 (콤마): "079550,비에이치아이,2026-04-20,09:21:00,일번|이번,대장주,ㅎㅎㅎ,X,300000|460000"
 * 입력 예 (탭):   "2026-05-11\t'009540\tHD한국조선해양\t487500"
 *
 * 구분자가 달라도 위치 무관하게:
 *   - 첫 번째로 ^\d{6}$ 에 매칭되는 토큰 → stockCode
 *   - 첫 번째로 날짜 패턴에 매칭되는 토큰 → tradeDate
 * 둘 중 하나라도 못 찾으면 null.
 */

import type { ChartTargetParser, ParsedChartTarget } from "../types";
import { isDateLike, isStockCode, normalizeDate } from "../utils";

export const csvLineParser: ChartTargetParser = {
    kind: "csvLine",
    label: "CSV/TSV 한 줄",
    canParse: (raw) => raw.includes(",") || raw.includes("\t"),
    parse: (raw): ParsedChartTarget | null => {
        const sep = raw.includes(",") ? "," : "\t";
        const tokens = raw
            .trim()
            .split(sep)
            .map((t) => t.trim().replace(/^'/, ""));
        let stockCode: string | null = null;
        let tradeDate: string | null = null;
        for (const token of tokens) {
            if (!stockCode && isStockCode(token)) {
                stockCode = token;
                continue;
            }
            if (!tradeDate && isDateLike(token)) {
                const norm = normalizeDate(token);
                if (norm) tradeDate = norm;
            }
            if (stockCode && tradeDate) break;
        }
        if (!stockCode || !tradeDate) return null;
        return { stockCode, tradeDate };
    },
};
