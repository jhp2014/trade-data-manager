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
import { minuteOfDayOf, selectHotUniverse } from "@trade-data-manager/market/domain";
import { fillGaps, minuteIndexOf, yAtX, type NormLine } from "./overlay.js";

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
 * 걸음(내부 갭만·pending 확정)은 공용 fillGaps 다 — 멤버 캔들(memberCandles)과 같은 경계를 탄다.
 * 점이 2개 미만이면 선이 아니다(null).
 */
export function memberPath(from: number, to: number, series: MinuteSeries): PathPoint[] | null {
    const out = pathPoints(from, to, series);
    return out.length >= 2 ? out : null;
}

/** memberPath 의 걸음 그 자체 — 재적 조각(memberSegments)은 2점 규칙 없이 같은 걸음을 타야 해서 몸통을 나눈다. */
function pathPoints(from: number, to: number, series: MinuteSeries): PathPoint[] {
    return fillGaps<PathPoint>(
        from, to,
        (m) => {
            const i = series.index.get(m);
            if (i == null) return "gap";
            const y = series.close[i];
            return Number.isFinite(y) ? { x: m, y } : "skip";
        },
        (m, prev) => ({ x: m, y: prev.y }),
    );
}

/**
 * 테마 선 하나 — 절대 공간(x=벽시계 분, y=전일 종가 대비 %). 화면(%p 뷰)은 앵커의 (t₀, r_앵커(t₀))만큼 평행이동해 얹는다.
 *
 * 저장 모양은 **세그먼트 배열 하나**다 — "하루 전체" 모드가 세그먼트 1개일 뿐이라, 소비자(그림·히트·
 * 거터·판독·굵기 런) 어디에도 모드 분기가 없다. 조각 사이 = 순위 이탈(재적 모드) — 갭을 가로질러
 * 보간·연결하면 이탈이 사실로 둔갑하므로, 소비자는 조각을 넘어 잇지 않는다.
 */
export interface ThemeLine {
    code: string;
    name: string;
    /** 경로 조각들(각각 x 오름차순, 조각끼리도 오름차순). 1점 조각 = 1분 재적(점으로 그린다 — 떴다는 사실은 남긴다). */
    segments: PathPoint[][];
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
 * 구간의 분 루프 **한 번**에서 종목별 **재적 분 목록**(보드에 떠 있던 분, 오름차순)을 뽑는다.
 *
 * 왜 "그 시각에 있었던 종목"인가(사용자 확정): 조용히 흘러간 테마 멤버는 장중에도 볼 일이 없다.
 * 보드 판정을 그대로 쓰므로 화면에서 보던 것과 같은 무리가 나온다 — 별도 기준을 만들면 둘이 갈린다.
 * 자격 집합은 `codesHotWithin` 으로 공짜 파생 — 판정이 두 번 돌 일이 없다(재적 모드가 넓은 창을
 * 스캔해도 자격은 부분구간 교집합으로 뽑으므로 모집단 정의는 한 곳이다).
 *
 * 스캔 범위는 요청 구간 ∩ 스냅샷의 실제 데이터 범위 — 하루 전체(0..1439)를 달래도 봉이 있는
 * 분만 돈다(빈 분은 snaps 가 비어 어차피 건너뛰지만, 범위를 좁히면 그 루프 자체가 사라진다).
 */
export function hotMinutesInRange(
    stocks: readonly ThemeSourceStock[],
    fromMinute: number,
    toMinute: number,
    toMinuteOfDay: (unixSec: number) => number,
    hotOf: (snaps: { code: string; amount: number; changeRate: number }[]) => ReadonlySet<string>,
): Map<string, number[]> {
    // 종목별 (분 → 인덱스)는 공용 캐시(minuteIndexOf)에서 — 테마 선·거래대금·캔들과 같은 색인을 나눠 쓴다.
    const idx = stocks.map((s) => minuteIndexOf(s.times, toMinuteOfDay));
    let lo = fromMinute;
    let hi = toMinute;
    {
        // times 는 deriveMinutes 산출물이라 오름차순 — 종목당 첫/끝만 보면 O(종목수)로 끝난다
        // (색인 키 전수 순회는 좁은 자격 창 호출에서도 하루치 전체를 훑어 현행 비용 약속이 깨진다).
        let min = Infinity;
        let max = -Infinity;
        for (const s of stocks) {
            if (s.times.length === 0) continue;
            const a = toMinuteOfDay(s.times[0]);
            const b = toMinuteOfDay(s.times[s.times.length - 1]);
            if (a < min) min = a;
            if (b > max) max = b;
        }
        if (min > lo) lo = min;
        if (max < hi) hi = max;
    }
    const out = new Map<string, number[]>();
    for (let m = lo; m <= hi; m++) {
        const snaps: { code: string; amount: number; changeRate: number }[] = [];
        for (let k = 0; k < stocks.length; k++) {
            const i = idx[k].get(m);
            if (i == null) continue;
            snaps.push({ code: stocks[k].code, amount: stocks[k].cumAmount[i], changeRate: stocks[k].rate[i] });
        }
        if (snaps.length === 0) continue;
        for (const c of hotOf(snaps)) {
            const list = out.get(c);
            if (list) list.push(m);
            else out.set(c, [m]);
        }
    }
    return out;
}

/** 재적 분 목록 → `[from, to]` 에 한 번이라도 떴던 종목(자격 집합). 두 모드가 같은 정의를 나눠 쓴다. */
export function codesHotWithin(
    minutesByCode: ReadonlyMap<string, readonly number[]>,
    from: number,
    to: number,
): Set<string> {
    const out = new Set<string>();
    for (const [code, mins] of minutesByCode) {
        for (const m of mins) {
            if (m > to) break; // 오름차순 — 지나쳤으면 없다
            if (m >= from) { out.add(code); break; }
        }
    }
    return out;
}

/**
 * 하루 전체 재적 스캔의 캐시 — 스캔이 **앵커 타점과 무관**하므로(같은 스냅샷·같은 N/M 이면 결과 동일)
 * 같은 날 다른 타점을 짚을 때 공짜다. 선례는 overlay.ts 의 minuteIndexCache(배열 자체를 WeakMap 키로).
 * 판정은 이 함수가 **selectHotUniverse 를 직접** 부른다 — 판정을 주입받고 캐시 키만 (N,M)으로 지으면
 * 나중에 주입 판정만 바뀌었을 때 조용히 낡은 캐시를 돌려주는 트랩이 된다(키와 계산 주체를 한 몸으로).
 */
const dayResidencyCache = new WeakMap<readonly ThemeSourceStock[], Map<string, Map<string, number[]>>>();
export function dayResidencyOf(
    stocks: readonly ThemeSourceStock[],
    amountN: number,
    rateN: number,
): ReadonlyMap<string, readonly number[]> {
    let byN = dayResidencyCache.get(stocks);
    if (!byN) {
        byN = new Map();
        dayResidencyCache.set(stocks, byN);
    }
    const key = `${amountN}|${rateN}`;
    const hit = byN.get(key);
    if (hit) return hit;
    const made = hotMinutesInRange(stocks, 0, 1439, minuteOfDayOf, (snaps) => selectHotUniverse(snaps, amountN, rateN));
    byN.set(key, made);
    return made;
}

/**
 * 조각들 위에서 거터 칩이 설 자리 — 우단 x 를 **덮는 조각**에서만 보간하고(갭 위에 없는 값을 지어내지
 * 않게), 없으면 가까운 왼쪽 조각의 끝점, 그것도 없으면(전부 오른쪽) 첫 조각의 첫 점으로 물러난다.
 * yAtX 는 구간 선형 보간이라 조각 하나 안에서만 안전하다 — 조각을 이어 붙여 부르면 이탈을 가로지른다.
 */
export function segmentAnchorAt(
    segments: readonly (readonly PathPoint[])[],
    x: number,
): PathPoint | null {
    if (segments.length === 0) return null;
    for (const seg of segments) {
        if (seg.length === 0) continue;
        if (seg[0].x <= x && seg[seg.length - 1].x >= x) {
            const y = yAtX(seg, x);
            if (y !== null) return { x, y };
        }
    }
    let left: PathPoint | null = null;
    for (const seg of segments) {
        if (seg.length === 0) continue;
        const last = seg[seg.length - 1];
        if (last.x < x) left = last;
    }
    return left ?? segments[0][0] ?? null;
}

/**
 * 재적 조각들 — 멤버의 선을 **순위에 들어 있던 구간만** 긋는다(이탈 = 조각 사이 끊김).
 *
 * 조각의 경계: 재적 분 a < b 는 **그 사이에 멤버의 봉이 있는데 재적이 아닌 분**이 있을 때만 갈린다.
 * 봉이 아예 없는 분은 잇는다 — 판정을 못 받은 분은 "모름"이지 "이탈"이 아니다(끊으면 얇은 종목이
 * 1분 결손마다 부서져 이탈이라는 어휘가 거짓말이 된다 — 장중 테이프가 틱 비트맵으로 이탈/기계결손을
 * 가른 것과 같은 구분). 조각 안의 봉 없는 분은 fillGaps 가 직전 종가로 채운다 — **fillGaps 는 조각
 * 안에서만 돌고 조각을 가로지르지 않는다**(재적 밖을 메우면 이탈이 사실로 둔갑한다).
 *
 * 1점 조각도 남긴다 — 1분만 떴다 사라진 것도 "떴다"는 사실이 보여야 한다(테이프와 같은 어휘, 점으로 그린다).
 */
export function memberSegments(
    from: number,
    to: number,
    series: MinuteSeries,
    hotMinutes: readonly number[],
): PathPoint[][] {
    if (hotMinutes.length === 0) return [];
    const presentBetween = (a: number, b: number): boolean => {
        for (let p = a + 1; p < b; p++) if (series.index.has(p)) return true;
        return false;
    };
    const runs: { from: number; to: number }[] = [];
    let cur: { from: number; to: number } | null = null;
    for (const m of hotMinutes) {
        if (cur && !presentBetween(cur.to, m)) cur.to = m;
        else {
            if (cur) runs.push(cur);
            cur = { from: m, to: m };
        }
    }
    if (cur) runs.push(cur);
    const out: PathPoint[][] = [];
    for (const r of runs) {
        const lo = Math.max(from, r.from);
        const hi = Math.min(to, r.to);
        if (lo > hi) continue;
        const seg = pathPoints(lo, hi, series);
        if (seg.length > 0) out.push(seg);
    }
    return out;
}

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
    anchor: NormLine,
    stocks: readonly ThemeSourceStock[],
    hotCodes: ReadonlySet<string>,
    toMinuteOfDay: (unixSec: number) => number,
    range: { from: number; to: number },
    /** 재적 모드의 재료(종목 → 재적 분). null = 하루 전체 모드(조각 1개 = 현행 그림). */
    residency: ReadonlyMap<string, readonly number[]> | null = null,
): ThemeLine[] {
    const self = stocks.find((s) => s.code === anchor.stockCode);
    const themes = new Set(self?.themes ?? []);
    if (themes.size === 0) return [];
    const { from, to } = range;
    const out: ThemeLine[] = [];
    for (const s of stocks) {
        if (s.code === anchor.stockCode || !hotCodes.has(s.code)) continue;
        if (!s.themes.some((t) => themes.has(t))) continue;
        const series = { index: minuteIndexOf(s.times, toMinuteOfDay), close: s.rate };
        if (residency) {
            const segments = memberSegments(from, to, series, residency.get(s.code) ?? []);
            if (segments.length > 0) out.push({ code: s.code, name: s.name ?? s.code, segments });
        } else {
            const points = memberPath(from, to, series);
            if (points) out.push({ code: s.code, name: s.name ?? s.code, segments: [points] });
        }
    }
    return out;
}
