// ChartAnnotationService — (종목, 날짜) → 수평 가격선 + 복기 타점. 읽기 Query.
// 캔들(ChartReadService)과 분리된 curation 컨텍스트 — 주석만 독립 조회/리프레시.
import type { PriceLineRepository, ReviewPointRepository } from "#port/outbound";
import type { ChartAnnotation, ChartAnnotationReader } from "#port/inbound";
import { mapWithConcurrency } from "../../concurrency.js";

const ANNOTATION_FETCH_CONCURRENCY = 8;

export interface ChartAnnotationDeps {
    priceLine: PriceLineRepository;
    reviewPoint: ReviewPointRepository;
}

export class ChartAnnotationService implements ChartAnnotationReader {
    constructor(private readonly deps: ChartAnnotationDeps) {}

    async annotationsByCode(stockCode: string, date: string): Promise<ChartAnnotation> {
        const { priceLine, reviewPoint } = this.deps;
        const [priceLines, reviewPoints] = await Promise.all([
            priceLine.listByChart(stockCode, date),
            reviewPoint.listByChart(stockCode, date),
        ]);
        return { stockCode, priceLines, reviewPoints };
    }

    async annotationsByCodes(stockCodes: string[], date: string): Promise<ChartAnnotation[]> {
        return mapWithConcurrency(stockCodes, ANNOTATION_FETCH_CONCURRENCY, (code) =>
            this.annotationsByCode(code, date),
        );
    }
}
