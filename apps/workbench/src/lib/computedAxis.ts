// 계산 축 → 판단 축과 **같은 모양**의 줄. 시트·순위 인덱스·정렬이 두 종류를 구분하지 않게 하는 어댑터.
//
// 서버는 값만 준다(`타점 → 수치`). 여기서 값을 정렬 좌표로 바꾼다:
//  · orderKey = 수치(강한 쪽이 작은 값인 축이면 부호 반전) — buildAxisIndex 관례가 "큰 orderKey = 강".
//  · 자리     = orderKey 그 자체 → **같은 수치는 자동으로 같은 자리(타이)**. 판단 축이 slot 행으로 저장하는 것을
//               계산 축은 값이 대신한다(저장할 위치가 없다). 판단 축에서 slotId 가 사라지면서
//               두 종류가 자리를 표현하는 방식이 완전히 같아졌다.
//
// ⚠ 자리(orderKey)는 값이 바뀌면 함께 바뀐다(수식 수정·재계산). 그래서 **영속 상태의 키로는 못 쓴다** —
//   밴드 경계·그룹 컷은 두 종류 모두 **타점 앵커**로 저장한다(그 타점이 있는 자리, 값이 움직여도 따라간다).
import type { AxisDisplay, ComputedAxisFeed, PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { rowKey } from "./pointKey.js";

/**
 * **축 키 정책 — 클라 전용 손잡이다.** 서버로 나가지도, DB 에 저장되지도 않는다(축은 계약에서 이름으로
 * 지목한다). `c:` 접두는 옛 판단 축 키(`p:<이름>`)와 한 목록에 살던 시절의 유산이지만 **유지한다** —
 * 저장물(열 설정·필터의 축 지목·rankAxisOrder)이 이 키를 들고 있고, 저장된 옛 `p:` 조건은 축 맵에
 * 없어 "판단 불가"로 우아하게 죽는다(자동 제거하지 않는다 — 조건이 말없이 사라지는 게 더 나쁘다).
 */
const COMPUTED_PREFIX = "c:";

/** 포화가 실측 최대에서 떨어져 서는 거리 = 축 단위 한 눈금(공백 축이면 1 거래일). 척도를 딱 한 칸만 늘린다. */
const SATURATED_STEP = 1;
/** 포화 표기 — 숫자가 아니라 "상한을 못 잡았다"는 뜻이라 수치로 적지 않는다. */
const SATURATED_LABEL = "∞";

export const computedAxisId = (key: string): string => `${COMPUTED_PREFIX}${key}`;

/** 이 축이 계산 축인가 — 쓰기(배치/해제/이름변경)가 닿으면 안 되는 축인지 판정. */
export const isComputedAxis = (axisKey: string): boolean => axisKey.startsWith(COMPUTED_PREFIX);

/**
 * 화면이 다루는 축 — 계약 축(RankAxis)에 **클라 키**를 얹은 것. 두 종류(판단·계산)가 한 목록에 산다.
 * RankAxis 를 확장하므로 계약을 받는 자리에 그대로 넘길 수 있다.
 */
export interface AxisRef extends RankAxis {
    key: string;
}

/**
 * 수치 → 표시 문자열. 규격은 서버(축 정의)가 준다 — 여기에 축별 분기를 두면 축 추가가 클라 수정을 부른다.
 * 규격 없는 축은 등락률 모양(기존 두 축이 그거라 기본값이 곧 하위호환).
 */
export function formatAxisValue(v: number, display?: AxisDisplay): string {
    const { suffix = "%", decimals = 1, signed = true } = display ?? {};
    // 천단위 구분자 — 시총(억) 같은 큰 정수 축의 가독용. 기존 축(%·일·개)은 세 자리를 잘 안 넘어 표기 불변.
    const [int, frac] = v.toFixed(decimals).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${signed && v > 0 ? "+" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}${suffix}`;
}

export interface ComputedAxisView {
    axis: AxisRef;
    line: PlacedPoint[];
    /**
     * 타점키 → **원시 수치**. 필터·라벨은 orderKey(부호 섞임)가 아니라 이 값을 쓴다("5%~20%"가 그대로 읽히게).
     * 포화 타점만 예외로 서버 값(하한) 대신 **자리잡은 수**가 들어간다 — 아래 자리잡기 설명 참조.
     */
    values: Map<string, number>;
    strongerWhen: "higher" | "lower";
    /** 이 축의 값 표시 함수(단위·자릿수 포함, 포화는 ∞). */
    fmt: (v: number) => string;
}

/**
 * 서버 피드 1개 → (축 메타, 합성 줄, 원시 수치). 판단 축 줄과 같은 타입이라 하류 소비자가 그대로 쓴다.
 *
 * **포화(우측 절단) 자리잡기가 여기서 일어난다.** 서버는 "상한을 못 잡았다"만 말하고(값은 하한), 어디에 세울지는
 * 전체 값 분포를 봐야 알 수 있어 클라 몫이다. 실측 최댓값 **다음 한 칸**에 전부 몰아 세운다 —
 *  · 척도가 한 칸만 늘어 실제 값들이 안 눌린다(큰 상수를 쓰면 여기가 무너진다).
 *  · 같은 수를 공유하니 slotId 가 같아져 포화끼리 **자동으로 동률**이다.
 *  · 그 수는 실측 어디에도 없으므로 라벨에서 ∞ 로 되짚을 수 있다(별도 배선 없이 fmt 하나로).
 * ⚠ 이 수는 값 분포가 바뀌면 움직인다. 값으로 굳힌 필터 경계(`{kind:"value"}`)는 그때 뜻이 살짝 달라진다 —
 *   레일이 경계를 타점 앵커로 스냅해 저장하는 게 기본이라 실사용에서는 드물다.
 */
export function computedAxisView(feed: ComputedAxisFeed): ComputedAxisView {
    const axisId = computedAxisId(feed.key);
    const sign = feed.strongerWhen === "higher" ? 1 : -1;

    let maxReal = -Infinity;
    let anySaturated = false;
    for (const v of feed.values) {
        if (v.saturated) anySaturated = true;
        else if (v.value > maxReal) maxReal = v.value;
    }
    // 실측이 하나도 없으면(전부 포화) 세울 기준이 없다 → 0 에 다 같이 선다(줄이 한 칸이라 순서에 뜻이 없다).
    const saturatedValue = maxReal === -Infinity ? 0 : maxReal + SATURATED_STEP;

    const line: PlacedPoint[] = [];
    const values = new Map<string, number>();
    for (const v of feed.values) {
        const value = v.saturated ? saturatedValue : v.value;
        // 자리는 **값이 정한다** — 같은 수치면 orderKey 가 같아지고, 그게 곧 같은 자리(타이)다.
        // day 축 행은 time 이 없다(행 = 차트) — 키도 줄 항목도 그 정체성을 그대로 싣는다(rowKey).
        if (v.time !== undefined) line.push({ orderKey: sign * value, stockCode: v.stockCode, date: v.date, time: v.time });
        else line.push({ orderKey: sign * value, stockCode: v.stockCode, date: v.date });
        values.set(rowKey(v), value);
    }
    return {
        // scope = 서버 축 정의의 grain — 옛날엔 "point" 하드코딩이라 day 성질의 계산 축(매물 공백·기준선
        // 거리·일봉 골격)이 깔때기 해상도를 통째로 타점으로 끌어내렸다. 옛 서버(grain 없음)는 point 폴백.
        axis: { key: axisId, name: feed.name, scope: feed.grain ?? "point" },
        line,
        values,
        strongerWhen: feed.strongerWhen,
        fmt: (v) => (anySaturated && v === saturatedValue ? SATURATED_LABEL : formatAxisValue(v, feed.display)),
    };
}

/** 값 도메인(최소·최대). 레일 좌표 매핑용. 값이 없으면 null. */
export function valueDomain(values: Map<string, number>): { min: number; max: number } | null {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values.values()) { if (v < min) min = v; if (v > max) max = v; }
    return min <= max ? { min, max } : null;
}

/**
 * 수치 → 레일 프랙션(0=약/왼쪽, 1=강/오른쪽). 강한 쪽이 작은 값인 축이면 뒤집는다 —
 * 레인·시트의 "오른쪽이 강함" 관례를 레일도 따라야 눈이 헷갈리지 않는다.
 */
export function valueToFrac(v: number, domain: { min: number; max: number }, strongerWhen: "higher" | "lower"): number {
    const span = domain.max - domain.min;
    const f = span <= 0 ? 0.5 : (v - domain.min) / span;
    return Math.max(0, Math.min(1, strongerWhen === "higher" ? f : 1 - f));
}

/** 프랙션 → **가장 가까운 실제 타점**. 경계를 늘 실재하는 자리에 놓기 위한 스냅(상대비교의 핵심). */
export function nearestPointAt(
    frac: number,
    values: Map<string, number>,
    domain: { min: number; max: number },
    strongerWhen: "higher" | "lower",
): string | null {
    let best: string | null = null;
    let bestGap = Infinity;
    for (const [key, v] of values) {
        const gap = Math.abs(valueToFrac(v, domain, strongerWhen) - frac);
        if (gap < bestGap) { bestGap = gap; best = key; }
    }
    return best;
}

/**
 * nearestPointAt 의 **정렬 준비판** — 레일 드래그는 pointermove 마다 최근접을 묻는데, 매번 전 값을
 * 선형 스캔하면 비용이 타점 수 × 이동 횟수로 는다. 레일 렌더당 한 번 만들어 두고 이분 탐색한다.
 * 답은 nearestPointAt 과 같다(동률에서 다른 키가 나올 수 있지만 값이 같아 경계값도 같다).
 */
export interface FracIndex {
    fracs: number[]; // 오름차 정렬
    keys: string[]; // fracs[i] 자리의 타점 키
}

export function buildFracIndex(
    values: Map<string, number>,
    domain: { min: number; max: number },
    strongerWhen: "higher" | "lower",
): FracIndex {
    const entries = [...values].map(([key, v]) => [valueToFrac(v, domain, strongerWhen), key] as const);
    entries.sort((a, b) => a[0] - b[0]);
    return { fracs: entries.map((e) => e[0]), keys: entries.map((e) => e[1]) };
}

/** 프랙션 → 가장 가까운 타점(이분 탐색). 빈 색인일 때만 null. */
export function nearestPointInIndex(frac: number, idx: FracIndex): string | null {
    const { fracs, keys } = idx;
    if (keys.length === 0) return null;
    let lo = 0;
    let hi = fracs.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fracs[mid]! < frac) lo = mid + 1;
        else hi = mid;
    }
    // lo = 첫 ≥ frac 자리(전부 < frac 이면 마지막) — 왼쪽 이웃과 거리를 견준다.
    if (lo > 0 && frac - fracs[lo - 1]! <= fracs[lo]! - frac) return keys[lo - 1]!;
    return keys[lo]!;
}
