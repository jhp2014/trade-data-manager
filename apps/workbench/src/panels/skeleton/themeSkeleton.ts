// 테마 골격 — 짚은 골격의 **피벗 시각에 테마 종목들을 같이 세워** 동조를 본다(순수 계산).
//
// ## 이건 "테마 종목의 골격"이 아니라 **동시각 표본**이다
// 멤버 자신의 변곡점은 딴 데 있다. 여기서 답하는 질문은 "내 종목이 꺾인 그 순간들에 테마는 어디 있었나"
// — 형태 요약이 아니라 동조 측정이다. 그래서 손으로 찍은 골격과 달리 좌표를 **빌려** 쓴다.
//
// ## 멤버 경로는 **분당 종가 전부**다 — 축약하지 않는다
// 골격의 축약이 값어치 있는 건 **손으로 고른 변곡점**이기 때문이다. 멤버에는 그 손이 없으니, 축약은
// 근사일 뿐인데 정작 원본(분당 종가)이 이미 클라에 다 와 있다(복기 파생 한 벌). 근사할 이유가 없다.
// (한때 오차 기반 재귀 세분을 뒀다가 걷어냈다 — 파라미터 하나가 늘고 그림은 원본보다 나을 수 없었다.
//  분 안의 꼬리는 나중에 캔들 오버레이가 답한다.)
//
// 그리는 구간은 **앵커 피벗의 처음~끝**이다. 하루 전체로 넓히면 척도 프레임이 앵커 골격을 따라가지
// 못하고, "내 골격이 그린 그 시간 동안 테마는 어디 있었나"라는 질문에서도 벗어난다.
import type { NormalizedSkeleton } from "./skeletonOverlay.js";

/** 한 종목의 분당 시계열(% 공간) — 벽시계 분으로 찾는다. */
export interface MinuteSeries {
    /** 벽시계 분 → 배열 인덱스. */
    index: ReadonlyMap<number, number>;
    /** 분 종가 %. 경로는 이것 하나로 그린다(분 안의 고저는 캔들 오버레이의 몫). */
    close: readonly number[];
}

/** 경로 위의 한 점(x = 벽시계 분, y = 전일 종가 대비 %). */
export interface PathPoint {
    x: number;
    y: number;
}

/**
 * 멤버 하나의 경로 — `[from, to]` 구간의 **분당 종가 전부**. 거래가 없어 빠진 분은 건너뛴다
 * (직전 값을 끌어오지 않는다 — 없는 걸 그리면 평평한 구간이 사실처럼 보인다).
 * 점이 2개 미만이면 선이 아니다(null).
 */
export function memberPath(from: number, to: number, series: MinuteSeries): PathPoint[] | null {
    const out: PathPoint[] = [];
    for (let m = from; m <= to; m++) {
        const i = series.index.get(m);
        if (i == null) continue;
        const y = series.close[i];
        if (Number.isFinite(y)) out.push({ x: m, y });
    }
    return out.length >= 2 ? out : null;
}

/** 테마 선 하나 — 절대 배치(x=벽시계 분, y=전일 종가 대비 %)라 앵커 골격과 같은 공간에 그대로 선다. */
export interface ThemeLine {
    code: string;
    name: string;
    points: PathPoint[];
}

/** 스냅샷 종목에서 이 모듈이 쓰는 것만 — 와이어 전체를 끌고 오지 않는다(테스트도 이 모양이면 된다). */
export interface ThemeSourceStock {
    code: string;
    name?: string | null;
    themes: string[];
    times: number[];
    rate: number[];
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
): ThemeLine[] {
    const self = stocks.find((s) => s.code === anchor.stockCode);
    const themes = new Set(self?.themes ?? []);
    if (themes.size === 0) return [];
    const mins = anchor.points.map((p) => p.x + anchor.baseT);
    const from = Math.min(...mins);
    const to = Math.max(...mins);
    const out: ThemeLine[] = [];
    for (const s of stocks) {
        if (s.code === anchor.stockCode || !hotCodes.has(s.code)) continue;
        if (!s.themes.some((t) => themes.has(t))) continue;
        const points = memberPath(from, to, { index: minuteIndex(s.times, toMinuteOfDay), close: s.rate });
        if (points) out.push({ code: s.code, name: s.name ?? s.code, points });
    }
    return out;
}
