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
// 그리는 구간은 **호출측(화면 프레임)이 정한다** — 예전엔 앵커 피벗의 처음~끝이었는데, 미래(타점 이후)까지
// 같이 보기로 하며(사용자 확정) 창 기준으로 바뀌었다: 기본은 타점 앞뒤 프레임, 미래 토글이면 장 끝까지.
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
 * 멤버 하나의 경로 — `[from, to]` 구간의 **분당 종가 전부**. 거래가 없어 빠진 분은 **직전 종가로 채운다**
 * (사용자 확정 — 골격·테마·캔들 전부 "모든 시간에 값이 있다"로 통일). 다만 채우는 건 **내부 갭만**이다:
 * 선두 갭(첫 값 이전)은 끌어올 값이 없어서, 후미 갭(마지막 봉 이후)은 장이 끝난 뒤라서 안 채운다
 * — 도메인 densifyMinutes 의 규칙("각 시장의 첫 봉~마지막 봉 사이")과 같은 경계다.
 *
 * 한때 빠진 분을 **건너뛰었다** — "없는 걸 그리면 없던 평평한 구간이 사실처럼 보인다"는 이유였는데,
 * 건너뛰면 그 구간이 **직선으로 이어져** 어차피 없던 경로가 그려지고(그것도 기울어진 채) 캔들·골격과
 * x가 어긋난다. 평탄하게 채우면 적어도 "그동안 값이 안 움직였다"는 참인 그림이 되고, 거래대금 채널
 * (굵기·마커)이 0이라 조용했다는 게 같이 읽힌다.
 * 점이 2개 미만이면 선이 아니다(null).
 */
export function memberPath(from: number, to: number, series: MinuteSeries): PathPoint[] | null {
    const out: PathPoint[] = [];
    // 채움은 **다음 실제 값이 나올 때만** 확정된다(pending) — 마지막 봉 뒤의 채움은 버려진다.
    // 안 그러면 장이 끝난 뒤(20시 이후)까지 평탄선이 뻗어 없는 시간을 그린다(사용자 지적).
    const pending: PathPoint[] = [];
    let prev: number | null = null;
    for (let m = from; m <= to; m++) {
        const i = series.index.get(m);
        if (i == null) {
            if (prev !== null) pending.push({ x: m, y: prev });
            continue;
        }
        const y = series.close[i];
        if (!Number.isFinite(y)) continue;
        if (pending.length > 0) { out.push(...pending); pending.length = 0; }
        prev = y;
        out.push({ x: m, y });
    }
    return out.length >= 2 ? out : null;
}

/** 테마 선 하나 — 절대 공간(x=벽시계 분, y=전일 종가 대비 %). 화면(%p 뷰)은 앵커의 (t₀, r_앵커(t₀))만큼 평행이동해 얹는다. */
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
 * 구간 `[from, to]`(벽시계 분)는 호출측이 준다 — hot 판정과 같은 창을 써야 "그린 구간에 떴던 것"이 성립한다.
 *
 * y 는 스냅샷의 `rate`(등락률 %)를 그대로 낸다(절대 공간) — %p 뷰로의 평행이동은 화면의 몫이다
 * (상수 하나를 빼는 것뿐이라 여기서 섞으면 순수 절대값을 쓰는 쪽이 도로 되돌려야 한다).
 * ⚠ 앵커 선의 분모는 골격 피드의 전일 종가(수정주가)이고 멤버의 분모는 복기 파생의 기준가(원주가+이벤트
 * 보정)다. 평상일엔 같은 값이지만, 그 사이 액분·감자가 있었던 종목은 두 % 가 미세하게 갈릴 수 있다
 * (보정 계수가 1이 아닌 종목은 서버가 트립와이어로 로그한다).
 */
export function themeLines(
    anchor: NormalizedSkeleton,
    stocks: readonly ThemeSourceStock[],
    hotCodes: ReadonlySet<string>,
    toMinuteOfDay: (unixSec: number) => number,
    range: { from: number; to: number },
): ThemeLine[] {
    const self = stocks.find((s) => s.code === anchor.stockCode);
    const themes = new Set(self?.themes ?? []);
    if (themes.size === 0) return [];
    const { from, to } = range;
    const out: ThemeLine[] = [];
    for (const s of stocks) {
        if (s.code === anchor.stockCode || !hotCodes.has(s.code)) continue;
        if (!s.themes.some((t) => themes.has(t))) continue;
        const points = memberPath(from, to, { index: minuteIndex(s.times, toMinuteOfDay), close: s.rate });
        if (points) out.push({ code: s.code, name: s.name ?? s.code, points });
    }
    return out;
}
