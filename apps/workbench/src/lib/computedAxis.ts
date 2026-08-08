// 계산 축 → 판단 축과 **같은 모양**의 줄. 시트·순위 인덱스·정렬이 두 종류를 구분하지 않게 하는 어댑터.
//
// 서버는 값만 준다(`타점 → 수치`). 여기서 값을 정렬 좌표로 바꾼다:
//  · orderKey = 수치(강한 쪽이 작은 값인 축이면 부호 반전) — buildAxisIndex 관례가 "큰 orderKey = 강".
//  · slotId   = 값에서 파생 → **같은 수치는 자동으로 같은 자리(타이)**. 판단 축이 slot 행으로 저장하는 것을
//               계산 축은 값이 대신한다(저장할 위치가 없다).
//
// ⚠ slotId 는 값이 바뀌면 함께 바뀐다(수식 수정·재계산). 그래서 slotId 를 **영속 상태의 키로 쓰는 기능**
//   (밴드 경계·그룹 컷 = rankBands/cuts)은 계산 축에 아직 열지 않는다 — 조용히 끊긴 참조가 되기 때문.
//   보정(사람이 계산 줄에 개입)이 들어올 때 앵커 방식으로 함께 푼다.
import type { AxisDisplay, ComputedAxisFeed, PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { pointKey } from "./pointKey.js";

/** 계산 축 id 접두 — 판단 축 id(DB bigserial 문자열)와 절대 겹치지 않는다. */
const COMPUTED_PREFIX = "c:";

/** 포화가 실측 최대에서 떨어져 서는 거리 = 축 단위 한 눈금(공백 축이면 1 거래일). 척도를 딱 한 칸만 늘린다. */
const SATURATED_STEP = 1;
/** 포화 표기 — 숫자가 아니라 "상한을 못 잡았다"는 뜻이라 수치로 적지 않는다. */
const SATURATED_LABEL = "∞";

export const computedAxisId = (key: string): string => `${COMPUTED_PREFIX}${key}`;

/** 이 축이 계산 축인가 — 쓰기(배치/해제/이름변경)가 닿으면 안 되는 축인지 판정. */
export const isComputedAxis = (axisId: string): boolean => axisId.startsWith(COMPUTED_PREFIX);

/**
 * 수치 → 표시 문자열. 규격은 서버(축 정의)가 준다 — 여기에 축별 분기를 두면 축 추가가 클라 수정을 부른다.
 * 규격 없는 축은 등락률 모양(기존 두 축이 그거라 기본값이 곧 하위호환).
 */
export function formatAxisValue(v: number, display?: AxisDisplay): string {
    const { suffix = "%", decimals = 1, signed = true } = display ?? {};
    return `${signed && v > 0 ? "+" : ""}${v.toFixed(decimals)}${suffix}`;
}

export interface ComputedAxisView {
    axis: RankAxis;
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
 * 모집단을 봐야 알 수 있어 클라 몫이다. 실측 최댓값 **다음 한 칸**에 전부 몰아 세운다 —
 *  · 척도가 한 칸만 늘어 실제 값들이 안 눌린다(큰 상수를 쓰면 여기가 무너진다).
 *  · 같은 수를 공유하니 slotId 가 같아져 포화끼리 **자동으로 동률**이다.
 *  · 그 수는 실측 어디에도 없으므로 라벨에서 ∞ 로 되짚을 수 있다(별도 배선 없이 fmt 하나로).
 * ⚠ 이 수는 모집단이 바뀌면 움직인다. 값으로 굳힌 필터 경계(`{kind:"value"}`)는 그때 뜻이 살짝 달라진다 —
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
        line.push({ slotId: `${axisId}#${value}`, orderKey: sign * value, stockCode: v.stockCode, date: v.date, time: v.time });
        values.set(pointKey(v), value);
    }
    return {
        axis: { id: axisId, name: feed.name, scope: "point" },
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
