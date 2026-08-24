// 정규화 겹치기의 **순수 계산** — 정규화 공간의 선·경계·라벨 배치. 옛 골격 패널의 기하 층을 승계했다
// (골격 = 손 피벗 정규화는 은퇴 — 이제 선은 실물 종가선이고, 정규화 재료는 useNormLines 가 만든다).
//
// ## 정규화 공간(사용자 확정 — 골격 시절의 공간을 원점만 자동으로 바꿔 승계)
//   · 일봉: y = 전일(D−1) 종가 대비 % (원점 0% = 전일 종가 — last 앵커를 사실상 전일 종가로 찍던 관행의 자동화).
//           x = **전일(D−1)로부터의** 거래일 오프셋 — 원점 (0,0)이 선 위의 한 점이고 당일 D 는 +1.
//           분봉과 같은 문장이 된다: "원점은 언제나 선 위의 점".
//   · 분봉: y = **전일 종가 대비 %p 차이** 공간 — 절대 배치(전일 종가 대비 %)를 평행이동해 타점 시각을
//           원점에 놓는다. 자기 가격 대비 %로 재기저하지 않는 이유: 테마 선(등락률 공간)과 **세로 간격이
//           보존**되고, 절대값 복원이 상수 하나(y + baseRate)로 남는다. x = 타점 시각으로부터의 분.
//
// ## 시간축을 늘리지 않는다
// 모든 선을 같은 폭에 채우면(각자 0..1 로 스케일) 그림은 예뻐지지만 **기간이 사라진다** — 3일에 빠진 것과
// 3주에 걸친 것이 같은 모양이 된다. 기간이 관심사인데 그걸 지우면 그림이 거짓말을 한다. 그래서 시간축은
// 공통 척도(모든 선의 t 범위 합집합)를 쓴다.

/**
 * 정규화된 선 하나 — 화면 좌표 이전의 값 공간(x=원점 대비 시간, y=원점 대비 %).
 * **기하만** 있는 공통 몸통이다 — 화면의 선 한 벌은 판별 유니온(OverlayLine)으로 받는다.
 */
export interface NormLine {
    /** 선의 식별키 — 차트 단위면 차트키(`종목|날짜`), 타점 단위(PointLine)면 타점키. */
    key: string;
    /** 이 선이 속한 차트(`종목|날짜`) — 차트 소유물(기준선)을 찾는 키. 차트 단위에선 key 와 같다. */
    chartKey: string;
    stockCode: string;
    date: string;
    points: { x: number; y: number }[];
    /** 기준 가격 — **같은 % 공간으로 다른 가격을 끌어오는 환산 계수**(기준선·D선을 얹을 때). */
    basePrice: number;
    /**
     * y 공간의 평행이동량(%) — 가격 → y 환산은 언제나 `pct(price, basePrice) − baseRate` 다.
     * 일봉은 전일 종가 자신이 원점이라 0. 분봉은 원점(타점 시각 종가)의 전일比%.
     * 절대값 복원이 이 상수 하나다: **전일 종가 대비 % = y + baseRate**.
     */
    baseRate: number;
    /** 원점의 원 t — 벽시계 값(타점 시각·거래일 인덱스)을 이 선의 x 로 옮길 때 뺀다. */
    baseT: number;
}

/** 차트 단위 선(일봉 정규화) — key = 차트키. */
export interface ChartLine extends NormLine {
    kind: "chart";
}

/**
 * 타점 단위 선(분봉 정규화) — 선 하나 = **타점 하나**(차트를 올리면 그 차트의 전 타점이 각각 선이 된다).
 * 자기 시각이 원점(0,0)이다: 과거는 왼쪽 실선, **미래(그 시각 이후)는 오른쪽 점선** —
 * "그 타점에 선 눈"으로 여러 상황을 겹친다. key 는 타점키(pk)라 이동(goToPoint)이 타점 문법을 그대로 탄다.
 */
export interface PointLine extends NormLine {
    kind: "point";
    /** 타점 시각(HH:MM:SS) — 라벨(`날짜 종목 시각`)과 이동(goToPoint)의 재료. */
    time: string;
    /** 원점(자기 시각)의 인덱스 — 이 뒤가 미래(점선). */
    splitIdx: number;
}

/**
 * 화면의 선 하나 — kind 로 갈린다. `time?` truthiness 로 가르면 분기가 흩어질 때 컴파일러가 못 잡는다
 * (골격 시절에 겪은 것) — 판별 유니온이면 잡는다.
 */
export type OverlayLine = ChartLine | PointLine;

/**
 * 가격 → 기준 대비 %. 선과 얹는 것(기준선·D선·캔들)이 **같은 함수**를 타야 한 공간에 놓인다 —
 * 따로 환산하면 미세하게 어긋나도 그림으로는 안 보인다.
 */
export const pct = (price: number, basePrice: number): number => (price / basePrice - 1) * 100;

/** 값 공간의 경계. 비어 있으면 null(빈 화면 — 0으로 나누지 않는다). */
export interface OverlayBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/** 여러 선의 공통 경계. y 는 0(원점 선)을 항상 포함시킨다 — 기준선이 화면 밖이면 읽을 수가 없다. */
export function overlayBounds(items: readonly NormLine[]): OverlayBounds | null {
    if (items.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = 0;
    let maxY = 0;
    for (const s of items) {
        for (const p of s.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
    return { minX, maxX, minY, maxY };
}

/**
 * 이상치를 뺀 초기 범위 — 값들의 [q, 1−q] 분위수.
 *
 * 공통 척도의 유일한 실질 문제가 이것이다: +300% 짜리 하나가 나머지를 전부 바닥에 눌러버린다.
 * **자르는 게 아니라 초기 뷰만 좁히는 것**이라 잘린 선은 확대·이동으로 그대로 닿는다(정보를 안 버린다).
 * 0(원점 선)은 언제나 포함 — 기준이 화면 밖이면 되돌림을 읽을 수가 없다.
 */
export function trimmedBounds(items: readonly NormLine[], q: number): OverlayBounds | null {
    if (items.length === 0 || q <= 0) return overlayBounds(items);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of items) for (const p of s.points) { xs.push(p.x); ys.push(p.y); }
    if (xs.length === 0) return null;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const lo = (v: number[]): number => v[Math.floor((v.length - 1) * q)];
    const hi = (v: number[]): number => v[Math.ceil((v.length - 1) * (1 - q))];
    return { minX: Math.min(lo(xs), 0), maxX: Math.max(hi(xs), 0), minY: Math.min(lo(ys), 0), maxY: Math.max(hi(ys), 0) };
}

/**
 * 일봉 정규화 뷰의 기본 창(사용자 확정 — 상수): **뒤로 60일 · 앞으로 2일 · −60%~+40%**.
 * 데이터에서 뽑지 않는 이유: 항목을 바꿔도 같은 되돌림이 같은 크기로 서야 비교가 된다(공통 척도 원칙).
 * 원점(전일 종가)이 오른쪽 — 과거가 창의 대부분을 차지한다(옛 last 앵커 창의 승계).
 *
 * 앞 여백이 10 → 2 로 줄어든 건 이름이 **거터로 나갔기** 때문이다. 예전엔 칩이 선 끝(당일 D, x=+1)에
 * 붙어 여백이 그 자리였는데, 이제 그림엔 글자가 없으니 여백은 **D 봉이 가장자리에 닿지 않을 만큼**이면
 * 족하다. 남는 폭은 과거(왼쪽)로 간다 — 이 뷰의 관심사가 "그날까지 어떻게 왔나"라서.
 */
export const DAILY_FRAME = { back: 60, forward: 2, minY: -60, maxY: 40 } as const;


export const dailyFrame = (): OverlayBounds =>
    ({ minX: -DAILY_FRAME.back, maxX: DAILY_FRAME.forward, minY: DAILY_FRAME.minY, maxY: DAILY_FRAME.maxY });

/**
 * 분봉 타점 정규화 뷰의 기본 창(사용자 확정 — 일봉과 같은 상수 창): **타점 이전 60분 · 이후 10분 · ±20%p**.
 * 이 뷰의 관심사가 "타점 이전에 무슨 일이 있었나"라 과거(왼쪽)가 창의 대부분을 차지한다.
 */
export const POINT_FRAME = { back: 60, forward: 10, minY: -20, maxY: 20 } as const;

/**
 * `includeFuture` 면 **양의 쪽만** 데이터까지 넓힌다 — "타점 뒤로 어디까지 갔나"를 볼 때. 축소로도 닿지만
 * 기본 창에서 한 번에 보고 싶다는 요구(사용자)에 대한 답이고, 원위치(리셋)도 이 창으로 돌아온다.
 */
export function pointUnitFrame(items: readonly NormLine[], q: number, includeFuture = false): OverlayBounds | null {
    if (items.length === 0) return null;
    const base: OverlayBounds = { minX: -POINT_FRAME.back, maxX: POINT_FRAME.forward, minY: POINT_FRAME.minY, maxY: POINT_FRAME.maxY };
    if (!includeFuture) return base;
    const t = trimmedBounds(items, q);
    return t ? { ...base, maxX: Math.max(base.maxX, t.maxX), maxY: Math.max(base.maxY, t.maxY) } : base;
}

/**
 * 금액 라벨 솎기 — **두 단계, 둘 다 같은 종목 안에서만**(사용자 확정).
 *
 * ① **선 × 세그먼트당 최대 하나**: 각 선이 각 세그먼트에서 자기 최대 하나만 낸다.
 *    한 선의 긴 급등 구간이 그 선의 라벨을 독차지하지 못한다.
 * ② **선 × 화면 x 격자**: 축소로 세그먼트가 좁아지면 **그 선의** 이웃 세그먼트끼리 합쳐진다.
 *
 * ## 경쟁은 종목을 가로지르지 않는다
 * 전 선이 한 격자에서 겨루면 대형주 하나가 화면의 라벨을 다 가져간다. **7종목이면 한 세그먼트에
 * 7개가 있어야 한다**(사용자) — 종목끼리는 안 겨루고, 겹치면 자리를 옮겨서(spreadByY) 전부 보여준다.
 *
 * ## 왜 x 한 방향인가
 * (x, y) 2차원 격자였을 땐 급등 구간이 y 칸을 여러 개 지나가 숫자 기둥이 섰다(사용자 지적).
 * 확대하면 칸이 쪼개지며 가려졌던 것들이 드러난다 — 그래서 값 좌표가 아니라 **화면 좌표**(x)를 받는다.
 */
export function pickAmountLabels<T extends { group: string; seg: number; x: number; value: number }>(
    items: readonly T[],
    cellW: number,
): T[] {
    const perSeg = new Map<string, T>();
    for (const it of items) {
        const k = `${it.group}|${it.seg}`;
        const cur = perSeg.get(k);
        if (!cur || it.value > cur.value) perSeg.set(k, it);
    }
    const perCell = new Map<string, T>();
    for (const it of perSeg.values()) {
        // 격자 키에 **종목이 들어간다** — 다른 종목끼리는 같은 칸에 있어도 서로를 밀어내지 않는다.
        const k = `${it.group}|${Math.floor(it.x / cellW)}`;
        const cur = perCell.get(k);
        if (!cur || it.value > cur.value) perCell.set(k, it);
    }
    return [...perCell.values()];
}

/**
 * 벽시계 분 → 세그먼트 번호. 경계는 **오름차순**이어야 한다.
 * 첫 경계 앞은 −1, 마지막 경계 뒤는 마지막 세그먼트에 든다(끝점이 자기 구간을 잃지 않게).
 */
export function segmentIndexOf(boundaries: readonly number[], minute: number): number {
    if (boundaries.length < 2) return 0;
    if (minute < boundaries[0]) return -1;
    for (let i = 0; i + 1 < boundaries.length; i++) if (minute <= boundaries[i + 1]) return i;
    return boundaries.length - 2;
}

/**
 * `times[]`(unix 초) → 벽시계 분 → 인덱스 — **여기가 유일한 출처다**(캐시 포함).
 *
 * 같은 스냅샷을 상대로 소비자가 여럿이다(테마 hot 판정 · 테마 선 · 거래대금 조회기 두 벌) —
 * 각자 색인을 다시 지으면 클릭 하나에 같은 배열을 여러 번 훑는다(30종목 × ~720분).
 * `times` 배열 자체를 키로 WeakMap 에 캐시한다: 스냅샷이 놓이면 색인도 같이 놓이고, 배열이 같으면
 * 내용도 같다(불변 재료). ⚠ 반환 맵은 공유물이다 — 그래서 ReadonlyMap 으로 낸다(수정 금지).
 */
const minuteIndexCache = new WeakMap<readonly number[], { toMinute: (unixSec: number) => number; map: Map<number, number> }>();
export function minuteIndexOf(times: readonly number[], toMinute: (unixSec: number) => number): ReadonlyMap<number, number> {
    const hit = minuteIndexCache.get(times);
    if (hit && hit.toMinute === toMinute) return hit.map;
    const m = new Map<number, number>();
    for (let i = 0; i < times.length; i++) m.set(toMinute(times[i]), i);
    minuteIndexCache.set(times, { toMinute, map: m });
    return m;
}

/** 누적 거래대금 + 분 인덱스 → "그 분의 거래대금" 조회기. 인접 차분이 곧 분봉 거래대금이다. */
export function minuteAmountOf(
    minuteIndex: ReadonlyMap<number, number>,
    cumAmount: readonly number[],
): (minute: number) => number | null {
    return (m) => {
        const i = minuteIndex.get(m);
        if (i == null) return null;
        const v = cumAmount[i] - (i > 0 ? cumAmount[i - 1] : 0);
        return Number.isFinite(v) ? v : null;
    };
}

/**
 * 분 시계열의 **내부 갭만** 직전 실값으로 채운다 — "모든 시간에 값이 있다"(사용자 확정, 선·테마·캔들
 * 공통) 규칙의 공용 알고리즘. 테마 선(memberPath)과 캔들이 같은 걸음을 탄다.
 *
 * 채움은 **다음 실제 값이 나올 때만** 확정된다(pending) — 마지막 실값 뒤의 채움은 버려진다.
 *   · 선두 갭(첫 실값 이전)은 끌어올 직전 값이 없어 안 채운다.
 *   · 후미 갭(마지막 실값 이후)은 장이 끝난 뒤라 안 채운다 — 안 그러면 20시 이후까지 평탄 값이
 *     줄줄이 뻗어 없는 시간을 그린다(사용자 지적).
 * 도메인 densifyMinutes 의 규칙("각 시장의 첫 봉~마지막 봉 사이")과 같은 경계다.
 *
 * `at(m)` 은 셋 중 하나를 낸다 — 실값 T / `"gap"`(재료 없음 — 내부면 채운다) / `"skip"`(병적인 값 —
 * 채우지도 잇지도 않고 그 분만 버린다).
 */
export function fillGaps<T extends object>(
    from: number,
    to: number,
    at: (minute: number) => T | "gap" | "skip",
    fillOf: (minute: number, prev: T) => T,
): T[] {
    const out: T[] = [];
    const pending: T[] = [];
    let prev: T | null = null;
    for (let m = from; m <= to; m++) {
        const v = at(m);
        if (v === "gap") {
            if (prev !== null) pending.push(fillOf(m, prev));
            continue;
        }
        if (v === "skip") continue;
        if (pending.length > 0) { out.push(...pending); pending.length = 0; }
        prev = v;
        out.push(v);
    }
    return out;
}

/**
 * 폴리라인을 x0 에서 과거(x ≤ x0)/미래(x ≥ x0)로 가른다 — 경계점은 **양쪽에 포함**(선이 끊겨 보이지 않게).
 * 분봉 선은 원점 분에 정확히 점이 있어(dense 분봉) 보간이 필요 없다 — x0 에 점이 없으면 그 구간이 빈 채 갈라진다.
 */
export function splitAtX<P extends { x: number }>(points: readonly P[], x0: number): { past: P[]; future: P[] } {
    return { past: points.filter((p) => p.x <= x0), future: points.filter((p) => p.x >= x0) };
}

/**
 * 폴리라인 위 x 지점의 y — 구간 선형 보간. 호버 판독("이 선의 이 시각 값")이 쓴다.
 * 범위 밖이면 null(끝점을 연장해 지어내지 않는다). x 오름차순 가정 — 선·테마 경로가 전부 그렇다.
 */
export function yAtX(points: readonly { x: number; y: number }[], x: number): number | null {
    if (points.length === 0) return null;
    if (x < points[0].x || x > points[points.length - 1].x) return null;
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (x < a.x || x > b.x) continue;
        const span = b.x - a.x;
        return span === 0 ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / span;
    }
    return points[points.length - 1].y; // x === 마지막 점
}

/**
 * 점 솎기 — `step` 개마다 하나, **첫 점과 끝점은 언제나 남긴다**(끝이 잘리면 선이 짧아 보인다).
 *
 * 1분이 화면에서 0.5px 이면 이웃 점은 **서브픽셀**이라 넷 중 하나만 그려도 눈으로 완전히 같다.
 * 확대하면 step 이 1로 돌아와 저절로 촘촘해진다 — 정보를 버리는 게 아니라 **배율에 맞추는** 것이다.
 */
export function decimate<T>(points: readonly T[], step: number): readonly T[] {
    if (step <= 1 || points.length <= 2) return points;
    const out: T[] = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

/**
 * 이 배율에서 점 간격이 `targetPx` 가 되는 솎기 간격. 축소할수록 커진다(상한 60 — 그 이상은
 * 형태가 뭉개지기 시작한다). `pxPerUnit` 이 0 이하(퇴화 스케일)면 솎지 않는다.
 */
export const decimateStep = (pxPerUnit: number, targetPx: number): number =>
    pxPerUnit <= 0 ? 1 : Math.max(1, Math.min(60, Math.round(targetPx / pxPerUnit)));

/**
 * 보이는 x 구간만 남긴다 — **양 끝은 한 점씩 더 물고 자른다**(경계에서 선이 짧게 끝나 보이지 않게).
 * 솎기와 짝을 이루는 나머지 절반이다: 확대하면 점이 다시 촘촘해지는데 그중 화면에 있는 건 수십 개뿐이다.
 */
export function clipToX<T extends { x: number }>(points: readonly T[], from: number, to: number): readonly T[] {
    if (points.length === 0) return points;
    if (points[0].x >= from && points[points.length - 1].x <= to) return points; // 통째로 안에 있으면 그대로
    let lo = 0;
    while (lo + 1 < points.length && points[lo + 1].x < from) lo++;
    let hi = points.length - 1;
    while (hi > lo && points[hi - 1].x > to) hi--;
    return points.slice(lo, hi + 1);
}

/** 폴리라인 points 속성 문자열(화면 좌표). 소수 2자리로 끊어 DOM 문자열이 불필요하게 길어지지 않게. */
export function polylinePoints(points: readonly { x: number; y: number }[], sx: (x: number) => number, sy: (y: number) => number): string {
    return points.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
}

/**
 * 겹쳐 그리기의 선 불투명도 — **개수에 반비례하되 바닥이 있다**.
 *
 * 고정값을 쓰면 20개일 때는 흐리고 500개일 때는 화면이 까맣게 찬다. 개수를 따라 낮추면 겹친 그림이
 * **밀도 지도**가 된다 — 많이 겹치는 경로는 진해지고 드문 경로는 흐려진다. 1/√n 은 겹침 그림의 흔한 어림.
 * 바닥(0.06): 아무리 많아도 한 화면에서 읽히는 정도는 보장. 계수·상한은 사용자 확정(기본은 흐리게).
 */
export const lineOpacity = (n: number): number => (n <= 0 ? 0 : Math.min(0.45, Math.max(0.06, 1.2 / Math.sqrt(n))));

/** 강조 중일 때 나머지의 불투명도 — 기본값에 **비례**한다. 고정값이면 개수가 많을 때 흐림이 기본보다 진해진다. */
export const dimOpacity = (n: number): number => Math.max(0.015, lineOpacity(n) * 0.25);

/**
 * 선 하나가 지금 어떤 역할인가 — **색을 정하는 값**.
 *   · selected : 시선(subject) — focus 를 따라 굵게 서는 하나
 *   · group    : 뭉친 라벨 뱃지에 손이 올라가 그 무리가 켜진 것. 멤버마다 다른 색을 받아 목록과 짝지어진다
 *   · hovered  : 지금 손이 가리키는 것
 *   · base     : 나머지
 */
export type LineRole = "selected" | "group" | "hovered" | "base";

/** 선 하나의 표시 규격. 색은 역할이 정하고(팔레트는 화면의 몫), 굵기·흐림은 여기서 정한다. */
export interface LineVisual {
    role: LineRole;
    width: number;
    /** 강조된 게 하나라도 있는데 이건 아닌가 — 흐리게 그릴지. */
    dim: boolean;
    /**
     * 강조 무리(시선·그룹)에 **속하지만** 지금 짚고 있는 건 아닌가 — 한 걸음 물러나 그릴지.
     * 색은 그대로 두고 진하기만 낮춘다 — 색이 바뀌면 목록↔그림을 잇는 유일한 끈이 끊긴다.
     */
    recede: boolean;
}

/**
 * 강조 상태 → 표시 규격. 우선순위는 selected → group → hovered 다. group 이 hovered 보다 위인 게
 * 핵심인데, 그러지 않으면 목록 행에 손을 올린 순간 그 선만 색이 바뀌어 색으로 짝을 찾던 대응이 끊긴다.
 * 대신 굵기로 답하고(짚은 것은 더 굵게), 나머지 무리는 recede 로 물러난다.
 *
 * ## recede 는 **모든 역할에 붙는다**(사용자 지적 — 겹쳤을 때 호버해도 남이 안 죽어서 잘 안 보였다)
 * 예전엔 base 역할이 recede 를 안 받았다: base 는 `dim`(무언가 강조돼 있으면 항상 참)만 봤는데, 그
 * 값은 호버 여부와 무관하게 늘 같은 수라 "호버하면 남이 더 흐려진다"가 base 항목엔 아예 안 먹혔다
 * (고정만 해 둔 항목들이 대개 base다). recede 는 오직 "지금 이 순간 딴 걸 짚고 있나"만 보므로, 호출부가
 * `recede` 를 `dim` 보다 먼저 검사하면 호버 중엔 base 도 한 단계 더 죽는다(호출부 우선순위가 계약이다).
 */
export function lineVisual(key: string, ctx: {
    selected: ReadonlySet<string>;
    hovered: string | null;
    group: ReadonlySet<string> | null;
}): LineVisual {
    const anyLit = ctx.selected.size > 0 || ctx.hovered !== null || (ctx.group?.size ?? 0) > 0;
    const recede = ctx.hovered !== null && key !== ctx.hovered;
    if (ctx.selected.has(key)) return { role: "selected", width: key === ctx.hovered ? 2.5 : 2, dim: false, recede };
    if (ctx.group?.has(key)) return { role: "group", width: key === ctx.hovered ? 2.5 : 1.75, dim: false, recede };
    if (key === ctx.hovered) return { role: "hovered", width: 2, dim: false, recede: false };
    return { role: "base", width: 1.25, dim: anyLit, recede };
}

/**
 * 거터 칩이 가리키는 점 — **지금 보이는 창에서 선이 잘리는 자리**(사용자 확정).
 *
 * 옛 규칙(경로의 한쪽 끝 고정)은 확대하면 그 끝이 화면 밖으로 나가 그 선이 목록에서 통째로 사라졌다.
 * 새 규칙: 선의 **최신 쪽 끝**을 기준으로 하되,
 *   · 끝이 오른쪽 창 밖이면 오른쪽 가장자리에서 선의 y 를 보간해 그 자리에
 *   · 그 y 가 세로 창 밖이면 위/아래 가장자리로 클램프(세로 확대로 잘린 선도 손잡이는 남는다)
 * 선이 x 창과 아예 안 겹치면 null — 화면에 없는 선의 라벨을 지어내지 않는다.
 */
export function labelAnchorAt(
    points: readonly { x: number; y: number }[],
    view: OverlayBounds,
): { x: number; y: number } | null {
    if (points.length === 0) return null;
    if (points[0].x > view.maxX || points[points.length - 1].x < view.minX) return null; // x 창과 안 겹침
    const last = points[points.length - 1];
    const x = Math.min(last.x, view.maxX);
    const rawY = x === last.x ? last.y : yAtX(points, x);
    if (rawY === null) return null;
    const y = Math.min(view.maxY, Math.max(view.minY, rawY));
    return { x, y };
}
