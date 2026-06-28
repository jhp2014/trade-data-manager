// infra/broker/daily/merge — 한 벤더의 KRX·UN 두 시장 일봉을 날짜로 머지해 DailyCandle[] 로.
// 벤더 raw → DailyBar 정규화(키움 "+/-" prefix 제거·거래대금 원화 환산)는 어댑터 책임. 여기선 정규화된 바만 받는다.
import type { DailyBar, DailyCandle } from "@trade-data-manager/market";

/** 한 시장의 날짜별 정규화 일봉 한 건. date = "YYYY-MM-DD". */
export interface DateBar {
    date: string;
    bar: DailyBar;
}

/**
 * KRX·UN 두 시장 바를 날짜 기준으로 머지.
 * UN(통합)이 날짜 집합의 정본 — UN ⊇ KRX 이고, 일봉은 NXT 미지원 종목도 UN 요청 시 KRX 일봉을 내려주므로
 * 정상이면 모든 UN 날짜에 KRX 바가 존재(실측). KRX 가 없는 날짜는 데이터 이상 → 지어내지 않고 건너뛴다.
 * 반환은 날짜 오름차순.
 */
export function mergeDailyMarkets(
    stockCode: string,
    krx: DateBar[],
    un: DateBar[],
): DailyCandle[] {
    const krxByDate = new Map<string, DailyBar>();
    for (const { date, bar } of krx) krxByDate.set(date, bar);

    const unByDate = new Map<string, DailyBar>();
    for (const { date, bar } of un) unByDate.set(date, bar);

    const out: DailyCandle[] = [];
    for (const date of [...unByDate.keys()].sort()) {
        const krxBar = krxByDate.get(date);
        if (!krxBar) continue; // UN⊇KRX·양시장 항상 제공 → 정상이면 미발생
        out.push({ stockCode, date, krx: krxBar, un: unByDate.get(date)! });
    }
    return out;
}
