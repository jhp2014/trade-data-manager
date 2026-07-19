// /day-replay 계약 — 복기보드용 per-minute 파생 시계열 + 메타(self-contained).
// per-minute 시계열은 core/market MinuteDerived 중 클라가 쓰는 부분집합.
//  · minuteOpen/minuteHigh — 복기 hover 버킷 카운팅 정책(꼬리없는 음봉 제외) 판정에 필요.
//  · trailingHighs — 복기 필터 "매물대 내부" 술어에 필요.
// 클라가 서버와 동일한 countAmountBuckets/evalBoardFilter 를 시점 t 까지 돌리려면 이 원자재가 있어야 한다.
import type { MinuteDerived as CoreMinuteDerived } from "@trade-data-manager/market";

/**
 * day-replay 가 실어보내는 per-minute 시계열 부분집합. % 시계열은 기준가 UN(원주가 스케일, 이벤트 보정) 대비 한 벌 —
 * KRX 기준가 토글은 클라가 basePrice 두 스칼라로 일차변환(rebasePct). trailingHighs 는 수정주가 KRX/UN 두 벌.
 * (baseFactor 는 서버 트립와이어 전용 — 와이어 미노출.)
 */
export type MinuteDerived = Pick<
    CoreMinuteDerived,
    "code" | "times" | "rate" | "high" | "low" | "open" | "cumAmount" | "minuteOpen" | "minuteHigh" | "trailingHighs" | "basePrice"
>;

/** 복기보드 종목 — per-minute + 메타(서버 stitch). 이 하나로 랭킹+카드 다 만든다. */
export interface ReplayStock extends MinuteDerived {
    name: string | null;
    market: string | null;
    marketCap: string | null; // 원, 무손실 string
    themes: string[]; // 테마명
}

/** /day-replay 응답 봉투. (api 는 ReplayBoard, 클라는 DayReplay 로 부른다 — 같은 모양) */
export interface ReplayBoard {
    date: string;
    stocks: ReplayStock[];
}
export type DayReplay = ReplayBoard;
