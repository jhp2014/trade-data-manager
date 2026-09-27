// 목록 걷기(w/s)의 순수부 — 옛 작업 대상(workset/rows)에서 탐색판이 쓰던 조각만 옮겼다(2026-09-27 작업 대상 은퇴).

/** 순회 커서가 밟는 한 칸 — 하루 우주의 행은 좌표(종목·날짜·시각)다. */
export interface NavKey {
    code: string;
    date: string;
    time?: string;
}

/**
 * 목록 안에서 한 칸 — 끝을 넘으면 `boundary`(호출자가 날짜를 넘길지 정한다).
 * 커서가 목록에 없으면 방향의 첫 항목으로 들어간다.
 */
export function stepWithin(
    order: readonly NavKey[],
    cursor: { code: string; date: string; time: string | null } | null,
    dir: 1 | -1,
): { kind: "move"; to: NavKey } | { kind: "boundary"; dir: 1 | -1 } | null {
    if (order.length === 0) return null;
    const at = cursor === null ? -1 : order.findIndex((k) => k.code === cursor.code && k.date === cursor.date && k.time === cursor.time);
    if (at < 0) return { kind: "move", to: dir > 0 ? order[0]! : order[order.length - 1]! };
    const next = at + dir;
    if (next < 0 || next >= order.length) return { kind: "boundary", dir };
    return { kind: "move", to: order[next]! };
}
