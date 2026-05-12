/**
 * 토큰 기반 통합 파서.
 *
 * 입력을 구분자(_, 쉼표, 탭, 공백)로 분리한 뒤
 * 토큰들 중에서 첫 stockCode와 첫 date를 찾아 반환한다.
 *
 * 지원 입력 예시:
 *   - 이미지 파일명:  "2026.04.20_007660_삼화전자_KRX"
 *   - CSV 한 줄:     "079550,에이비프로바이오,2026-04-20,09:21:00,..."
 *   - TSV 한 줄:     "2026-05-11\t'009540\tHD현대\t487500"
 *   - 공백 구분:     "009540 2026-05-11"
 */

import type { ChartTargetParser, ParsedChartTarget } from "../types";
import { isDateLike, isStockCode, normalizeDate } from "../utils";

// _ , \t 그리고 일반 공백을 모두 구분자로 취급
const SEPARATOR_RE = /[_,\t ]+/;

export const tokenizedParser: ChartTargetParser = {
    kind: "tokenized",
    label: "토큰 추출 (파일명/CSV/공백)",
    canParse: (raw) => SEPARATOR_RE.test(raw),
    parse: (raw): ParsedChartTarget | null => {
        const tokens = raw
            .trim()
            .split(SEPARATOR_RE)
            .map((t) => t.trim().replace(/^'/, ""))
            .filter(Boolean);

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
