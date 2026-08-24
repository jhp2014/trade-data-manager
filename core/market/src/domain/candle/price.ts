// core/market/domain/price — 순수 가격 계산(외부 import 0). 버그 핵심부, DB 없이 단위테스트.
//
// 전제: 입력은 이미 정규화된 숫자 문자열(키움의 "+"/"-" 시각표시 prefix 제거 완료).
// 그 정규화는 벤더 특화라 어댑터(infra/broker)의 매핑 책임이며 도메인은 깨끗한 값만 받는다.
// 가격은 음수가 아니고, 등락값만 음수가 될 수 있다. 정밀도 유지를 위해 BigInt 사용.

import type { DailyCandle, ByMarket } from "./model.js";

/**
 * 전일 대비 변동값 (현재가 - 전일종가). 전일종가가 없으면 null.
 */
export function computeChangeValue(
    currentPrice: string,
    previousClose: string | null,
): string | null {
    if (previousClose === null) return null;
    return (BigInt(currentPrice) - BigInt(previousClose)).toString();
}

/**
 * 등락률(%). DB 스키마 numeric(8,4) 계약에 맞춰 소수 4자리 문자열로 반환.
 * 기준가가 없거나 0이면 null. 가격 범위가 53비트 안이라 Number 사용이 안전하다.
 */
export function computeChangeRate(
    price: string,
    basePrice: string | null,
): string | null {
    if (basePrice === null) return null;
    const base = Number(basePrice);
    if (base === 0) return null;
    return (((Number(price) - base) / base) * 100).toFixed(4);
}

/**
 * 분봉 거래대금 = (시가+고가+저가+종가)/4 × 거래량.
 * 분봉 소스가 거래대금을 안 주거나(키움) 다른 정의로 주므로(KIS acml_tr_pbmn) OHLC평균×량으로 통일.
 * 평균가의 소수점은 정수 나눗셈으로 내림 처리한다.
 * ⚠ 복기 파생(cumAmount)·테마 파생(bucketCounts)에 반영됨 — 이 공식을 바꾸면 day-replay 파일 캐시(.cache/day-replay)를 삭제.
 */
export function computeMinuteTradingAmount(bar: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}): string {
    const sum =
        BigInt(bar.open) + BigInt(bar.high) + BigInt(bar.low) + BigInt(bar.close);
    const averagePrice = sum / 4n; // 정수 나눗셈 = 내림
    return (averagePrice * BigInt(bar.volume)).toString();
}

/**
 * 시간 오름차순 거래대금 배열의 누적합. BigInt 기반 무손실.
 * 분봉 거래대금이 정수라 손실이 없지만, 방어적으로 정수부만 누적한다(DB precision 18, scale 0).
 *
 * @param amounts 시간 오름차순으로 정렬된 거래대금 문자열 배열
 * @returns 같은 길이의 누적 거래대금 문자열 배열
 */
export function computeAccumulatedAmounts(amounts: string[]): string[] {
    let acc = 0n;
    return amounts.map((amt) => {
        acc += BigInt(amt.split(".")[0]);
        return acc.toString();
    });
}

/** 1억(원). 거래대금 임계는 "억" 단위로 표현되므로 원 환산에 쓴다. */
const KRW_PER_EOK = 100_000_000n;

/**
 * 거래대금(원) 배열을 억 단위 임계별로 카운트한다 — "임계 t억 이상인 분봉이 몇 개인가".
 * 각 threshold(억)마다 독립 카운트(누적 아님): amount ≥ t억 이면 +1.
 * 무손실 정수 비교(BigInt) — 소수부는 방어적으로 버린다(거래대금은 정수라 통상 무영향).
 * 반환은 threshold(억) → count. 입력 thresholds 전부를 0으로 초기화해 키 누락이 없다.
 */
export function countByAmountThreshold(
    amountsKrw: string[],
    thresholdsEok: readonly number[],
): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const t of thresholdsEok) counts[t] = 0;

    for (const amt of amountsKrw) {
        const krw = BigInt(amt.split(".")[0]);
        for (const t of thresholdsEok) {
            if (krw >= BigInt(t) * KRW_PER_EOK) counts[t] += 1;
        }
    }
    return counts;
}

/** 기준가 조정계수의 반올림 노이즈 클램프 폭. 소급 재작성된 수정주가는 정수(원) 반올림이라 과거 재계산 시
 *  factor 에 ~1틱/가격 잔차가 남는다(최대 ~0.2%). 실제 이벤트(최소 ~2%)와 겹치지 않는 폭에서 1로 흡수. */
const BASE_FACTOR_EPSILON = 0.002;

/** 등락률 기준가(시장별) + 적용된 조정계수. basePricesOf 반환. */
export interface BasePrices {
    /** 기준가(당일 원주가 스케일). 원주가 직전 종가가 없으면(상장 첫날 등) null — 소비자는 당일 첫 시가 폴백. */
    base: ByMarket<number | null>;
    /** 적용 조정계수(평상 1). ≠1 = 이벤트(감자·액분·무증) 보정 또는 데이터 이상(당일 raw≠adj) — 트립와이어 로그용. */
    factor: ByMarket<number>;
}

/**
 * 등락률(%) 기준가 — 원주가 직전 종가에 조정계수를 보정해 **당일 원주가 스케일**로 되돌린 값.
 * 직전 거래일과 당일 사이에 가격 조정 이벤트(감자·액면분할·무상증자)가 끼면 원주가 전일종가는 옛 스케일이라
 * %가 배율만큼 폭주한다(감자 5:1 재개일 +550% 류). 보정 계수는 원주가·수정주가 두 일봉의 비율에서 자가 도출:
 *
 *   factor = (수정전일/원주전일) ÷ (수정당일/원주당일),  base = 원주전일 × factor
 *
 *  · 평상일: 수집 직후엔 수정=원주가 완전 동일 → 두 비율 다 1 → factor 1 (원주가 전일종가와 항등).
 *  · 이벤트 첫 거래일: 전일만 소급 재작성 → factor = 기준가 배율(감자 5:1 이면 ×5) → base = KRX 기준가.
 *  · 과거일 재계산(나중 이벤트로 전일·당일 둘 다 재작성): 같은 계수가 분자·분모에 → 상쇄 — 언제 계산해도 안정.
 * 반올림 잔차(<BASE_FACTOR_EPSILON)는 1로 클램프. 전일 수정주가가 없으면 보정 불가 → factor 1(원주가 그대로).
 */
export function basePricesOf(rawDaily: DailyCandle[], adjDaily: DailyCandle[], date: string): BasePrices {
    const prevRaw = rawDaily.reduce<DailyCandle | null>((p, c) => (c.date < date && (p === null || c.date > p.date) ? c : p), null);
    // 전일 비율은 반드시 **같은 날짜**의 원주·수정 쌍으로(다른 날짜 혼합 금지 — 갭이 있으면 보정 포기가 안전).
    const prevDate = prevRaw?.date;
    const adjPrev = prevDate !== undefined ? adjDaily.find((c) => c.date === prevDate) : undefined;
    const rawDay = rawDaily.find((c) => c.date === date);
    const adjDay = adjDaily.find((c) => c.date === date);

    const pos = (v: string | undefined): number | null => {
        const n = Number(v);
        return v !== undefined && Number.isFinite(n) && n > 0 ? n : null;
    };
    const per = (m: "krx" | "un"): { base: number | null; factor: number } => {
        const rawPrev = pos(prevRaw?.[m].close);
        if (rawPrev === null) return { base: null, factor: 1 };
        const aPrev = pos(adjPrev?.[m].close);
        let factor = 1;
        if (aPrev !== null) {
            const rDay = pos(rawDay?.[m].close);
            const aDay = pos(adjDay?.[m].close);
            const dayRatio = rDay !== null && aDay !== null ? aDay / rDay : 1;
            factor = aPrev / rawPrev / dayRatio;
            if (Math.abs(factor - 1) < BASE_FACTOR_EPSILON) factor = 1;
        }
        // 1e-6 반올림 — 부동소수 꼬리(1533×(7670/1533)=7669.999…)만 걷어낸다(보정 정밀도 무손실).
        return { base: Math.round(rawPrev * factor * 1e6) / 1e6, factor };
    };
    const krx = per("krx");
    const un = per("un");
    return { base: { krx: krx.base, un: un.base }, factor: { krx: krx.factor, un: un.factor } };
}

/**
 * 분봉 등락률(%)의 기준가 — 요청일 *직전 거래일* 일봉의 시장별 종가.
 * 일봉 번들(date−2년…date)이 이미 이 값을 품고 있으므로 별도 조회 없이 여기서 파생한다.
 * "date 보다 작은 마지막 캔들"을 date 비교로 고른다(배열 위치 가정 X — 당일 일봉 미적재여도 안전).
 * 직전 캔들이 없으면(상장일 등) null → 소비자는 당일 첫 분봉 시가로 폴백한다.
 */
export function previousCloseFromDaily(
    daily: DailyCandle[],
    date: string,
): { krxClose: string; unClose: string } | null {
    let prev: DailyCandle | null = null;
    for (const c of daily) {
        if (c.date >= date) continue;
        if (prev === null || c.date > prev.date) prev = c;
    }
    if (prev === null) return null;
    return { krxClose: prev.krx.close, unClose: prev.un.close };
}

/**
 * 수정주가 → **그 날 원주가 스케일** 환산비(raw/adj). 두 스케일을 잇는 유일한 다리다.
 *
 * 수정주가는 감자·액분·무증이 생길 때마다 **그 이전 전 구간이 소급 재작성**돼 언제나 "오늘 스케일" 한 벌인
 * 반면, 원주가(일봉 raw·분봉)는 그 날 실제로 체결된 값이다. 그래서 이벤트를 사이에 둔 두 값을 그냥 나누면
 * 비율이 이벤트 배율만큼 튄다(액분 5:1 이면 +400%). 분자·분모의 스케일을 맞추는 게 이 함수의 일:
 *
 *   원주가(그 날 스케일) = 수정주가 × rawScaleOf(...)
 *
 * 평상일은 raw = adj 라 1(항등) — 이벤트가 없는 절대다수 종목에선 아무것도 안 한다.
 * 시장은 UN 우선·KRX 폴백이다: 계수는 **종목 전체의 이벤트 배율**이라 시장별로 다를 이유가 없고(정수 반올림
 * 잔차뿐), 한쪽 종가가 없어도 다른 쪽으로 구해진다. 반올림 잔차는 basePricesOf 와 같은 폭으로 1에 흡수한다.
 *
 * 그 날 일봉이 한쪽이라도 없으면 **1**(보정 포기 = 지금까지의 동작). basePricesOf 가 전일 수정주가 결손에서
 * factor 1 로 물러나는 것과 같은 선택이다 — 이벤트는 드물고, 여기서 결손을 내면 일봉 미수집일의 타점이
 * 통째로 축에서 사라진다.
 */
export function rawScaleOf(rawDaily: readonly DailyCandle[], adjDaily: readonly DailyCandle[], date: string): number {
    const raw = rawDaily.find((c) => c.date === date);
    const adj = adjDaily.find((c) => c.date === date);
    return ratioOf(raw?.un.close, adj?.un.close) ?? ratioOf(raw?.krx.close, adj?.krx.close) ?? 1;
}

/** 두 종가의 비. 한쪽이라도 못 읽으면(미수집·0·비수치) null — 호출자가 다음 시장·1로 물러난다. */
function ratioOf(raw: string | undefined, adj: string | undefined): number | null {
    const r = Number(raw);
    const a = Number(adj);
    if (raw === undefined || adj === undefined || !Number.isFinite(r) || !Number.isFinite(a) || r <= 0 || a <= 0) return null;
    const ratio = r / a;
    return Math.abs(ratio - 1) < BASE_FACTOR_EPSILON ? 1 : ratio;
}
