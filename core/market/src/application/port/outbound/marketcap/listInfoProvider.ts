import type { ListInfoEvent } from "../../../../domain/index.js";

/**
 * 예탁원 상장정보일정 제공 포트(ISP — 발행주식수 변동 이벤트만).
 * 구현은 infra 어댑터(KIS getListInfo). 날짜는 YYYY-MM-DD, 반환은 시간 오름차순.
 * 빈 행(고정버퍼 패딩)은 어댑터가 제거한다.
 */
export interface ListInfoProvider {
    getEvents(stockCode: string, fromDate: string, toDate: string): Promise<ListInfoEvent[]>;
}
