// 테마 골격 — 짚은 골격의 **피벗 시각에 테마 종목들을 같이 세워** 동조를 본다(순수 계산).
//
// ## 이건 "테마 종목의 골격"이 아니라 **동시각 표본**이다
// 멤버 자신의 변곡점은 딴 데 있다. 여기서 답하는 질문은 "내 종목이 꺾인 그 순간들에 테마는 어디 있었나"
// — 형태 요약이 아니라 동조 측정이다. 그래서 손으로 찍은 골격과 달리 좌표를 **빌려** 쓴다.
//
// ## 그 좌표만으로는 그림이 거짓말을 한다 — 그래서 세분한다
// 내 피벗이 09:15·10:15 두 개면 멤버는 직선 하나가 된다. 그 사이 멤버가 급등 후 되밀렸어도 평평해 보인다.
// 채우는 법이 둘인데:
//   · 균등 격자(5분마다) — 조용했어도 12개, 요동쳤어도 12개. 조용한 구간엔 쓸모없는 점이 박히고
//     정작 요동친 구간은 5분 해상도로 뭉갠다.
//   · **오차 기반 재귀**(여기) — 직선에서 가장 멀리 벗어난 지점에만 점을 하나 찍고, 갈린 두 구간에
//     같은 걸 반복한다. 벗어남이 허용 오차 안이면 멈춘다.
// 두 번째면 조용한 구간엔 점이 0개, 요동친 구간엔 필요한 만큼 생긴다. 손잡이도 "허용 오차 %" 하나뿐이다.
// (Douglas–Peucker 는 원래 점 많은 선을 **줄이는** 알고리즘인데 판정이 같아서 거꾸로 쓰면 늘리는 게 된다.
//  "구간이 벌어졌을 때만"이라는 조건도 저절로 흡수된다 — 짧은 구간은 벗어날 여지가 없어 점이 안 생긴다.)
//
// ## 후보는 종가뿐 아니라 고가·저가도 본다
// 분 종가만 보면 분 안에서 찍고 돌아온 꼬리를 놓친다. 셋 중 직선에서 가장 먼 값을 쓰되 **고가·저가를
// 함께** 봐야 그림이 한쪽으로 안 기운다(고가만 보면 상승 종목의 변동폭이 위로만 부푼다).
import type { NormalizedSkeleton } from "./skeletonOverlay.js";

/** 한 종목의 분당 시계열(% 공간) — 벽시계 분으로 찾는다. */
export interface MinuteSeries {
    /** 벽시계 분 → 배열 인덱스. */
    index: ReadonlyMap<number, number>;
    /** 분 종가 % (경로의 기본값). */
    close: readonly number[];
    high: readonly number[];
    low: readonly number[];
}

/** 세분 파라미터. */
export interface RefineOptions {
    /** 허용 오차(%p) — 직선이 실제 경로에서 이보다 더 벗어나면 점을 하나 넣는다. */
    tolerance: number;
    /** 구간 하나가 낳을 수 있는 점의 상한 — 재귀가 병적으로 깊어지는 걸 막는 안전판. */
    maxPerSegment?: number;
}

const DEFAULT_MAX_PER_SEGMENT = 16;

/** 세분으로 생긴 점. `extremum` = 분 고가·저가에서 온 점(종가 경로 밖) — 그릴 때 구분하고 싶을 때. */
export interface RefinedPoint {
    x: number;
    y: number;
}

/**
 * 두 끝점 사이를 오차가 허용치 안에 들 때까지 재귀 세분한다. 반환은 **끝점을 뺀 안쪽 점들**(시간순).
 * m0·m1 은 벽시계 분, y0·y1 은 그 시각의 값(호출측이 정한다 — 대개 series 의 종가).
 */
export function refineBetween(
    m0: number,
    y0: number,
    m1: number,
    y1: number,
    series: MinuteSeries,
    opts: RefineOptions,
): RefinedPoint[] {
    const cap = opts.maxPerSegment ?? DEFAULT_MAX_PER_SEGMENT;
    const out: RefinedPoint[] = [];
    const rec = (a: number, ya: number, b: number, yb: number): void => {
        if (out.length >= cap || b - a <= 1) return;
        const slope = (yb - ya) / (b - a);
        let bestM = -1;
        let bestY = 0;
        let bestDev = opts.tolerance;
        for (let m = a + 1; m < b; m++) {
            const i = series.index.get(m);
            if (i == null) continue;
            const onLine = ya + slope * (m - a);
            // 종가·고가·저가 셋 중 직선에서 가장 먼 값. 고가만 보면 그림이 위로만 부푼다.
            for (const v of [series.close[i], series.high[i], series.low[i]]) {
                if (!Number.isFinite(v)) continue;
                const dev = Math.abs(v - onLine);
                if (dev > bestDev) { bestDev = dev; bestM = m; bestY = v; }
            }
        }
        if (bestM < 0) return; // 허용 오차 안 — 이 구간은 직선으로 충분하다
        rec(a, ya, bestM, bestY);
        out.push({ x: bestM, y: bestY });
        rec(bestM, bestY, b, yb);
    };
    rec(m0, y0, m1, y1);
    return out.sort((p, q) => p.x - q.x);
}

/**
 * 멤버 하나의 선 — 앵커 피벗 시각들에 세우고, 그 사이를 세분해 채운다.
 * 피벗 시각에 분봉이 없으면 그 점은 **건너뛴다**(지어내지 않는다). 남은 점이 2개 미만이면 선이 아니다(null).
 */
export function memberPath(pivotMinutes: readonly number[], series: MinuteSeries, opts: RefineOptions): RefinedPoint[] | null {
    const anchors: RefinedPoint[] = [];
    for (const m of pivotMinutes) {
        const i = series.index.get(m);
        if (i != null && Number.isFinite(series.close[i])) anchors.push({ x: m, y: series.close[i] });
    }
    if (anchors.length < 2) return null;
    const out: RefinedPoint[] = [anchors[0]];
    for (let k = 0; k + 1 < anchors.length; k++) {
        const a = anchors[k];
        const b = anchors[k + 1];
        out.push(...refineBetween(a.x, a.y, b.x, b.y, series, opts));
        out.push(b);
    }
    return out;
}

/** 테마 선 하나 — 절대 배치(x=벽시계 분, y=전일 종가 대비 %)라 앵커 골격과 같은 공간에 그대로 선다. */
export interface ThemeLine {
    code: string;
    name: string;
    points: RefinedPoint[];
}

/** 스냅샷 종목에서 이 모듈이 쓰는 것만 — 와이어 전체를 끌고 오지 않는다(테스트도 이 모양이면 된다). */
export interface ThemeSourceStock {
    code: string;
    name?: string | null;
    themes: string[];
    times: number[];
    rate: number[];
    minuteHigh: number[];
    minuteLow: number[];
    cumAmount: number[];
}

/**
 * 그 구간에서 **한 번이라도 보드에 떴던** 종목 코드.
 *
 * 왜 "그 시각에 있었던 종목"인가(사용자 확정): 조용히 흘러간 테마 멤버는 장중에도 볼 일이 없다.
 * 보드 판정을 그대로 쓰므로 화면에서 보던 것과 같은 무리가 나온다 — 별도 기준을 만들면 둘이 갈린다.
 * 멤버십은 캐싱된 게 아니라 시계열 위의 순수 계산이라 어느 구간이든 여기서 다시 뽑는다.
 */
export function hotCodesInRange(
    stocks: readonly ThemeSourceStock[],
    fromMinute: number,
    toMinute: number,
    toMinuteOfDay: (unixSec: number) => number,
    hotOf: (snaps: { code: string; amount: number; changeRate: number }[]) => ReadonlySet<string>,
): Set<string> {
    // 종목별 (분 → 인덱스)를 한 번만 만든다 — 분마다 다시 훑으면 구간 길이 × 종목 수가 된다.
    const idx = stocks.map((s) => minuteIndex(s.times, toMinuteOfDay));
    const out = new Set<string>();
    for (let m = fromMinute; m <= toMinute; m++) {
        const snaps: { code: string; amount: number; changeRate: number }[] = [];
        for (let k = 0; k < stocks.length; k++) {
            const i = idx[k].get(m);
            if (i == null) continue;
            snaps.push({ code: stocks[k].code, amount: stocks[k].cumAmount[i], changeRate: stocks[k].rate[i] });
        }
        if (snaps.length === 0) continue;
        for (const c of hotOf(snaps)) out.add(c);
    }
    return out;
}

const minuteIndex = (times: readonly number[], toMinute: (unixSec: number) => number): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < times.length; i++) m.set(toMinute(times[i]), i);
    return m;
};

/**
 * 짚은 골격 하나 → 테마 선들. 멤버 = **앵커와 테마가 겹치고** 그 구간에 한 번이라도 떴던 종목(앵커 제외).
 *
 * y 는 스냅샷의 `rate`(등락률 %)를 그대로 쓴다 — 절대 배치의 y 와 같은 정의라 환산이 없다.
 * ⚠ 앵커 선의 분모는 골격 피드의 전일 종가(수정주가)이고 멤버의 분모는 복기 파생의 기준가(원주가+이벤트
 * 보정)다. 평상일엔 같은 값이지만, 그 사이 액분·감자가 있었던 종목은 두 % 가 미세하게 갈릴 수 있다
 * (보정 계수가 1이 아닌 종목은 서버가 트립와이어로 로그한다).
 */
export function themeLines(
    anchor: NormalizedSkeleton,
    stocks: readonly ThemeSourceStock[],
    hotCodes: ReadonlySet<string>,
    toMinuteOfDay: (unixSec: number) => number,
    opts: RefineOptions,
): ThemeLine[] {
    const self = stocks.find((s) => s.code === anchor.stockCode);
    const themes = new Set(self?.themes ?? []);
    if (themes.size === 0) return [];
    const pivotMinutes = anchor.points.map((p) => p.x + anchor.baseT);
    const out: ThemeLine[] = [];
    for (const s of stocks) {
        if (s.code === anchor.stockCode || !hotCodes.has(s.code)) continue;
        if (!s.themes.some((t) => themes.has(t))) continue;
        const series: MinuteSeries = { index: minuteIndex(s.times, toMinuteOfDay), close: s.rate, high: s.minuteHigh, low: s.minuteLow };
        const points = memberPath(pivotMinutes, series, opts);
        if (points) out.push({ code: s.code, name: s.name ?? s.code, points });
    }
    return out;
}
