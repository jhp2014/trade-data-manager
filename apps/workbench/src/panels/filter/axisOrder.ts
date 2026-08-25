// 집합 편성 보드의 **레일 순서**(순수) — 조건이 아니라 보기 순서다. 로컬에만 산다.
//
// ⚠ 시트의 축 서열(store rankAxisOrder)과 **다른 저장물**이다(사용자 확정). 같은 축이 두 화면에서
// 다른 자리에 설 수 있다는 뜻이고, 그게 이 분리의 대가다 — 대신 한쪽에서 끌어도 다른 쪽이 안 움직인다.
// 보드는 조건을 거는 순서로, 시트는 읽는 순서로 각각 정렬하고 싶다는 요구가 그 대가를 산다.
//
// 저장은 **id 목록 하나**다(층위별로 안 가른다): 층위는 축 정의(scope)가 이미 말하고, 보드는 그 층위
// 칸으로 걸러 그린다. 목록을 둘로 가르면 축의 scope 가 바뀌었을 때 두 목록 중 어디에 있어야 하는지가
// 애매해진다 — 한 목록이면 걸러지고 끝이다.

/** 순서 pref 파싱(localStorage) — 문자열 배열이 아니면 통째로 버린다(기본 = 서버/서열 순). */
export const parseAxisOrder = (o: unknown): string[] | null =>
    Array.isArray(o) && o.every((k) => typeof k === "string") ? (o as string[]) : null;

/**
 * pref 를 입혀 정렬 — pref 에 없는 축은 **뒤로**, 그 안에서는 들어온 순서를 지킨다(Array.sort 는 안정).
 * 즉 한 번도 안 옮긴 상태면 화면은 지금과 똑같다(들어온 순서 = 축 서열). 새로 생긴 축도 뒤에 붙는다.
 */
export function orderAxes<T extends { key: string }>(axes: readonly T[], pref: readonly string[]): T[] {
    if (pref.length === 0) return [...axes];
    const idx = new Map(pref.map((k, i) => [k, i]));
    return [...axes].sort((a, b) => (idx.get(a.key) ?? Infinity) - (idx.get(b.key) ?? Infinity));
}

/**
 * dragged 를 target 자리로 — 결과는 **지금 화면에 있는 축들의 전체 목록**이다(양 층위 다).
 * 화면 목록으로 새로 쓰므로 지워진 축의 죽은 id 는 여기서 자연히 청소된다.
 * 움직일 게 없으면 null — 호출부가 쓸데없는 저장을 안 하게.
 */
export function moveAxis(ids: readonly string[], dragged: string, target: string): string[] | null {
    if (dragged === target) return null;
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(target);
    if (from < 0 || to < 0) return null;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    return next;
}

/**
 * 드롭하면 target 의 **어느 쪽**에 서나 — 표시선(2px)이 실제 결과와 어긋나면 안 되니 moveAxis 와 같은
 * 셈에서 나온다. 먼저 뽑고(splice) 넣기 때문에 아래로 끌면 target 뒤, 위로 끌면 target 앞이다.
 * 그릴 게 없으면 null(자기 자신·목록 밖).
 */
export function dropEdge(ids: readonly string[], dragged: string, target: string): "before" | "after" | null {
    if (dragged === target) return null;
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(target);
    if (from < 0 || to < 0) return null;
    return from < to ? "after" : "before";
}
