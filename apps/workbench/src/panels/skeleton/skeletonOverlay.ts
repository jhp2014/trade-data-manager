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
    /** 기준 피벗의 원 t — 벽시계 값(타점 시각 등)을 이 골격의 x 로 옮길 때 뺀다. 절대 배치면 0. */
    baseT: number;
}

/**
 * 타점 단위 골격 — 분봉 정규화 뷰의 선 하나 = **타점 하나**(사용자 확정: 골격 1 + 타점 3 → 선 3개).
 * 자기 시각의 경로 피벗이 원점(0,0)이다: 과거는 왼쪽 실선, **미래(그 시각 이후)는 오른쪽 점선** —
 * "그 타점에 선 눈"으로 여러 상황을 겹친다. key 는 타점키(pk)라 선택·태그가 타점 문법을 그대로 탄다.
 */
export interface PointSkeleton extends NormalizedSkeleton {
    /** 타점 시각(HH:MM:SS) — 라벨(`날짜 종목 시각`)과 이동(goToPoint)의 재료. */
    time: string;
    /** 원점(자기 시각 피벗)의 인덱스 — 이 뒤가 미래(점선). */
    splitIdx: number;
}

/** `HH:MM(:SS)` → 자정 기준 분. 분봉 골격의 t(벽시계 분)와 타점 시각을 잇는 유일한 환산. */
export const minutesOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/**
 * 차트 하나의 분봉 골격을 **타점마다** 재정규화한다. 타점 시각의 피벗은 합성 규칙("타점 종가 = 골격의 한 점")
 * 덕에 반드시 있다 — 없으면(방어) 그 타점은 지어내지 않고 건너뛴다. 피벗 2개 미만이면 골격이 아니다.
 */
export function pointSkeletons(
    pivots: readonly SkeletonWirePivot[],
    pts: readonly { pk: string; time: string }[],
    chart: { key: string; stockCode: string; date: string },
): PointSkeleton[] {
    if (pivots.length < 2) return [];
    const out: PointSkeleton[] = [];
    for (const p of pts) {
        const t0 = minutesOf(p.time);
        const idx = pivots.findIndex((v) => v.t === t0);
        if (idx < 0) continue;
        const base = pivots[idx];
        if (base.price <= 0) continue;
        out.push({
            key: p.pk,
            chartKey: chart.key,
            stockCode: chart.stockCode,
            date: chart.date,
            time: p.time,
            basePrice: base.price,
            baseT: base.t,
            splitIdx: idx,
            points: pivots.map((v) => ({ x: v.t - base.t, y: pct(v.price, base.price), ...(v.synthetic ? { synthetic: true } : {}) })),
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
): NormalizedSkeleton | null {
    if (pivots.length < 2) return null;
    const base = anchor === "first" ? pivots[0] : pivots[pivots.length - 1];
    if (base.price <= 0) return null;
    return {
        ...owner,
        chartKey: owner.key,
        basePrice: base.price,
        baseT: base.t,
        points: pivots.map((p) => ({ x: p.t - base.t, y: pct(p.price, base.price), ...(p.synthetic ? { synthetic: true } : {}) })),
    };
}

/**
 * 절대 배치 — 정규화 없이 **벽시계 x·전일 종가 대비 % y**. 분봉 골격 전용(장중 경로를 분봉 차트 보듯).
 * 앵커 정규화와 달리 골격끼리 시간이 정렬되지 않는 대신, "몇 시에 몇 %였나"가 그대로 남는다.
 * prevClose 없으면(전일 미수집) null — 분모를 지어내지 않는다.
 */
export function absoluteSkeleton(
    pivots: readonly SkeletonWirePivot[],
    prevClose: number | undefined,
    owner: { key: string; stockCode: string; date: string },
): NormalizedSkeleton | null {
    if (pivots.length < 2 || prevClose == null || prevClose <= 0) return null;
    return {
        ...owner,
        chartKey: owner.key,
        basePrice: prevClose,
        baseT: 0,
        points: pivots.map((p) => ({ x: p.t, y: pct(p.price, prevClose), ...(p.synthetic ? { synthetic: true } : {}) })),
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
 * 절대 뷰의 초기 프레임(사용자 확정 — LWC 차트식 고정 창): x = 데이터 범위 ±15분 패딩, y = **−5%~+30%**.
 *
 * 분위수 트리밍이 아니라 상수 창인 이유: 절대 뷰는 "몇 시에 몇 %였나"를 분봉 차트 보듯 읽는 화면이라,
 * 프레임이 데이터를 따라 출렁이면 같은 +10%가 매번 다른 높이에 선다. y 를 상승 쪽으로 치우친 건 관심
 * 대상이 상승 경로이기 때문. 창 밖 이상치는 확대·이동으로 닿고, 원위치(리셋)가 이 기본으로 돌아온다.
 */
export const ABS_FRAME = { padMinutes: 15, minY: -5, maxY: 30 } as const;

export function absoluteFrame(items: readonly NormalizedSkeleton[]): OverlayBounds | null {
    if (items.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const s of items) for (const p of s.points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
    if (!Number.isFinite(minX)) return null;
    return { minX: minX - ABS_FRAME.padMinutes, maxX: maxX + ABS_FRAME.padMinutes, minY: ABS_FRAME.minY, maxY: ABS_FRAME.maxY };
}

/**
 * 폴리라인을 x0 에서 과거(x ≤ x0)/미래(x ≥ x0)로 가른다 — 경계점은 **양쪽에 포함**(선이 끊겨 보이지 않게).
 * 타점 시각엔 합성 규칙 덕에 정확히 그 x 의 피벗이 있어 보간이 필요 없다(그게 이 함수의 호출측 계약이다 —
 * x0 에 점이 없으면 그 구간이 빈 채 갈라진다).
 */
export function splitAtX<P extends { x: number }>(points: readonly P[], x0: number): { past: P[]; future: P[] } {
    return { past: points.filter((p) => p.x <= x0), future: points.filter((p) => p.x >= x0) };
}

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
}

/**
 * 강조 상태 → 표시 규격. **규칙이 셋 겹쳐서** 화면 안에 삼항 연산으로 두면 다음 규칙이 붙을 때 반드시 어긋난다.
 *
 * 우선순위는 selected → group → hovered 다. group 이 hovered 보다 위인 게 핵심인데, 그러지 않으면
 * **목록 행에 손을 올린 순간 그 선만 색이 바뀌어** 정작 색으로 짝을 찾던 그 순간에 대응이 끊긴다.
 * 대신 굵기로 답한다(그룹·선택 안에서 호버된 것은 더 굵게).
 */
export function lineVisual(key: string, ctx: {
    selected: ReadonlySet<string>;
    hovered: string | null;
    group: ReadonlySet<string> | null;
}): LineVisual {
    const anyLit = ctx.selected.size > 0 || ctx.hovered !== null || (ctx.group?.size ?? 0) > 0;
    if (ctx.selected.has(key)) return { role: "selected", width: key === ctx.hovered ? 2.5 : 2, dim: false };
    if (ctx.group?.has(key)) return { role: "group", width: key === ctx.hovered ? 2.5 : 1.75, dim: false };
    if (key === ctx.hovered) return { role: "hovered", width: 2, dim: false };
    return { role: "base", width: 1.25, dim: anyLit };
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
