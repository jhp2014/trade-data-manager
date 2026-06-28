// infra/broker/minute/routingMinuteProvider — (종목,날) 단위로 키움/KIS 를 분배하는 MinuteCandleProvider.
// 두 벤더 풀 합산으로 유량 ~2배. 소비자는 단일 provider 로만 본다.
//
// 라우팅 정책(폴백 없음 — 정확성은 임계값이 보장):
//  - 요청 날짜가 "작년 같은 달"보다 최근(KIS 보유 윈도 안쪽) → 키움/KIS 라운드로빈.
//  - "작년 같은 달" 이하(KIS 롤오프 구간) → 키움 단독. KIS 헛콜·빈결과 데이터유실 방지.
//
// 왜 월(月) 경계인가: **키움은 월 단위로 분봉을 삭제**(실측+사용자 관찰) — 작년 같은 달 1일부터 보관하다
// 달이 바뀌면 그 달을 통째로 떨군다(롤링 N일 아님). 오늘 6/28 기준 키움 최古 = 2025-06-02(6월 첫 거래일).
// KIS 는 ~12개월 롤링(일 단위, ~D-375). "작년 같은 달"은 KIS 가 일부만 가져 빈결과 위험 → 통째로 키움행.
// 그보다 더 옛달은 키움도 이미 삭제 → 양쪽 다 빈배열이 정답(REST 한계, 선수집·DB적재 필요).
//
// 임계값은 now 의 연-월에서 자동 도출(고정 날짜 아님 → 달이 바뀌면 따라 이동). thresholdMonths 설정노브.
import type { MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";

export interface RoutingOptions {
    /** 요청월이 (현재월 - 이 개월수) 이하면 키움 단독. 기본 12(작년 같은 달). */
    thresholdMonths?: number;
    /** 오늘 기준점(테스트 주입용). 기본 new Date(). */
    now?: () => Date;
}

const DEFAULT_THRESHOLD_MONTHS = 12;

/** 연·월(0-based)을 단일 정수로 — 월 차 계산용. */
function monthIndex(year: number, month0: number): number {
    return year * 12 + month0;
}

/** (종목,날) 결정적 해시 — 같은 입력은 항상 같은 벤더로(재시도·캐시 일관). */
function hash(stockCode: string, date: string): number {
    let h = 0;
    const s = `${stockCode}${date}`;
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export class RoutingMinuteProvider implements MinuteCandleProvider {
    private readonly thresholdMonths: number;
    private readonly now: () => Date;

    constructor(
        private readonly kiwoom: MinuteCandleProvider,
        private readonly kis: MinuteCandleProvider,
        options: RoutingOptions = {},
    ) {
        this.thresholdMonths = options.thresholdMonths ?? DEFAULT_THRESHOLD_MONTHS;
        this.now = options.now ?? (() => new Date());
    }

    /** 이 (종목,날)을 어느 벤더로 보낼지 결정. 노출 = 단위테스트·관측용. */
    route(stockCode: string, date: string): "kiwoom" | "kis" {
        const today = this.now();
        const [y, m] = date.split("-").map(Number);
        const monthsBack = monthIndex(today.getFullYear(), today.getMonth()) - monthIndex(y, m - 1);
        if (monthsBack >= this.thresholdMonths) return "kiwoom"; // 작년 같은 달 이하 → 키움 단독
        return hash(stockCode, date) % 2 === 0 ? "kiwoom" : "kis"; // 윈도 안 → 라운드로빈
    }

    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        const provider = this.route(stockCode, date) === "kiwoom" ? this.kiwoom : this.kis;
        return provider.getMinuteCandles(stockCode, date);
    }
}
