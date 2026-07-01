import type { PriceLine, ReviewPoint } from "#domain";

/**
 * 한 종목·한 거래일의 차트 주석 묶음 — 사람 편집(curation).
 * 캔들(collect)과 컨텍스트가 달라 ChartReader 와 분리한다: 주석만 독립 리프레시(선 드래그·타점 편집 후 2년치 캔들 재조회 불필요).
 */
export interface ChartAnnotation {
    stockCode: string;
    priceLines: PriceLine[];
    reviewPoints: ReviewPoint[];
}

/**
 * 차트 주석 리더(읽기 Query) — (종목, 날짜)의 수평 가격선 + 복기 타점.
 * ChartReader 와 같은 그레인((code,date))이라 상위 app 에서 zip 해 ChartView 로 조립한다.
 */
export interface ChartAnnotationReader {
    annotationsByCode(stockCode: string, date: string): Promise<ChartAnnotation>;
    /** 여러 종목 벌크 — 결과는 입력 코드 순서. */
    annotationsByCodes(stockCodes: string[], date: string): Promise<ChartAnnotation[]>;
}
