// /day-replay 계약 — 복기보드용 per-minute 파생 시계열 + 메타(self-contained).
// per-minute 시계열은 core/market MinuteDerived 중 클라가 쓰는 부분집합(코어엔 minuteOpen/High·trailingHighs 도 있으나 와이어엔 불필요).
import type { MinuteDerived as CoreMinuteDerived } from "@trade-data-manager/market";

/** day-replay 가 실어보내는 per-minute 시계열 부분집합. 모든 %는 원주가 직전 거래일 종가 대비(서버 계산). */
export type MinuteDerived = Pick<CoreMinuteDerived, "code" | "times" | "rate" | "high" | "low" | "open" | "cumAmount">;

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
