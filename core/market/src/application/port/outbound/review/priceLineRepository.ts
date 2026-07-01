import type { PriceLine } from "#domain";

/**
 * 가격선 저장 포트(outbound). (종목,날짜) 당 N개의 수평선.
 * price 가 draggable(가변)이라 in-place update 를 지원한다(그래서 surrogate id 를 가진다).
 * 자세한 설계는 domain/review/priceLine.ts.
 */
export interface PriceLineRepository {
    /** 선들을 추가하고, DB 가 부여한 id 를 채워 그대로 돌려준다(그린 순서 보존). */
    add(lines: PriceLine[]): Promise<PriceLine[]>;

    /** 이 차트(종목,날짜)의 모든 선(그린 순서 = id 오름차순). */
    listByChart(stockCode: string, date: string): Promise<PriceLine[]>;

    /** 선 1개 수정 — price 드래그/메모 편집. 주어진 필드만 갱신(id 로 지목). */
    update(id: string, patch: { price?: string; memo?: string | null }): Promise<void>;

    /** 선 1개 삭제(id 로 지목). */
    remove(id: string): Promise<void>;
}
