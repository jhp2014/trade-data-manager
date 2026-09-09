// 급타점 수 — **창 W 안에서 완결된 연속 타점 쌍 중, 종가 상승률이 r 이상인 쌍의 개수**(정수).
// 규칙 원문은 `.claude/decisions.md` 「급타점 수 축」 절.
//
// 정의가 이 모양인 이유 셋(전부 그 절의 근거를 코드로 옮긴 것):
//   · **두 점이 모두 창 안** — 그래야 쌍 하나의 소요시간이 자동으로 ≤ W 가 되어 **기울기 하한 r/W**
//     가 공짜로 보장된다. 따로 기울기 노브(m)를 두지 않는 이유가 이것이다(W 를 줄이는 것이 곧
//     기울기 임계를 올리는 것).
//   · **연속 쌍만** — 창 안 모든 순서쌍을 세면 (P₁,P₃) 같은 것이 구간을 이중으로 센다.
//   · **P 이전에서 끝난 쌍도 전부** — P 로 끝나는 쌍만 세면 값이 0/1 뿐이라 직전 기울기로 되돌아가,
//     이 축을 만든 이유(n−2 문제: 직전은 완만한데 그 앞이 급했던 경우)가 그대로 재발한다.
//
// 결손이 없다(값은 항상 정수 ≥ 0) — 첫 돌파는 세어질 쌍이 없어 **0** 이다. `undefined` 로 내면
// 3치 판정이 그것을 "미배치"로 세어 필터 밖으로 빠뜨린다(evaluate.ts 머리 주석) — 여기선 0 이
// "세어봤더니 없었다"는 **사실**이라 결손이 아니다.
import type { ComputedAxisPoint } from "@trade-data-manager/wire";
import { chartKeyOf, pointKeyOf } from "./pointKey.js";
import type { AutoPoint } from "./usePointGrids.js";

/** 창 W(분) 도메인 — 상한은 실측 쌍 간격 p90 = 140분 위로 잡았다. 스냅은 5분. */
export const HOT_W_MIN = 5;
export const HOT_W_MAX = 240;
export const HOT_W_STEP = 5;
/** 상승률 r(%) 도메인 — 상한은 실측 쌍 상승률 p90 = 6.97% 위로. 스냅은 0.5%p. */
export const HOT_R_MIN = 0.5;
export const HOT_R_MAX = 15;
export const HOT_R_STEP = 0.5;
/** 기본 인스턴스 — r=3% 는 실측 중앙값(2.23%) 바로 위다(2% 면 쌍의 54%가 "급하다"로 세어져 뜻을 잃는다). */
export const DEFAULT_HOT_W = 60;
export const DEFAULT_HOT_R = 3;
/** 런타임 인스턴스 상한 — **생성 지점에서만** 막는다(밖에서 온 저장 집합이 더 들고 오면 전부 센다). */
export const HOT_MAX_INSTANCES = 3;

export interface HotParams {
    /** 창(분). */
    w: number;
    /** 상승률 하한(%). */
    r: number;
}

/** 도메인 안으로 자르기 — 파서·레일이 같은 규칙을 봐야 저장본과 손짓이 안 갈린다. */
export const clampHotW = (w: number): number => Math.min(HOT_W_MAX, Math.max(HOT_W_MIN, w));
export const clampHotR = (r: number): number => Math.min(HOT_R_MAX, Math.max(HOT_R_MIN, r));
/** 저장본 검증 — 도메인 밖이면 그 술어는 폐기(파서 원칙: 반쯤 살리지 않는다). */
export const isHotW = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= HOT_W_MIN && v <= HOT_W_MAX;
export const isHotR = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= HOT_R_MIN && v <= HOT_R_MAX;

/**
 * ＋조건이 고르는 기본값 **사다리** — 앞에서부터 아직 안 쓰인 첫 자리를 집는다.
 * 늘 (60,3) 을 만들면 같은 레일 자리(W×r)에 행이 둘 서고, 그때 그은 컷이 `stagesFor(...)[0]` 탓에
 * **연동 표시와 다른 행**으로 들어간다(자리 충돌을 이동에서만 막고 생성에서 안 막은 구멍 — 리뷰 2026-09-09).
 * 첫 둘은 "창 넓이 대비"(60 vs 30), 셋째는 "상승률 대비"(3 vs 5) — 실제로 나란히 놓고 보고 싶은 조합이다.
 */
export const HOT_PARAM_LADDER: readonly HotParams[] = [
    { w: DEFAULT_HOT_W, r: DEFAULT_HOT_R },
    { w: 30, r: 3 },
    { w: 60, r: 5 },
    { w: 120, r: 3 },
    { w: 30, r: 5 },
    { w: 15, r: 3 },
];

/** 사다리에서 아직 안 쓰인 첫 자리 — 전부 찼으면 null(그때는 만들지 않는다: 조용히 겹치는 것보다 낫다). */
export function nextFreeHotParams(taken: readonly HotParams[]): HotParams | null {
    return HOT_PARAM_LADDER.find((c) => !taken.some((t) => t.w === c.w && t.r === c.r)) ?? null;
}

/** 두 노브가 실제로 합의한 것 — 이 축이 세는 쌍의 **기울기 하한**(%/분). 패널 힌트 줄이 읽는다. */
export const hotSlopeFloor = (w: number, r: number): number => r / w;

export interface HotCounts {
    /** 축 피드가 그대로 싣는 값 목록(결손 없음 — 전 타점이 여기 있다). */
    values: ComputedAxisPoint[];
    /** 같은 값의 타점키 조회판 — 레일·패널이 읽는다(두 벌을 각자 만들면 같은 걸 두 번 센다). */
    byKey: ReadonlyMap<string, number>;
}

/** W·r **무관** 고정 분포 — W·r 레일의 과녁이다. 노브에 딸려 흔들리면 "긋기 전에 보인다"가 무너진다. */
export interface HotPairs {
    /** 연속 쌍의 소요 분. */
    spans: number[];
    /** 연속 쌍의 종가 상승률(%). */
    rises: number[];
}

/** 차트별로 묶는다 — 쌍은 **같은 (종목,날짜) 안에서만** 성립한다(날짜·종목 경계를 넘는 쌍은 뜻이 없다).
 *  `points` 의 차트 안 시간 오름차순은 보장되므로(defDerived `buildAutoView` 가 `pointsOf` 산출물을
 *  차트별로 연속 push 한다) 그대로 밀어 넣으면 순서가 지켜진다. 한 캔들이 두 Point 를 못 내므로
 *  min 은 차트 안에서 **강한 단조**이고, 그것이 창 판정을 `k ≤ n` 하나로 접는 근거다. */
function byChartOf(points: readonly AutoPoint[]): Map<string, AutoPoint[]> {
    const m = new Map<string, AutoPoint[]>();
    for (const a of points) {
        const k = chartKeyOf(a.stockCode, a.date);
        const arr = m.get(k);
        if (arr === undefined) m.set(k, [a]);
        else arr.push(a);
    }
    return m;
}

/** 연속 쌍 하나의 상승률(%) — 분모는 앞 타점의 종가. 하락 쌍은 음수라 r 하한에서 자연히 빠진다. */
const riseOf = (prev: AutoPoint, cur: AutoPoint): number =>
    ((cur.point.close - prev.point.close) / prev.point.close) * 100;

/**
 * 전 타점의 급타점 수. 차트당 타점이 한 자릿수(실측 평균 3)라 차트 안 O(m²) 는 문제가 아니다.
 *
 * 창 판정이 `k ≤ n` 하나로 접히는 근거: 타점이 시간 오름차순이라 `k ≤ n` 이면 뒤 점은 이미 tₙ 이하다.
 * 그래서 남는 검사는 **앞 점이 tₙ − W 이상인가** 뿐이다. 양끝 모두 닫힌 구간(경계값 포함).
 */
export function hotCountsOf(points: readonly AutoPoint[], w: number, r: number): HotCounts {
    const values: ComputedAxisPoint[] = [];
    const byKey = new Map<string, number>();
    for (const arr of byChartOf(points).values()) {
        for (let n = 0; n < arr.length; n++) {
            const lo = arr[n].point.min - w;
            let hot = 0;
            for (let k = 1; k <= n; k++) {
                if (arr[k - 1].point.min < lo) continue;
                if (riseOf(arr[k - 1], arr[k]) >= r) hot++;
            }
            const a = arr[n];
            values.push({ stockCode: a.stockCode, date: a.date, time: a.time, value: hot });
            byKey.set(pointKeyOf(a.stockCode, a.date, a.time), hot);
        }
    }
    return { values, byKey };
}

/** 전 연속 쌍의 간격·상승률 — W·r 레일의 분포 모수(노브 무관, 판정 게이트에만 매인다). */
export function hotPairsOf(points: readonly AutoPoint[]): HotPairs {
    const spans: number[] = [];
    const rises: number[] = [];
    for (const arr of byChartOf(points).values()) {
        for (let k = 1; k < arr.length; k++) {
            spans.push(arr[k].point.min - arr[k - 1].point.min);
            rises.push(riseOf(arr[k - 1], arr[k]));
        }
    }
    return { spans, rises };
}
