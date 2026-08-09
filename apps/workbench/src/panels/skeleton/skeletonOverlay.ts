// 골격 겹쳐 그리기의 **순수 계산** — 정규화(앵커 기준)와 화면 좌표 배치. 렌더에서 떼어낸 이유는
// 앵커 토글이 규칙이지 그림이 아니기 때문이다(첫 점 기준과 마지막 점 기준은 부호가 반대라 눈으로 못 잡는다).
//
// ## 정규화 = 앵커 피벗을 원점으로
// 골격마다 가격 스케일도 절대 시각도 다르므로, 한 피벗을 골라 (0%, t=0) 으로 맞춘다.
//   · first(P1)  — 시작점에서 모여 앞으로 퍼진다. 본상승 크기 비교에 맞다(t ≥ 0).
//   · last(P마지막) — **당일 직전이 한 점으로 정렬**되어 뒤로 퍼진다. "지금 여기서 뒤를 돌아본" 그림(t ≤ 0).
//
// ## 시간축을 늘리지 않는다
// 모든 골격을 같은 폭에 채우면(각자 0..1 로 스케일) 그림은 예뻐지지만 **기간이 사라진다** — 3일에 빠진 것과
// 3주에 걸친 것이 같은 모양이 된다. 기간이 관심사인데 그걸 지우면 그림이 거짓말을 한다. 그래서 시간축은
// 공통 척도(모든 골격의 t 범위 합집합)를 쓴다.
import type { SkeletonWirePivot } from "@trade-data-manager/wire";

/** 정규화 기준 피벗. */
export type SkeletonAnchor = "first" | "last";

/**
 * 정규화된 골격 하나 — 화면 좌표 이전의 값 공간(x=기준 대비 시간, y=기준 대비 %).
 * 일봉·분봉 둘 다 **차트 소유**라 선 하나 = (종목, 날짜)이고 key = 차트키다.
 * 타점에서 출발시키면 (종목,날짜)에 타점이 여섯일 때 같은 골격을 여섯 번 겹쳐 그려 진해 보인다.
 * **기하만** 있는 공통 몸통이다 — 화면의 선 한 벌은 판별 유니온(OverlayLine)으로 받는다.
 */
export interface NormalizedSkeleton {
    /** 선의 식별키 — 차트 단위면 차트키(`종목|날짜`), 타점 단위(PointSkeleton)면 타점키. */
    key: string;
    /** 이 선이 속한 차트(`종목|날짜`) — 차트 소유물(기준선·태그)을 찾는 키. 차트 단위에선 key 와 같다. */
    chartKey: string;
    stockCode: string;
    date: string;
    /** synthetic = 타점 종가 합성점(분봉) — 손 피벗과 구분해 그린다(속 빈 원). */
    points: { x: number; y: number; synthetic?: boolean }[];
    /** 기준 가격 — **같은 % 공간으로 다른 가격을 끌어오는 환산 계수**(기준선·D선을 얹을 때). */
    basePrice: number;
    /**
     * y 공간의 평행이동량(%) — 가격 → y 환산은 언제나 `pct(price, basePrice) − baseRate` 다.
     * 차트 단위(일봉)는 앵커 피벗 자신이 원점이라 0. 타점 단위는 **전일 종가 대비 %p 공간**(사용자 확정)
     * 이라 r_앵커(t₀). 절대값 복원이 이 상수 하나다: **전일 종가 대비 % = y + baseRate**.
     */
    baseRate: number;
    /** 기준 피벗의 원 t — 벽시계 값(타점 시각 등)을 이 골격의 x 로 옮길 때 뺀다. */
    baseT: number;
}

/** 차트 단위 선(일봉 정규화) — key = 차트키. */
export interface ChartSkeleton extends NormalizedSkeleton {
    kind: "chart";
}

/**
 * 타점 단위 골격 — 분봉 뷰의 선 하나 = **타점 하나**(사용자 확정: 골격 1 + 타점 3 → 선 3개).
 * 자기 시각의 경로 피벗이 원점(0,0)이다: 과거는 왼쪽 실선, **미래(그 시각 이후)는 오른쪽 점선** —
 * "그 타점에 선 눈"으로 여러 상황을 겹친다. key 는 타점키(pk)라 선택·태그가 타점 문법을 그대로 탄다.
 * y 공간은 전일 종가 대비 %p 차이(pointSkeletons 주석) — 절대값은 baseRate·baseT 로 복원한다.
 */
export interface PointSkeleton extends NormalizedSkeleton {
    kind: "point";
    /** 타점 시각(HH:MM:SS) — 라벨(`날짜 종목 시각`)과 이동(goToPoint)의 재료. */
    time: string;
    /** 원점(자기 시각 피벗)의 인덱스 — 이 뒤가 미래(점선). */
    splitIdx: number;
}

/**
 * 화면의 선 하나 — kind 로 갈린다. 예전엔 `time?: string` 의 truthiness 로 갈랐는데, 분기가 네 곳
 * (태그 정션·라벨·이동·발끝 태그)이라 새 분기가 하나라도 빠지면 컴파일러가 못 잡았다. 판별 유니온이면 잡는다.
 */
export type OverlayLine = ChartSkeleton | PointSkeleton;

/** `HH:MM(:SS)` → 자정 기준 분. 분봉 골격의 t(벽시계 분)와 타점 시각을 잇는 유일한 환산. */
export const minutesOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/**
 * 차트 하나의 분봉 골격을 **타점마다** 재정규화한다. 타점 시각의 피벗은 합성 규칙("타점 종가 = 골격의 한 점")
 * 덕에 반드시 있다 — 없으면(방어) 그 타점은 지어내지 않고 건너뛴다. 피벗 2개 미만이면 골격이 아니다.
 *
 * ## y 는 자기 가격 대비 %가 아니라 **전일 종가 대비 %p 차이**다(사용자 확정)
 * 절대 배치(전일 종가 대비 %)를 통째로 평행이동해 타점을 원점에 놓는 것 — 그래서 테마 선(등락률 공간)과
 * **세로 간격이 그대로 보존**된다("내 종목 기준 테마가 어디에 있나"가 이 뷰의 질문이다). 자기 가격 대비 %로
 * 재기저하면 그 간격이 무너지고, 절대값 복원도 선마다 다른 곱셈이 된다 — 지금은 상수 하나(y + baseRate)다.
 * prevClose 없으면(전일 미수집) 분모가 없다 — 빈 배열(호출측이 결손으로 센다. 지어내지 않는다).
 */
export function pointSkeletons(
    pivots: readonly SkeletonWirePivot[],
    prevClose: number | undefined,
    pts: readonly { pk: string; time: string }[],
    chart: { key: string; stockCode: string; date: string },
): PointSkeleton[] {
    if (pivots.length < 2 || prevClose == null || prevClose <= 0) return [];
    const out: PointSkeleton[] = [];
    for (const p of pts) {
        const t0 = minutesOf(p.time);
        const idx = pivots.findIndex((v) => v.t === t0);
        if (idx < 0) continue;
        const base = pivots[idx];
        if (base.price <= 0) continue;
        const baseRate = pct(base.price, prevClose);
        out.push({
            kind: "point",
            key: p.pk,
            chartKey: chart.key,
            stockCode: chart.stockCode,
            date: chart.date,
            time: p.time,
            basePrice: prevClose,
            baseRate,
            baseT: base.t,
            splitIdx: idx,
            points: pivots.map((v) => ({ x: v.t - base.t, y: pct(v.price, prevClose) - baseRate, ...(v.synthetic ? { synthetic: true } : {}) })),
        });
    }
    return out;
}

/** 값 공간의 경계. 비어 있으면 null(빈 화면 — 0으로 나누지 않는다). */
export interface OverlayBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/**
 * 골격 하나를 앵커 기준으로 정규화한다. 피벗 2개 미만이거나 앵커 가격이 0 이하면 null
 * (그릴 수 없는 것을 0으로 지어내지 않는다 — 축 규칙 3과 같은 태도).
 */
export function normalizeSkeleton(
    pivots: readonly SkeletonWirePivot[],
    anchor: SkeletonAnchor,
    owner: { key: string; stockCode: string; date: string },
): ChartSkeleton | null {
    if (pivots.length < 2) return null;
    const base = anchor === "first" ? pivots[0] : pivots[pivots.length - 1];
    if (base.price <= 0) return null;
    return {
        ...owner,
        kind: "chart",
        chartKey: owner.key,
        basePrice: base.price,
        baseRate: 0,
        baseT: base.t,
        points: pivots.map((p) => ({ x: p.t - base.t, y: pct(p.price, base.price), ...(p.synthetic ? { synthetic: true } : {}) })),
    };
}

/**
 * 가격 → 앵커 대비 %. 골격 피벗과 얹는 선(기준선·D선)이 **같은 함수**를 타야 한 공간에 놓인다 —
 * 선을 따로 환산하면 골격은 수정주가, 선은 원주가처럼 미세하게 어긋나도 그림으로는 안 보인다.
 */
export const pct = (price: number, basePrice: number): number => (price / basePrice - 1) * 100;

/** 여러 골격의 공통 경계. y 는 0(앵커 선)을 항상 포함시킨다 — 기준선이 화면 밖이면 읽을 수가 없다. */
export function overlayBounds(items: readonly NormalizedSkeleton[]): OverlayBounds | null {
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
 * **자르는 게 아니라 초기 뷰만 좁히는 것**이라 잘린 골격은 확대·이동으로 그대로 닿는다(정보를 안 버린다).
 * 0(앵커 선)은 언제나 포함 — 기준이 화면 밖이면 되돌림을 읽을 수가 없다.
 */
export function trimmedBounds(items: readonly NormalizedSkeleton[], q: number): OverlayBounds | null {
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
 * 일봉 정규화 뷰의 기본 창(사용자 확정 — 상수): **뒤로 60일 · 앞으로 10일 · −60%~+40%**.
 * 데이터에서 뽑지 않는 이유는 절대 뷰와 같다 — 필터를 바꿔도 같은 되돌림이 같은 크기로 서야 비교가 된다.
 * 앵커를 첫 점으로 뒤집으면 시간이 앞으로 퍼지므로 x 창도 뒤집는다(관심 쪽이 넓은 쪽).
 */
export const DAILY_FRAME = { back: 60, forward: 10, minY: -60, maxY: 40 } as const;

export const dailyFrame = (anchor: SkeletonAnchor): OverlayBounds =>
    anchor === "last"
        ? { minX: -DAILY_FRAME.back, maxX: DAILY_FRAME.forward, minY: DAILY_FRAME.minY, maxY: DAILY_FRAME.maxY }
        : { minX: -DAILY_FRAME.forward, maxX: DAILY_FRAME.back, minY: DAILY_FRAME.minY, maxY: DAILY_FRAME.maxY };

/**
 * 분봉 타점 정규화 뷰의 기본 창(사용자 확정 — 일봉과 같은 상수 창): **타점 이전 60분 · 이후 10분 · ±20%p**
 * (y 는 전일 종가 대비 %p 차이 공간). 이 뷰의 관심사가 "타점 이전에 무슨 일이 있었나"라 과거(왼쪽)가
 * 창의 대부분을 차지한다. 데이터에서 뽑지 않는 이유는 일봉 뷰와 같다 — 필터를 바꿔도 같은 움직임이
 * 같은 크기로 서야 비교가 된다.
 */
export const POINT_FRAME = { back: 60, forward: 10, minY: -20, maxY: 20 } as const;

/**
 * `includeFuture` 면 **양의 쪽만** 데이터까지 넓힌다 — "타점 뒤로 어디까지 갔나"를 볼 때. 축소로도 닿지만
 * 기본 창에서 한 번에 보고 싶다는 요구(사용자)에 대한 답이고, 원위치(리셋)도 이 창으로 돌아온다.
 */
export function pointUnitFrame(items: readonly NormalizedSkeleton[], q: number, includeFuture = false): OverlayBounds | null {
    if (items.length === 0) return null;
    const base: OverlayBounds = { minX: -POINT_FRAME.back, maxX: POINT_FRAME.forward, minY: POINT_FRAME.minY, maxY: POINT_FRAME.maxY };
    if (!includeFuture) return base;
    const t = trimmedBounds(items, q);
    return t ? { ...base, maxX: Math.max(base.maxX, t.maxX), maxY: Math.max(base.maxY, t.maxY) } : base;
}

/**
 * 골격 선을 **분 단위로 자른 조각**(런) — 거래대금을 **굵기**로 싣기 위한 재료.
 *
 * ## 왜 선분(피벗~피벗)이 아니라 분인가
 * 선분 하나에 값 하나면 그 값은 구간 **평균**이 된다. 60분 구간에서 09:32 에 200억이 터지고 나머지가
 * 조용하면 평균은 3억이라 **스파이크가 통째로 지워진다**. 형태(직선)는 그대로 두고 세 번째 차원만
 * 분 해상도로 올린다.
 *
 * ## 왜 색이 아니라 굵기인가(사용자 확정)
 * 처음엔 절대 구간 색을 획에 실었는데 **2px 획은 색을 담을 면적이 없었다** — 8단계가 구분이 안 되고,
 * 조용한 구간까지 다시 칠하느라 선 본연의 색(선택 파랑)까지 잃었다. 굵기는 크기 채널이라
 * ① 30선이 얽혀도 굵은 자리가 살아남고 ② "굵다=크다"에 범례가 필요 없고 ③ 축소해도 안 사라진다.
 * 정확한 값은 희소한 채널(숫자 라벨)이 따로 답한다 — 같은 값을 두 밀도로 말해 서로를 보강한다.
 *
 * ## 왜 런으로 합치는가 — 그리고 왜 **꼭짓점을 버리면 안 되는가**
 * 하루면 분 조각이 400개, 테마 30선이면 12,000개다. 같은 단계가 이어지면 하나로 합쳐야 실제 개수가
 * 수십 개로 떨어진다. 그런데 **런을 양 끝점만 든 직선으로 합치면 그 사이의 꺾임이 통째로 사라진다** —
 * 조용한 구간이 대부분이라 병합이 거의 모든 피벗을 가로질러, 골격이 현(弦)으로 뭉개졌다(실제로 겪은 버그:
 * 점은 제자리인데 선만 가로질러 가고, 글로우(진짜 경로)와 굵기 선이 갈라져 보였다).
 * 그래서 런은 **점 목록**을 든다: 합칠 때 끝점을 옮기는 게 아니라 점을 **덧붙인다**. 병합 이득은 그대로면서
 * 꼭짓점이 하나도 안 없어진다.
 */
export interface AmountRun {
    /** 이 런이 덮는 경로(선 좌표, 2점 이상) — 꺾임을 그대로 담는다. */
    points: { x: number; y: number }[];
    /** 굵기 단계(호출측이 정한 값). **0 = 구간 아래**(조용함) · **−1 = 재료 없음**(분봉 결손). */
    level: number;
    /** 이 런 안 분당 거래대금의 최대(원) — 값 라벨이 쓴다. 재료가 없으면 0. */
    maxAmount: number;
    /** 그 최대가 난 자리(선 좌표) — 라벨을 **터진 그 분**에 붙이려고. 런 중점은 사건 위치가 아니다. */
    maxAt: { x: number; y: number };
}

/** 구간 아래 / 재료 없음 — 그리는 쪽이 둘을 구분해야 한다(조용한 것과 모르는 것은 다르다). */
export const LEVEL_QUIET = 0;
export const LEVEL_MISSING = -1;

/** 병적인 입력(일봉 좌표를 잘못 넘기는 등)에서 조각이 폭주하지 않게 하는 상한. */
const MAX_RUN_MINUTES = 2000;

/**
 * 선 하나 → 분 단위 런. `baseT` 는 x 를 벽시계 분으로 되돌린다(절대 배치는 0이라 항등).
 * `amountAt(m)` = m 분의 거래대금(원), 없으면 null. `levelOf` = 굵기 단계 판정.
 */
export function amountRuns(
    points: readonly { x: number; y: number }[],
    baseT: number,
    amountAt: (minute: number) => number | null,
    levelOf: (won: number) => number,
): AmountRun[] {
    const out: AmountRun[] = [];
    let budget = MAX_RUN_MINUTES;
    const push = (x0: number, y0: number, x1: number, y1: number, level: number, amount: number): void => {
        const last = out[out.length - 1];
        const tail = last?.points[last.points.length - 1];
        // 같은 단계가 이어지면 **점을 덧붙여** 늘린다 — 끝점을 옮기면 그 사이 꺾임이 사라진다.
        if (last && tail && last.level === level && tail.x === x0 && tail.y === y0) {
            last.points.push({ x: x1, y: y1 });
            if (amount > last.maxAmount) {
                last.maxAmount = amount;
                last.maxAt = { x: x1, y: y1 };
            }
            return;
        }
        out.push({ points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], level, maxAmount: amount, maxAt: { x: x1, y: y1 } });
    };
    for (let i = 0; i + 1 < points.length; i++) {
        const p = points[i];
        const q = points[i + 1];
        const m0 = p.x + baseT;
        const m1 = q.x + baseT;
        const span = m1 - m0;
        if (span <= 0) continue;
        const yAt = (m: number): number => p.y + ((q.y - p.y) * (m - m0)) / span;
        for (let m = Math.floor(m0); m < m1; m++) {
            if (budget-- <= 0) return out;
            const a = Math.max(m, m0);
            const b = Math.min(m + 1, m1);
            // 이 조각([a,b])의 값은 **끝나는 분**의 거래대금이다 — cumAmount 차분이 그 분의 몫이라
            // 시작 분의 봉은 직전 조각에 든다(조각끼리 겹치지 않게 하는 유일한 배분).
            const won = amountAt(Math.ceil(b));
            push(a - baseT, yAt(a), b - baseT, yAt(b), won === null ? LEVEL_MISSING : levelOf(won), won ?? 0);
        }
    }
    return out;
}

/**
 * 금액 라벨 솎기 — **두 단계, 둘 다 같은 종목 안에서만**(사용자 확정).
 *
 * ① **선 × 세그먼트당 최대 하나**: 각 선이 각 세그먼트(앵커 골격의 피벗이 나누는 구간)에서 자기 최대
 *    하나만 낸다. 한 선의 긴 급등 구간이 그 선의 라벨을 독차지하지 못한다.
 * ② **선 × 화면 x 격자**: 축소로 세그먼트가 좁아지면 **그 선의** 이웃 세그먼트끼리 합쳐진다.
 *
 * ## 경쟁은 종목을 가로지르지 않는다
 * 처음엔 전 선이 한 격자에서 겨루게 했는데, 그러면 대형주 하나가 화면의 라벨을 다 가져가고 나머지
 * 종목은 숫자가 아예 안 남는다. **7종목이면 한 세그먼트에 7개가 있어야 한다**(사용자) — 이 화면의
 * 목적이 "테마 전 종목의 대금을 한눈에"라서, 종목을 탈락시키는 순간 그 목적이 깨진다.
 * 그래서 종목끼리는 안 겨루고, 겹치면 **자리를 옮겨서**(spreadByY + 지시선) 전부 보여준다.
 *
 * ## 왜 x 한 방향인가
 * 예전엔 (x, y) 2차원 격자였는데, 급등 구간은 x가 거의 안 변하면서 y를 여러 칸 지나가 **칸마다 라벨이
 * 하나씩 남아 숫자 기둥이 섰다**(사용자 지적). 자리를 x로만 다투게 하면 그 기둥이 안 생긴다.
 *
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
 * 겹치는 라벨을 **세로로 벌린다** — 탈락시키지 않고 자리를 옮겨 전부 보이게(지시선이 원래 자리를 가리킨다).
 *
 * 가로로 겹칠 수 있는 것끼리만 다툰다(x 를 `bandW` 로 묶는다 — 밴드 폭 = 라벨 폭이면 한 밴드 안은 반드시
 * 겹치고 밴드끼리는 안 겹친다). 밴드 안에서 y 순으로 최소 간격을 채운 뒤, **무리 전체를 원래 중심으로
 * 되돌린다** — 그러지 않으면 아래로만 밀려 원래 자리에서 통째로 떨어진다(간격은 평행이동에 안 변한다).
 */
export function spreadByY<T extends { x: number; y: number }>(
    items: readonly T[],
    bandW: number,
    minGap: number,
): (T & { labelY: number })[] {
    const bands = new Map<number, T[]>();
    for (const it of items) {
        const b = Math.floor(it.x / bandW);
        const list = bands.get(b);
        if (list) list.push(it);
        else bands.set(b, [it]);
    }
    const out: (T & { labelY: number })[] = [];
    for (const list of bands.values()) {
        const sorted = [...list].sort((a, b) => a.y - b.y);
        const ys: number[] = [];
        for (let i = 0; i < sorted.length; i++) {
            ys.push(i === 0 ? sorted[i].y : Math.max(sorted[i].y, ys[i - 1] + minGap));
        }
        const shift = (ys.reduce((s, v) => s + v, 0) - sorted.reduce((s, v) => s + v.y, 0)) / sorted.length;
        for (let i = 0; i < sorted.length; i++) out.push({ ...sorted[i], labelY: ys[i] - shift });
    }
    return out;
}

/**
 * 벽시계 분 → 세그먼트 번호. 경계(앵커 피벗 시각)는 **오름차순**이어야 한다.
 * 첫 경계 앞은 −1, 마지막 경계 뒤는 마지막 세그먼트에 든다(끝점이 자기 구간을 잃지 않게).
 */
export function segmentIndexOf(boundaries: readonly number[], minute: number): number {
    if (boundaries.length < 2) return 0;
    if (minute < boundaries[0]) return -1;
    for (let i = 0; i + 1 < boundaries.length; i++) if (minute <= boundaries[i + 1]) return i;
    return boundaries.length - 2;
}

/** `times[]`(unix 초) → 벽시계 분 → 인덱스. 조각마다 훑지 않도록 종목당 한 번 만든다. */
export function minuteIndexOf(times: readonly number[], toMinute: (unixSec: number) => number): Map<number, number> {
    const m = new Map<number, number>();
    for (let i = 0; i < times.length; i++) m.set(toMinute(times[i]), i);
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
 * 폴리라인을 x0 에서 과거(x ≤ x0)/미래(x ≥ x0)로 가른다 — 경계점은 **양쪽에 포함**(선이 끊겨 보이지 않게).
 * 타점 시각엔 합성 규칙 덕에 정확히 그 x 의 피벗이 있어 보간이 필요 없다(그게 이 함수의 호출측 계약이다 —
 * x0 에 점이 없으면 그 구간이 빈 채 갈라진다).
 */
export function splitAtX<P extends { x: number }>(points: readonly P[], x0: number): { past: P[]; future: P[] } {
    return { past: points.filter((p) => p.x <= x0), future: points.filter((p) => p.x >= x0) };
}

/**
 * 폴리라인 위 x 지점의 y — 구간 선형 보간. 호버 판독("이 선의 이 시각 값")이 쓴다.
 * 범위 밖이면 null(끝점을 연장해 지어내지 않는다). x 오름차순 가정 — 골격·테마 경로가 전부 그렇다.
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
 * 왜 필요한가: 테마 선을 하루 전체로 넓히면서 선당 점이 ~70 → ~720 이 됐고, 30선이면 이동할 때마다
 * 2만 점의 좌표 문자열을 다시 만들어 DOM 에 쓴다(드래그가 눈에 띄게 뻑뻑해진 원인).
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

/** 폴리라인 points 속성 문자열. 소수 2자리로 끊어 DOM 문자열이 불필요하게 길어지지 않게. */
export function polylinePoints(s: NormalizedSkeleton, sx: (x: number) => number, sy: (y: number) => number): string {
    return s.points.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
}

/**
 * 겹쳐 그리기의 선 불투명도 — **개수에 반비례하되 바닥이 있다**.
 *
 * 고정값을 쓰면 골격 20개일 때는 흐리고 500개일 때는 화면이 까맣게 찬다. 개수를 따라 낮추면 겹친 그림이
 * **밀도 지도**가 된다 — 많이 겹치는 경로는 진해지고 드문 경로는 흐려진다. 1/√n 은 겹침 그림의 흔한 어림이다
 * (정확한 포화점은 겹침 정도에 달렸는데 그건 미리 알 수 없다).
 *
 * 바닥(0.06)이 있는 이유: 아무리 많아도 **한 화면에서 읽히는 정도**는 보장돼야 한다. 예전엔 "보이는 개수"로
 * 모수를 좁혀 확대 시 진해지게 했는데, 골격은 전부 앵커점 (0,0)을 지나므로 원점이 화면에 있는 한 보이는
 * 개수가 전체와 같아 그 장치가 값을 못 했다. 계수(1.2)와 상한(0.45)을 낮게 잡은 건 사용자 확정 —
 * 기본은 흐리고, 겹친 자리가 알파 누적으로 진해지는 것(밀도)이 주인공이다.
 */
export const lineOpacity = (n: number): number => (n <= 0 ? 0 : Math.min(0.45, Math.max(0.06, 1.2 / Math.sqrt(n))));

/** 강조 중일 때 나머지의 불투명도 — 기본값에 **비례**한다. 고정값이면 개수가 많을 때 흐림이 기본보다 진해진다. */
export const dimOpacity = (n: number): number => Math.max(0.015, lineOpacity(n) * 0.25);

/**
 * 사각 선택 판정 — **라벨 지점**이 사각에 든 골격의 키(Ctrl+드래그).
 * 처음엔 피벗 기준(선 위를 긋는 손짓)이었는데, 선이 얽힌 곳에선 원하는 것만 담기가 안 돼서 사용자 확정으로
 * 라벨 기준으로 바꿨다 — 라벨은 서로 벌어져 있어(클러스터 격자) 정밀하게 골라 담을 수 있고,
 * "손잡이는 라벨"이라는 패널 원칙과도 맞는다.
 */
export function keysInRect(
    items: readonly NormalizedSkeleton[],
    anchor: SkeletonAnchor,
    sx: (x: number) => number,
    sy: (y: number) => number,
    rect: { x0: number; y0: number; x1: number; y1: number },
): string[] {
    const [left, right] = rect.x0 <= rect.x1 ? [rect.x0, rect.x1] : [rect.x1, rect.x0];
    const [top, bottom] = rect.y0 <= rect.y1 ? [rect.y0, rect.y1] : [rect.y1, rect.y0];
    const out: string[] = [];
    for (const s of items) {
        const p = labelPointOf(s, anchor);
        const x = sx(p.x);
        const y = sy(p.y);
        if (x >= left && x <= right && y >= top && y <= bottom) out.push(s.key);
    }
    return out;
}

/** 라벨이 붙는 점 — **앵커 반대쪽 끝**. 앵커 쪽은 모든 골격이 한 점에 모여 라벨을 붙일 자리가 없다. */
export const labelPointOf = (s: NormalizedSkeleton, anchor: SkeletonAnchor): { x: number; y: number } =>
    anchor === "last" ? s.points[0] : s.points[s.points.length - 1];

/**
 * 선 하나가 지금 어떤 역할인가 — **색을 정하는 값**.
 *   · selected : 클릭·Ctrl 다중선택으로 붙잡은 것(호버가 지나가도 남는다)
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
     * 강조 무리(선택·그룹)에 **속하지만** 지금 짚고 있는 건 아닌가 — 한 걸음 물러나 그릴지.
     * 굵기 차이(1.75 → 2.5)만으로는 목록에서 행을 훑을 때 어느 선인지 잘 안 잡혔다(사용자 지적).
     * 색은 그대로 두고 진하기만 낮춘다 — 색이 바뀌면 목록↔그림을 잇는 유일한 끈이 끊긴다.
     */
    recede: boolean;
}

/**
 * 강조 상태 → 표시 규격. **규칙이 넷 겹쳐서** 화면 안에 삼항 연산으로 두면 다음 규칙이 붙을 때 반드시 어긋난다.
 *
 * 우선순위는 selected → group → hovered 다. group 이 hovered 보다 위인 게 핵심인데, 그러지 않으면
 * **목록 행에 손을 올린 순간 그 선만 색이 바뀌어** 정작 색으로 짝을 찾던 그 순간에 대응이 끊긴다.
 * 대신 굵기로 답하고(짚은 것은 더 굵게), **나머지 무리는 recede 로 물러난다**(짚은 것만 남는 효과).
 */
export function lineVisual(key: string, ctx: {
    selected: ReadonlySet<string>;
    hovered: string | null;
    group: ReadonlySet<string> | null;
}): LineVisual {
    const anyLit = ctx.selected.size > 0 || ctx.hovered !== null || (ctx.group?.size ?? 0) > 0;
    // 무리 안에서 하나를 짚고 있는가 — 그렇다면 그 하나만 앞에 서고 나머지 무리는 물러난다.
    const recede = ctx.hovered !== null && key !== ctx.hovered;
    if (ctx.selected.has(key)) return { role: "selected", width: key === ctx.hovered ? 2.5 : 2, dim: false, recede };
    if (ctx.group?.has(key)) return { role: "group", width: key === ctx.hovered ? 2.5 : 1.75, dim: false, recede };
    if (key === ctx.hovered) return { role: "hovered", width: 2, dim: false, recede: false };
    return { role: "base", width: 1.25, dim: anyLit, recede: false };
}

/** 라벨 자리 하나(화면 좌표). */
export interface LabelAnchor {
    key: string;
    x: number;
    y: number;
}

/** 한 칸에 모인 라벨들. members 가 1이면 라벨을, 여럿이면 개수 뱃지를 그린다. */
export interface LabelCluster {
    x: number;
    y: number;
    members: string[];
}

/**
 * 화면공간 격자로 라벨을 묶는다(지도의 축약과 같은 방식).
 *
 * 개수 임계로 라벨을 **숨기면** 그 골격이 뭔지 알 길이 영영 없어진다. 묶으면 숨기는 게 아니라 **압축**이라,
 * 확대해서 화면 좌표가 벌어지면 칸이 쪼개지며 저절로 풀린다. 그래서 이 함수는 값 좌표가 아니라 **화면 좌표**를
 * 받는다 — 확대 배율이 곧 축약 수준이 되는 게 핵심이다.
 * 대표 위치는 그 칸의 첫 멤버 자리 — 중심을 쓰면 멤버가 하나 드나들 때마다 라벨이 흔들린다.
 */
export function clusterLabels(anchors: readonly LabelAnchor[], cellW: number, cellH: number): LabelCluster[] {
    const byCell = new Map<string, LabelCluster>();
    for (const a of anchors) {
        const cell = `${Math.floor(a.x / cellW)}|${Math.floor(a.y / cellH)}`;
        const found = byCell.get(cell);
        if (found) found.members.push(a.key);
        else byCell.set(cell, { x: a.x, y: a.y, members: [a.key] });
    }
    return [...byCell.values()];
}
