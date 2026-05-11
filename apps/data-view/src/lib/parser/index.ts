/**
 * 차트 타겟 파서 진입점.
 *
 * 등록된 파서를 순서대로 시도해서 첫 번째로 성공한 결과를 반환한다.
 *
 * 파서 우선순위:
 *   1) imageFilename — 위치 고정형 (날짜_종목코드_...)
 *   2) csvLine       — 위치 무관, CSV 한 줄
 *
 * imageFilename 을 먼저 시도하는 이유: csvLine.canParse 가 "," 포함 여부만
 * 검사하므로, 이미지 파일명에 우연히 ","가 섞여 있어도 imageFilename 이
 * 선점하도록 한다 (방어적 순서).
 *
 * 새 파서 추가 시 CHART_TARGET_PARSERS 배열에 추가하면 끝 (확장 가능).
 */

import { imageFilenameParser } from "./kinds/imageFilename";
import { csvLineParser } from "./kinds/csvLine";
import type { ChartTargetParser, ParseChartTargetResult } from "./types";

export const CHART_TARGET_PARSERS: readonly ChartTargetParser[] = [
    imageFilenameParser,
    csvLineParser,
];

export function parseChartTarget(raw: string): ParseChartTargetResult {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, reason: "empty" };

    let matchedAnyParser = false;
    for (const parser of CHART_TARGET_PARSERS) {
        if (!parser.canParse(trimmed)) continue;
        matchedAnyParser = true;
        const result = parser.parse(trimmed);
        if (result) {
            return { ok: true, target: result, usedParser: parser };
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
