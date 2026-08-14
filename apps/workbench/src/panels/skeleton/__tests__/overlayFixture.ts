// 골격 겹쳐 그리기 테스트의 **재료 한 벌** — 골격 피드 · 타점 · 그날 복기 스냅샷.
//
// 테마 선이 실제로 그려지려면 조건이 다섯 개나 맞아야 한다(아래 themeSnapshot 주석). 하나라도 어긋나면
// 화면이 조용히 비고, 그러면 층 순서 검사가 **빈 화면을 상대로 통과**한다 — 그 함정을 한 번 밟아 봐서
// 재료를 여기 모으고, 쓰는 쪽이 "정말 그려졌나"를 따로 단언하게 한다.
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { DayReplay } from "../../../api/dayReplay.js";
import type { ReviewPointListItem, SkeletonFeed } from "@trade-data-manager/wire";

export const CODE = "005930";
export const MEMBER = "000660";
export const DATE = "2026-07-08";
export const TIME = "09:30:00";
/** 타점 시각을 자정 기준 분으로 — 분봉 피벗의 t 와 스냅샷 시각이 이 통화를 쓴다. */
export const TIME_MIN = 9 * 60 + 30;

/**
 * 벽시계 분 → unix 초. `minuteOfDayOf` 의 역함수다(KST +9h).
 * UTC 자정 epoch 는 86400 의 배수이므로 `(base + m*60 − 32400) + 32400 ≡ m*60 (mod 86400)` 이 성립한다.
 * ⚠ 손으로 계산한 값이라 테스트가 `minuteOfDayOf` 로 되짚어 확인한다 — 여기가 틀리면 스냅샷이 통째로
 * 엉뚱한 시각에 놓이고 테마·거래대금이 조용히 빈다.
 */
export const unixAtMinute = (m: number): number => Date.UTC(2026, 6, 8) / 1000 + m * 60 - 32400;

/**
 * ⚠ 두 해상도의 `t` 는 **통화가 다르다** — 일봉은 창 안 거래일 인덱스, 분봉은 벽시계 분.
 * 그리고 분봉 골격은 **타점 시각에 피벗이 있어야** 선이 선다(합성 규칙: "타점 종가 = 골격의 한 점").
 */
export const skeletonFeed: SkeletonFeed = {
    daily: [{
        stockCode: CODE,
        date: DATE,
        pivots: [{ t: 0, price: 10_000 }, { t: 3, price: 12_000 }, { t: 6, price: 11_000 }],
    }],
    minute: [{
        stockCode: CODE,
        date: DATE,
        pivots: [
            { t: TIME_MIN - 5, price: 10_000 },
            { t: TIME_MIN, price: 12_000, synthetic: true }, // 타점 시각 — 이 점이 없으면 선이 안 선다
            { t: TIME_MIN + 5, price: 11_000 },
        ],
        prevClose: 9_500, // %p 공간의 분모 — 없으면 결손으로 빠진다
    }],
    levels: [{ stockCode: CODE, date: DATE, levels: [{ price: 9_800, baseline: true }] }],
};

export const points: ReviewPointListItem[] = [
    { stockCode: CODE, date: DATE, time: TIME, name: "삼성전자" },
];

/** 분봉 시계열 한 종목 — 값은 단조 증가라 그림이 있는지만 보면 된다(수치의 뜻은 다른 테스트의 몫). */
function series(code: string, name: string, themes: string[], from: number, to: number, rateAt: (m: number) => number): DayReplay["stocks"][number] {
    const times: number[] = [];
    const rate: number[] = [];
    const cumAmount: number[] = [];
    for (let m = from; m <= to; m++) {
        times.push(unixAtMinute(m));
        rate.push(rateAt(m));
        cumAmount.push((m - from + 1) * 1_000_000_000); // 10억/분 — 거래대금 구간에 확실히 든다
    }
    const n = times.length;
    return {
        code, name, market: "KRX", marketCap: "1000000000000", themes,
        times, rate,
        high: rate.slice(), low: rate.slice(), open: rate[0],
        cumAmount,
        minuteOpen: rate.slice(), minuteHigh: rate.map((r) => r + 0.5), minuteLow: rate.map((r) => r - 0.5),
        trailingHighs: { krx: Array.from({ length: n }, () => 0), un: Array.from({ length: n }, () => 0) },
        basePrice: { krx: 9_500, un: 9_500 },
    };
}

/**
 * 테마 선이 그려지는 스냅샷. **다섯 가지가 동시에 맞아야** 선이 하나라도 나온다:
 *  ① 앵커 종목이 스냅샷에 있고 `themes` 가 비어 있지 않다(비면 themeLines 가 즉시 빈 배열).
 *  ② 멤버가 앵커와 테마를 **하나 이상 공유**한다.
 *  ③ 멤버가 hot 창(타점 −60분 ~ +10분)에 **한 번이라도 보드에 떴다** — 종목이 둘뿐이라 top-N 에 자동으로 든다.
 *  ④ 멤버의 분당 점이 **2개 이상**이다(그 미만은 선이 아니다).
 *  ⑤ 시각이 `minuteOfDayOf` 로 되짚어 의도한 분에 떨어진다(unixAtMinute 의 ⚠ 참고).
 */
export const themeSnapshot: DayReplay = {
    date: DATE,
    stocks: [
        series(CODE, "삼성전자", ["반도체"], TIME_MIN - 10, TIME_MIN + 10, (m) => (m - TIME_MIN) * 0.5 + 26),
        series(MEMBER, "SK하이닉스", ["반도체"], TIME_MIN - 10, TIME_MIN + 10, (m) => (m - TIME_MIN) * 0.3 + 18),
    ],
};

/** 스냅샷이 실제로 의도한 분에 놓였나 — 픽스처 자신을 검증하는 최소 확인(쓰는 쪽 테스트가 부른다). */
export const snapshotMinutes = (stock: DayReplay["stocks"][number]): number[] => stock.times.map(minuteOfDayOf);
