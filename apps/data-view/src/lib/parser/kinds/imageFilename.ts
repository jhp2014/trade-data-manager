/**
 * 이미지 파일명 형식 파서.
 *
 * 입력 예: "2026.04.20_007660_이수페타시스_KRX"
 *   → tokens = [날짜, 종목코드, 종목명, 거래소...]
 *
 * 위치는 고정 (첫 토큰=날짜, 둘째 토큰=종목코드).
 */

import type { ChartTargetParser, ParsedChartTarget } from "../types";
import { isDateLike, isStockCode, normalizeDate } from "../utils";

export const imageFilenameParser: ChartTargetParser = {
    kind: "imageFilename",
    label: "이미지 파일명",
    canParse: (raw) => {
        const tokens = raw.trim().split("_");
        if (tokens.length < 2) return false;
        return isDateLike(tokens[0]) && isStockCode(tokens[1]);
    },
    parse: (raw): ParsedChartTarget | null => {
        const tokens = raw.trim().split("_");
        if (tokens.length < 2) return null;
        const tradeDate = normalizeDate(tokens[0]);
        if (!tradeDate) return null;
        if (!isStockCode(tokens[1])) return null;
        return { stockCode: tokens[1], tradeDate };
    },
};
