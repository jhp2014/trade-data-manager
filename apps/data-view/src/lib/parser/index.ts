/**
 * 차트 타겟 파서 진입점.
 *
 * 등록된 파서를 순서대로 시도해서 첫 번째로 성공한 결과를 반환한다.
 *
 * 파서 우선순위:
 *   1) tokenized — 위치 무관, 다양한 구분자로 분리
 *
 * tokenized 파서를 먼저 시도하는 이유: 더 유연한 파싱을 제공함
 * 선점하도록 한다 (방어적 순서).
 *
 * 새 파서 추가 시 CHART_TARGET_PARSERS 배열에 추가하면 끝 (확장 가능).
 */

import type { ChartTargetParser, ParseChartTargetResult } from "./types";
import { tokenizedParser } from "./kinds/tokenized";

export const CHART_TARGET_PARSERS: readonly ChartTargetParser[] = [
    tokenizedParser,
];

/**
 * "-pl <가격1> | <가격2>" 플래그를 추출한다.
 * 예: "009540,2026-05-11 -pl 51000 | 41000"
 *   → { mainText: "009540,2026-05-11", priceLines: [51000, 41000] }
 */
function extractPlFlag(raw: string): { mainText: string; priceLines: number[] } {
    const idx = raw.search(/\s+-pl\s+/i);
    if (idx === -1) return { mainText: raw, priceLines: [] };
    const mainText = raw.slice(0, idx).trim();
    const plPart = raw.slice(idx).replace(/^\s+-pl\s+/i, "").trim();
    const priceLines = plPart
        .split("|")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return { mainText, priceLines };
}

export function parseChartTarget(raw: string): ParseChartTargetResult {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, reason: "empty" };

    const { mainText, priceLines } = extractPlFlag(trimmed);
    if (!mainText) return { ok: false, reason: "empty" };

    let matchedAnyParser = false;
    for (const parser of CHART_TARGET_PARSERS) {
        if (!parser.canParse(mainText)) continue;
        matchedAnyParser = true;
        const result = parser.parse(mainText);
        if (result) {
            return {
                ok: true,
                target: {
                    ...result,
                    priceLines: priceLines.length > 0 ? priceLines : undefined,
                },
                usedParser: parser,
            };
        }
        // canParse 는 통과했지만 실제 추출 실패 → 다음 파서 시도
    }

    if (!matchedAnyParser) return { ok: false, reason: "no-match" };
    return { ok: false, reason: "no-stock-code" };
}

export type {
    ParsedChartTarget,
    ChartTargetParser,
    ChartTargetParserKind,
    ParseChartTargetResult,
    ParseChartTargetFailureReason,
} from "./types";
