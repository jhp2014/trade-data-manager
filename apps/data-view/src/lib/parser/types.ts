/**
 * 차트 타겟 파서 공용 타입.
 *
 * Stock Chart 모드에서 사용자가 입력한 다양한 형식의 텍스트(이미지 파일명,
 * CSV 한 줄 등)에서 (stockCode, tradeDate) 를 추출하기 위한 파서 인터페이스.
 *
 * 파서 레지스트리 패턴 — FilterKind / ConditionKind 컨벤션과 동일.
 */

/** 파싱 결과: 정규화된 종목코드 + 날짜 + 가격라인(선택) */
export interface ParsedChartTarget {
    /** 6자리 숫자 문자열 */
    stockCode: string;
    /** "YYYY-MM-DD" 로 정규화된 날짜 */
    tradeDate: string;
    /** -pl 플래그로 전달된 가격 목록 */
    priceLines?: number[];
}

/** 파서 식별자 */
export type ChartTargetParserKind = "imageFilename" | "csvLine";

/** 파서 인터페이스 */
export interface ChartTargetParser {
    kind: ChartTargetParserKind;
    /** UI 라벨 (파싱 미리보기에서 사용자에게 표시) */
    label: string;
    /** 빠른 판별 — 이 파서가 처리할 수 있는 형식인가? */
    canParse: (raw: string) => boolean;
    /** 실제 파싱. 실패 시 null. */
    parse: (raw: string) => ParsedChartTarget | null;
}

/** 통합 파싱 결과 (파서 내부 전용 — 서버 액션 경계의 Result<T> 와는 별개) */
export type ParseChartTargetResult =
    | { ok: true; target: ParsedChartTarget; usedParser: ChartTargetParser }
    | { ok: false; reason: ParseChartTargetFailureReason };

export type ParseChartTargetFailureReason =
    | "empty"          // 빈 입력
    | "no-match"       // 어떤 파서도 canParse=true 가 아님
    | "no-stock-code"; // 파서는 매칭됐으나 종목코드/날짜 추출 실패
