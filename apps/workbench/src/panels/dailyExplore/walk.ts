// 목록 걷기(w/s)의 순수부 — 옛 작업 대상(workset/rows)에서 탐색판이 쓰던 조각만 옮겼다(2026-09-27 작업 대상 은퇴).

/** 순회 커서가 밟는 한 칸 — 하루 우주의 행은 좌표(종목·날짜·시각)다. */
export interface NavKey {
    code: string;
    date: string;
    time?: string;
}

/** 커서 — focus 의 모양(시각 없음 = null). */
export interface WalkCursor {
    code: string;
    date: string;
    time: string | null;
}

/** 한 칸의 결과 — 끝을 넘으면 boundary, 목록이 비면 null. */
export type WalkStep = { kind: "move"; to: NavKey } | { kind: "boundary"; dir: 1 | -1 } | null;

/** 같은 칸인가 — 시각 없는 칸은 `undefined`·`null` 을 같게 본다. */
export const sameNavKey = (a: NavKey, b: { code: string; date: string; time?: string | null }): boolean =>
    a.code === b.code && a.date === b.date && (a.time ?? null) === (b.time ?? null);

/** 책갈피 — 판의 손이 마지막으로 선 칸 + 그때의 순번 + 그때의 scope(useWalkCursor). */
export interface WalkMark {
    key: NavKey;
    idx: number;
    scope: string;
}

/**
 * 책갈피에서 한 칸. 책갈피 행이 목록에서 사라졌으면(조건 변경·좁히기) **그 순번 자리**에서 잇는다 —
 * 뒤 칸들이 한 칸씩 당겨져 `idx` 에 선 칸이 "다음", 그 앞이 "이전"이다(처음으로 튀면 자리를 잃는다).
 * 앞 행까지 같이 빠져 `idx` 가 목록 길이를 넘으면 "이전" = 마지막 칸이다 — boundary 로 읽으면 일별 판이
 * 엉뚱하게 전날로 넘어간다(리뷰가 잡은 자리). "다음" 은 끝 너머 = boundary 그대로(책갈피가 끝보다 뒤였다).
 */
export function stepFromMark(order: readonly NavKey[], mark: WalkMark, dir: 1 | -1): WalkStep {
    if (order.length === 0) return null;
    const at = order.findIndex((k) => sameNavKey(k, mark.key));
    const next = at >= 0 ? at + dir : dir > 0 ? mark.idx : Math.min(mark.idx, order.length) - 1;
    if (next < 0 || next >= order.length) return { kind: "boundary", dir };
    return { kind: "move", to: order[next]! };
}

/**
 * 목록 안에서 한 칸 — 끝을 넘으면 `boundary`(호출자가 날짜를 넘길지 정한다).
 * 커서가 목록에 없으면 방향의 첫 항목으로 들어간다.
 * 시각 없는 칸(하루 라벨만 있는 차트의 머리줄)은 커서 `time: null`(goToDay)과 맞는다 — `undefined` 와 `null` 을 같게 본다.
 */
export function stepWithin(order: readonly NavKey[], cursor: WalkCursor | null, dir: 1 | -1): WalkStep {
    if (order.length === 0) return null;
    const at = cursor === null ? -1 : order.findIndex((k) => sameNavKey(k, cursor));
    if (at < 0) return { kind: "move", to: dir > 0 ? order[0]! : order[order.length - 1]! };
    const next = at + dir;
    if (next < 0 || next >= order.length) return { kind: "boundary", dir };
    return { kind: "move", to: order[next]! };
}
