// 선을 분 단위 런으로 잘라 거래대금을 **굵기**로 싣는 공용 재료 + 라벨 세로 벌리기(spreadByY).
// 골격 겹쳐 그리기에서 태어나 테이프(장중 테마 궤적)가 물려받았다 — 골격이 은퇴한 뒤에도 이 층은
// "시계열 선 위에 세 번째 차원(굵기)을 싣는" 범용 재료라 canvas/ 로 살아남았다.
//
// ## 왜 선분(피벗~피벗)이 아니라 분인가
// 선분 하나에 값 하나면 그 값은 구간 **평균**이 된다. 60분 구간에서 09:32 에 200억이 터지고 나머지가
// 조용하면 평균은 3억이라 **스파이크가 통째로 지워진다**. 형태(직선)는 그대로 두고 세 번째 차원만
// 분 해상도로 올린다.
//
// ## 왜 색이 아니라 굵기인가(사용자 확정)
// 2px 획은 색을 담을 면적이 없다 — 8단계가 구분이 안 되고 선 본연의 색(선택 파랑)까지 잃는다.
// 굵기는 크기 채널이라 ① 30선이 얽혀도 굵은 자리가 살아남고 ② "굵다=크다"에 범례가 필요 없고
// ③ 축소해도 안 사라진다. 정확한 값은 희소한 채널(숫자 라벨)이 따로 답한다.
//
// ## 왜 런으로 합치는가 — 그리고 왜 **꼭짓점을 버리면 안 되는가**
// 하루면 분 조각이 400개, 30선이면 12,000개다. 같은 단계가 이어지면 하나로 합쳐야 실제 개수가
// 수십 개로 떨어진다. 그런데 런을 양 끝점만 든 직선으로 합치면 그 사이의 꺾임이 통째로 사라진다
// (실제로 겪은 버그: 점은 제자리인데 선만 가로질러 가고, 글로우와 굵기 선이 갈라져 보였다).
// 그래서 런은 **점 목록**을 든다: 합칠 때 끝점을 옮기는 게 아니라 점을 덧붙인다.

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
