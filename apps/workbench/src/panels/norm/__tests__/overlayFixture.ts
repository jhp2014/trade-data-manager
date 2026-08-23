// 정규화 겹치기 테스트의 **재료 한 벌** — 차트 번들 · 슬롯(고정) 심기 · 그날 복기 스냅샷.
//
// 옛 골격 피드는 은퇴했다 — 이제 선의 재료는 chartQuery 번들이고, 모수는 슬롯(시선+고정)이다.
// 테마 선이 실제로 그려지려면 조건이 다섯 개나 맞아야 한다(아래 themeSnapshot 주석). 하나라도 어긋나면
// 화면이 조용히 비고, 그러면 층 순서 검사가 **빈 화면을 상대로 통과**한다 — 그 함정을 한 번 밟아 봐서
// 재료를 여기 모으고, 쓰는 쪽이 "정말 그려졌나"를 따로 단언하게 한다.
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { DayReplay } from "../../../api/dayReplay.js";
import type { ChartBundle } from "../../../api/chart.js";
import type { NormPin } from "../normShared.js";

export const CODE = "005930";
export const MEMBER = "000660";
export const DATE = "2026-07-08";
export const TIME = "09:30:00";
/** 타점 시각을 자정 기준 분으로 — 분봉 좌표와 스냅샷 시각이 이 통화를 쓴다. */
export const TIME_MIN = 9 * 60 + 30;

/**
 * 벽시계 분 → unix 초. `minuteOfDayOf` 의 역함수다(KST +9h).
 * UTC 자정 epoch 는 86400 의 배수이므로 `(base + m*60 − 32400) + 32400 ≡ m*60 (mod 86400)` 이 성립한다.
 * ⚠ 손으로 계산한 값이라 테스트가 `minuteOfDayOf` 로 되짚어 확인한다.
 */
export const unixAtMinute = (m: number): number => Date.UTC(2026, 6, 8) / 1000 + m * 60 - 32400;

const dailyBar = (o: number, h: number, l: number, c: number) =>
    ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "1000", amount: "1000000000" });

/** D−n 일자 문자열 — 실존 날짜일 필요는 없고 오름차순이면 된다(정규화 x 는 배열 인덱스가 정한다). */
const dayOf = (i: number, total: number): string => `2026-07-${String(8 - (total - 1 - i)).padStart(2, "0")}`;

/**
 * 일봉 번들 — 종가 목록을 받아 마지막이 D(=DATE)인 봉들을 만든다. 봉의 시고저는 종가 둘레 ±2%.
 * 정규화 원점은 D−1 종가(useNormLines) — 그래서 closes 는 2개 이상이어야 선이 선다.
 */
export function dailyBundleOf(code: string, closes: readonly number[]): ChartBundle {
    return {
        stockCode: code,
        daily: closes.map((c, i) => ({
            stockCode: code,
            date: dayOf(i, closes.length),
            krx: dailyBar(Math.round(c * 0.99), Math.round(c * 1.02), Math.round(c * 0.98), c),
            un: dailyBar(Math.round(c * 0.99), Math.round(c * 1.02), Math.round(c * 0.98), c),
        })),
        minutes: [],
        basePrice: null,
    };
}

/**
 * 분봉 번들 — [from, to] 분의 UN 봉과 전일 종가(basePrice). 타점 시각(TIME_MIN)에 봉이 있어야
 * 그 타점의 선이 선다(원점 분봉 미수집 = 결손).
 */
export function minuteBundleOf(code: string, from: number, to: number, priceAt: (m: number) => number, prevClose = 9_500): ChartBundle {
    const minutes = [];
    for (let m = from; m <= to; m++) {
        const p = priceAt(m);
        minutes.push({
            stockCode: code,
            date: DATE,
            time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`,
            krx: null,
            // ⚠ 가격은 정수 문자열이어야 한다 — 도메인 거래대금 공식이 BigInt 를 탄다.
            un: { open: String(Math.round(p - 10)), high: String(Math.round(p + 15)), low: String(Math.round(p - 20)), close: String(Math.round(p)), volume: "100" },
        });
    }
    return { stockCode: code, daily: [], minutes, basePrice: { krx: prevClose, un: prevClose } };
}

/** 슬롯(고정) 심기 — 영속이라 **렌더 전에** 저장소에 앉힌다(useNormLines 가 마운트 시점에 읽는다). */
export const seedPins = (grain: "daily" | "minute", pins: readonly NormPin[]): void =>
    localStorage.setItem(`wb.normPins.${grain}`, JSON.stringify(pins));

/** 그리기 모드 심기 — 자동(개수 판정)을 비켜 특정 모드를 못박고 싶은 테스트용. */
export const seedMode = (grain: "daily" | "minute", mode: "auto" | "candles" | "lines"): void =>
    localStorage.setItem(`wb.normMode.${grain}`, JSON.stringify(mode));

// ── 기본 한 벌: 타점 하나(분봉) / 차트 하나(일봉) ────────────────────────────────
/** 타점 앞뒤로 완만히 오르는 하루 분봉 — 09:20~09:40. 타점 시각 가격 12,000(전일 9,500 → +26.3%). */
export const minuteBundle = minuteBundleOf(CODE, TIME_MIN - 10, TIME_MIN + 10, (m) => 12_000 + (m - TIME_MIN) * 50);
/** 7일 일봉 — 마지막이 D. D−1 종가 11,000 이 원점. */
export const dailyBundle = dailyBundleOf(CODE, [10_000, 10_400, 10_800, 11_200, 11_100, 11_000, 12_000]);

export const dailyPin: NormPin = { code: CODE, date: DATE };
/** 일봉+분봉을 다 가진 번들 — 두 패널을 **한 문서**에 세우는 테스트용(캐시 키가 (종목,날짜) 하나라서). */
export const fullBundle: ChartBundle = { ...dailyBundle, minutes: minuteBundle.minutes, basePrice: minuteBundle.basePrice };
export const minutePin: NormPin = { code: CODE, date: DATE, time: TIME };

/** 종목명 사전 시드(피드 자동 유도가 없어졌으므로 명시). */
export const stockNames = [
    { stockCode: CODE, name: "삼성전자", market: "거래소" },
    { stockCode: MEMBER, name: "SK하이닉스", market: "거래소" },
    { stockCode: "035720", name: "카카오", market: "거래소" },
];

// ── 뭉침(뱃지)을 만드는 재료 한 벌 ─────────────────────────────────────────────
// 세 차트의 종가 경로를 똑같이 두면 라벨 지점(잘리는 자리)도 똑같아져 배율과 무관하게 항상 뭉친다.
export const CLUSTER_CODES = ["005930", "000660", "035720"] as const;
export const CLUSTER_NAMES: Record<string, string> = { "005930": "삼성전자", "000660": "SK하이닉스", "035720": "카카오" };

export const clusterPins: NormPin[] = CLUSTER_CODES.map((code) => ({ code, date: DATE }));
export const clusterCharts = CLUSTER_CODES.map((code) => ({
    code, date: DATE, data: dailyBundleOf(code, [10_000, 10_500, 11_000, 12_000]),
}));

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
 *  ③ 멤버가 hot 창(타점 −60분 ~ +10분)에 **한 번이라도 보드에 떴다**.
 *  ④ 멤버의 분당 점이 **2개 이상**이다.
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
