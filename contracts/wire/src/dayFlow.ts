// /day-flow 계약 — lab 전용(생산 apps/lab-api · 소비 apps/lab). "응답 꼴은 api 와 동일" 이식 규칙의
// 유일한 예외: /day-replay 를 재현하지 않는다 — api 호환 유지 비용이 스냅샷 기계(파일 베이크·완료판정·
// 테마 조인) 전체라서(결정 로그 「trade-lab 편입」). 뜻은 ReplayStock(dayReplay.ts)을 승계하되,
// name·market 은 없다(lab 이 이미 든 /stocks/master 클라 조인) · themes 도 없다(구글 시트 의존 소멸).
import type { ByMarket } from "@trade-data-manager/market";

/** 한 종목의 분당 파생 시계열 — % 는 전부 통합(UN) 기준가 대비 한 벌(소수 2자리), times 는 unix 초. */
export interface DayFlowStock {
    code: string;
    times: number[]; // unix seconds(UTC)
    rate: number[]; // 분당 종가 등락률 %
    high: number[]; // 그 분까지의 고가 %(누적 최대)
    low: number[]; // 그 분까지의 저가 %(누적 최소)
    open: number; // 당일 시가 %(스칼라)
    cumAmount: number[]; // 그 분까지의 누적 거래대금(원)
    basePrice: ByMarket<number | null>; // 등락률 기준가(당일 원주가 스케일, 이벤트 보정) — KRX 재기저(일차변환)용
    marketCap: string | null; // 원, 무손실 string. **직전 거래일** 종가 × 상장주식수(아침 기준)
}

/** GET /day-flow?date= 응답 봉투 — 그날 universe(분봉 있는 종목) 전부. */
export interface DayFlow {
    date: string;
    stocks: DayFlowStock[];
}
