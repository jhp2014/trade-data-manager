// 정규화 모델 — ChartBundle raw → **원점 기준 %** 시계열(순수). 정규화 패널 두 개(일봉·타점)의 계산층.
//
// 원점 규칙(사용자 확정):
//   · 일봉: **D−1 종가**(시장 토글과 함께 갈린다 — 봉과 원점이 같은 시장). D−1 결측(상장일 등)이면
//     당일 첫 시가 폴백 — basePrice 의 폴백 규칙과 같은 규칙(없는 걸 지어내지 않되, 화면은 세운다).
//   · 분봉: **타점 시각의 UN 종가**. 그 분봉이 미수집이면 이 항목은 결손(null) — 빼지도 지어내지도 않는다.
//
// x 좌표는 해상도가 정한다(골격 tIndex 와 같은 정신, 단위만 남기고 개념은 승계):
//   · 일봉: D 로부터의 **거래일 오프셋**(D=0, 과거가 음수) — 항목마다 달력이 달라도 "직전"이 정렬된다.
//   · 분봉: **벽시계 분**(그 날 안에서) — 장 시간대가 곧 비교 축이라 타점끼리 시프트하지 않는다.
import type { ChartBundle } from "../../api/chart.js";

export type NormMarket = "krx" | "un";

/** 정규화된 봉 하나 — 값은 전부 원점 대비 %. t 의 단위는 위 주석(일봉=거래일 오프셋 / 분봉=벽시계 분). */
export interface NormBar {
    t: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface NormSeries {
    bars: NormBar[];
    /** 원점의 원시 가격(일봉=수정주가 / 분봉=원주가 스케일) — 커서 % 변환(toBasePct)의 재료. */
    origin: number;
    /** 일봉 전용 — D−1 결측이라 당일 첫 시가로 폴백했나(화면이 결을 구분해 말할 수 있게). */
    originFallback: boolean;
}

const pctOf = (raw: string, origin: number): number => (Number(raw) / origin - 1) * 100;

/**
 * 일봉 정규화 — daily(오름차순, D 가 마지막)를 D−1 종가 = 0% 로 접는다.
 * 반환 null = 재료 부족(봉 0개 또는 원점 ≤ 0) — 결손은 결손으로(축 규칙 3 승계).
 */
export function dailyNorm(bundle: ChartBundle, market: NormMarket): NormSeries | null {
    const daily = bundle.daily;
    if (daily.length === 0) return null;
    const last = daily.length - 1;
    const originFallback = daily.length < 2;
    const origin = originFallback ? Number(daily[last][market].open) : Number(daily[last - 1][market].close);
    if (!(origin > 0)) return null;
    const bars: NormBar[] = daily.map((c, i) => {
        const bar = c[market];
        return { t: i - last, open: pctOf(bar.open, origin), high: pctOf(bar.high, origin), low: pctOf(bar.low, origin), close: pctOf(bar.close, origin) };
    });
    return { bars, origin, originFallback };
}

/** "HH:MM:SS" → 벽시계 분. 형태 비교는 차이만 쓰므로 원점(자정)은 무관하다(옛 골격 해소기와 같은 규칙). */
export const minutesOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/**
 * 분봉 정규화 — 그 날 UN 분봉 전체를 타점 시각의 UN 종가 = 0% 로 접는다.
 * 하루 **전체**다(타점 이후 포함) — 원점 표식이 과거/미래를 가르므로 절단하지 않는다(사용자 확정).
 * 반환 null = 타점 시각 분봉 미수집 또는 분봉 0개.
 */
export function minuteNorm(bundle: ChartBundle, time: string): NormSeries | null {
    const minutes = bundle.minutes;
    if (minutes.length === 0) return null;
    const at = minutes.find((m) => m.time === time);
    if (!at) return null;
    const origin = Number(at.un.close);
    if (!(origin > 0)) return null;
    const bars: NormBar[] = minutes.map((m) => ({
        t: minutesOf(m.time),
        open: pctOf(m.un.open, origin),
        high: pctOf(m.un.high, origin),
        low: pctOf(m.un.low, origin),
        close: pctOf(m.un.close, origin),
    }));
    return { bars, origin, originFallback: false };
}

/**
 * 정규화 % → **전일 종가 기준 %** 변환 — 커서 읽기값 전용(그림은 언제나 정규화 공간, 사용자 확정).
 * base 는 ChartBundle.basePrice 의 시장별 값(원주가 스케일 — minuteNorm 의 origin 과 같은 스케일).
 */
export function toBasePct(normPct: number, origin: number, base: number | null): number | null {
    if (base === null || !(base > 0)) return null;
    return ((origin * (1 + normPct / 100)) / base - 1) * 100;
}
