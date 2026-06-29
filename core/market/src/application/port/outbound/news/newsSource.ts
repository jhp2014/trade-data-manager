import type { NewsHeadline } from "../../../../domain/index.js";

/**
 * 뉴스 소스 포트(outbound) — 시각 앵커 이전의 헤드라인 한 페이지를 내림차순(최신→과거)으로 준다.
 * KIS 시황 피드는 호출당 ~40건 고정·앵커 이전·tr_cont 미지원이라, 페이지네이션은
 * "받은 가장 오래된 (date,time) 을 다음 앵커로" 되감는 방식이다(연속 워크). 자정도 넘어 전날로 이어진다.
 * anchor 생략 = 현재(최신) 기준. date=YYYY-MM-DD, time=HH:MM:SS (도메인 형식; compact 변환은 어댑터 몫).
 */
export interface NewsSource {
    fetchBefore(anchor?: { date: string; time: string }): Promise<NewsHeadline[]>;
}
