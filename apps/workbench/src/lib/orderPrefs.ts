// 키 목록의 사용자 순서·드래그 이동 규칙(순수) — 옛 시트 열 설정에서 이사(2026-09-26 시트 은퇴).
// 지금 소비자는 타점 정보 패널의 순서·숨김 한 벌이다.

/**
 * 사용자 순서(pref)를 기본 순서에 입힌다 — 셈: 기본 순서를 훑으며 마지막으로 본 pref 순위를 기억하고,
 * 모르는 키엔 그 순위 **바로 뒤의 소수 자리**를 준다(같은 틈의 키끼리는 기본 순서 유지).
 */
export function orderByPref<T>(items: readonly T[], keyOf: (it: T) => string, pref: readonly string[]): T[] {
    if (pref.length === 0) return [...items];
    const rank = new Map(pref.map((k, i) => [k, i]));
    const eff = new Map<string, number>();
    let last = -1; // 지금까지 본 pref 순위의 **최댓값**(-1 = 아직 하나도 못 봤다 = 첫 pref 키보다 앞)
    let gap = 0;
    for (const it of items) {
        const k = keyOf(it);
        const r = rank.get(k);
        if (r !== undefined) {
            last = Math.max(last, r); // **최대**여야 한다: pref 가 기본 순서를 거스르면(키 하나를 앞으로
            gap = 0;                  // 끌어 둔 경우) "마지막으로 본 순위"는 뒤로 물러서고, 그 뒤의 모르는
            eff.set(k, r);            // 키들이 그만큼 앞으로 끼어든다.
        } else {
            gap += 1;
            eff.set(k, last + gap / (items.length + 1)); // < last+1 이라 다음 pref 키를 못 넘는다
        }
    }
    return [...items].sort((a, b) => eff.get(keyOf(a))! - eff.get(keyOf(b))!);
}

/**
 * 드롭하면 target 의 **어느 쪽**에 서나 — 뒤로 끌면 뒤, 앞으로 끌면 앞. 판정은 손이 움직인 목록,
 * 즉 **화면 순서**로 한다.
 */
export function dropSide(shown: readonly string[], dragged: string, target: string): "before" | "after" | null {
    const from = shown.indexOf(dragged);
    const to = shown.indexOf(target);
    if (from < 0 || to < 0 || from === to) return null;
    return from < to ? "after" : "before";
}

/**
 * dragged 를 target 의 앞/뒤로 옮긴다 — **움직이는 건 그 키 하나뿐**이고 나머지의 상대 순서는 그대로다
 * (화면 순서를 저장 순서에 통째로 베끼면 드래그 한 번이 손 안 댄 키의 자리를 영구히 바꾼다).
 * 바뀔 게 없으면 null(호출부가 쓸데없는 저장을 안 하게).
 */
export function placeCol(keys: readonly string[], dragged: string, target: string, side: "before" | "after"): string[] | null {
    if (dragged === target || keys.indexOf(dragged) < 0 || keys.indexOf(target) < 0) return null;
    const rest = keys.filter((k) => k !== dragged);
    const at = rest.indexOf(target) + (side === "after" ? 1 : 0);
    const next = [...rest.slice(0, at), dragged, ...rest.slice(at)];
    return next.every((k, i) => k === keys[i]) ? null : next;
}
