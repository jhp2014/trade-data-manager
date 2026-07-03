import type { PriceLine } from "#domain";

/**
 * 가격선 저장 포트(outbound). (종목,날짜) 당 N개의 수평선.
 * 가격이 아니라 **앵커(캔들 좌표)**를 저장한다 — 값은 표시 시점에 앵커 캔들에서 읽으므로 in-place 수정이 없다
 * (드래그 폐기). 편집모델 = add/remove 둘뿐. 자세한 설계는 domain/review/priceLine.ts.
 */
export interface PriceLineRepository {
    /** 선들을 추가하고, DB 가 부여한 id 를 채워 그대로 돌려준다(그린 순서 보존). */
    add(lines: PriceLine[]): Promise<PriceLine[]>;

    /** 이 차트(종목,날짜)의 모든 선(그린 순서 = id 오름차순). */
    listByChart(stockCode: string, date: string): Promise<PriceLine[]>;

    /** 선 1개 삭제(id 로 지목). */
    remove(id: string): Promise<void>;
}
