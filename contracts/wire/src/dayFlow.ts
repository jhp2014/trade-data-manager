// /day-flow 계약 — lab 전용(생산 apps/lab-api · 소비 apps/lab). "응답 꼴은 api 와 동일" 이식 규칙의
// 유일한 예외: /day-replay 를 재현하지 않는다 — api 호환 유지 비용이 스냅샷 기계 전체라서.
// 원칙(결정 로그 「trade-lab 편입」): **서버 = 분당 사실 + 기준가, 표현(%·누적·기준 전환)은 전부 클라.**
// 그래서 %·누적 시계열이 아니라 **분당 원값**을 싣는다 — 가격과 %는 정보 동치인데 원값 쪽이 분당 고저가
// 공짜로 생기고 반올림 손실이 없다. KRX/UN 토글 = 클라의 base 선택(일차변환이 아니라 원값이라 그냥 나눗셈).
// basePrice 만은 서버 몫 — 감자·액분 이벤트 보정(원주가·수정주가 대조)은 일봉 2벌을 든 서버만 계산할 수 있다.
// name·market 은 없다(lab 이 이미 든 /stocks 클라 조인) · themes 도 없다(소속은 판단 이력이 입힌다).
import type { ByMarket } from "@trade-data-manager/market";

/** 한 종목의 분당 사실 — dense 타임라인(무거래 분은 flat-fill, amount 0), times 는 unix 초. 가격·대금은 원. */
export interface DayFlowStock {
    code: string;
    times: number[]; // unix seconds(UTC)
    close: number[]; // 그 분의 종가(원)
    high: number[]; // 그 분의 고가(원) — 누적 아님(누적 고저는 클라 한 패스)
    low: number[]; // 그 분의 저가(원)
    amount: number[]; // 그 분의 거래대금(원) — 누적 아님(클라가 cumsum)
    open: number; // 당일 시가(원) 스칼라
    basePrice: ByMarket<number | null>; // 등락률 기준가(당일 원주가 스케일, 이벤트 보정) — KRX·UN 둘 다
    marketCap: string | null; // 원, 무손실 string. **직전 거래일** 종가 × 상장주식수(아침 기준)
}

/** GET /day-flow?date= 응답 봉투 — 그날 universe(분봉 있는 종목) 전부. */
export interface DayFlow {
    date: string;
    stocks: DayFlowStock[];
}
