// 맵 컨테이너 레이아웃(순수) — "그룹 안 그룹"을 **영역 포함**으로 그리기 위한 좌표 계산 전부.
//
// 규칙 세 개가 이 파일의 전부다:
//   · 잎(자식 없음)은 고정 크기, 저장 좌표(중심·절대)를 그대로 쓴다.
//   · 컨테이너(자식 있음)의 자리·크기는 **자식들의 바운딩 박스에서 유도**한다 — 저장 좌표는 무시.
//     컨테이너를 손으로 늘리는 손잡이가 없어야 "안에 있음 = 하위다"가 늘 참이다(어긋난 시각이 없다).
//   · React Flow 의 자식 좌표는 부모 왼쪽위 기준 **상대**이고 부모가 배열에서 먼저 와야 한다 —
//     이 변환을 화면 코드에 흘리면 드래그 커밋(상대→절대 역변환)과 어긋나기 쉬워 여기 가둔다.
//
// 순환·끊긴 부모는 최상위로 취급한다(groupTree 와 같은 방어 — 값이 조금 틀린 것과 화면이 멈추는
// 것은 대가가 다르다).
export interface LayoutItem {
    id: string;
    parentId: string | null;
    /** 저장 좌표 = 절대 **중심**. 잎만 쓴다(컨테이너는 유도). */
    x: number;
    y: number;
    /** 잎 크기 — 호출부가 leafSize 로 만들어 준다(컨테이너는 무시하고 자식에서 유도). */
    w: number;
    h: number;
}

/**
 * 잎 = **네모 + 안쪽 텍스트**(이름 · 수). 크기는 수를 나르지 않는다 — 양은 겹침 선의 두께가 맡는다.
 * 높이는 한 줄 고정, 폭만 이름 길이를 따른다.
 */
export const LEAF_H = 34;
export const LEAF_MIN_W = 96;
export const LEAF_MAX_W = 220;
/** 컨테이너 안쪽 여백과 라벨 줄 높이. */
export const BOX_PAD = 16;
export const BOX_HEADER = 22;

const PAD_X = 10;
/** 수가 앉는 고정 칸 — 필터로 수가 바뀔 때마다 상자가 들썩이지 않게 폭은 **이름만** 보고 정한다. */
const COUNT_SLOT = 30;

/**
 * 이름 → 글자 폭 추정(측정 없이). 레이아웃이 순수해야 컨테이너 박스를 DOM 없이 계산할 수 있어서,
 * 실측 대신 자폭을 어림한다: 한글·전각은 약 12px, 그 외(영문·숫자·기호)는 약 7px @12px 기준.
 * 어림이 빗나가는 아주 긴 이름은 말줄임이 받는다(전체 이름은 툴팁·작업줄에).
 */
export function textWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! > 0x1100 ? 12 : 7;
    return w;
}

/** 잎 크기 — 폭은 이름에서, 높이는 고정. 수는 고정 칸이라 폭에 영향을 주지 않는다. */
export function leafSize(name: string): { w: number; h: number } {
    const want = PAD_X * 2 + textWidth(name) + COUNT_SLOT;
    return { w: Math.max(LEAF_MIN_W, Math.min(LEAF_MAX_W, Math.round(want))), h: LEAF_H };
}

export interface LaidNode {
    id: string;
    /** RF 부모(있으면 position 이 그 부모의 왼쪽위 기준 상대). */
    parentId?: string;
    /** RF position — 루트는 절대 왼쪽위, 자식은 부모 상대 왼쪽위. */
    position: { x: number; y: number };
    width: number;
    height: number;
    /** 자식이 있어 영역으로 그려지는가. */
    container: boolean;
    /** 중첩 깊이(루트 0) — zIndex(자식이 위로) 재료. */
    depth: number;
    /** 절대 사각형 — 드래그 드롭 판정·좌표 역변환이 이걸 본다. */
    abs: { x: number; y: number; w: number; h: number };
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * 절대 박스 계산(재귀·메모) — 잎은 저장 중심에서, 컨테이너는 자식 박스 합집합 + 여백.
 * 방문 중 표시(visiting)로 순환을 끊는다.
 */
function absBoxes(items: readonly LayoutItem[]): Map<string, Box> {
    const byId = new Map(items.map((i) => [i.id, i]));
    const kids = new Map<string, LayoutItem[]>();
    for (const it of items) {
        if (it.parentId === null || !byId.has(it.parentId)) continue;
        const list = kids.get(it.parentId);
        if (list) list.push(it);
        else kids.set(it.parentId, [it]);
    }
    const memo = new Map<string, Box>();
    const visiting = new Set<string>();
    const boxOf = (it: LayoutItem): Box => {
        const hit = memo.get(it.id);
        if (hit) return hit;
        const children = kids.get(it.id) ?? [];
        let box: Box;
        if (children.length === 0 || visiting.has(it.id)) {
            box = { x: it.x - it.w / 2, y: it.y - it.h / 2, w: it.w, h: it.h };
        } else {
            visiting.add(it.id);
            const cb = children.map(boxOf);
            visiting.delete(it.id);
            const x0 = Math.min(...cb.map((b) => b.x)) - BOX_PAD;
            const y0 = Math.min(...cb.map((b) => b.y)) - BOX_PAD - BOX_HEADER;
            const x1 = Math.max(...cb.map((b) => b.x + b.w)) + BOX_PAD;
            const y1 = Math.max(...cb.map((b) => b.y + b.h)) + BOX_PAD;
            box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        memo.set(it.id, box);
        return box;
    };
    for (const it of items) boxOf(it);
    return memo;
}

/** 부모가 배열에서 먼저 오도록(RF 요구) 루트부터 층별로 편다. 순환·끊긴 부모는 루트 취급. */
function topoOrder(items: readonly LayoutItem[]): { item: LayoutItem; depth: number; parent: LayoutItem | null }[] {
    const byId = new Map(items.map((i) => [i.id, i]));
    const out: { item: LayoutItem; depth: number; parent: LayoutItem | null }[] = [];
    const placed = new Set<string>();
    let frontier = items.filter((i) => i.parentId === null || !byId.has(i.parentId));
    let depth = 0;
    while (frontier.length > 0 && placed.size < items.length) {
        for (const it of frontier) {
            placed.add(it.id);
            out.push({ item: it, depth, parent: it.parentId !== null ? (byId.get(it.parentId) ?? null) : null });
        }
        const prev = new Set(frontier.map((i) => i.id));
        frontier = items.filter((i) => !placed.has(i.id) && i.parentId !== null && prev.has(i.parentId));
        depth++;
    }
    // 남은 것 = 순환에 갇힌 노드 — 루트로 꺼내 그리기는 계속한다.
    for (const it of items) if (!placed.has(it.id)) out.push({ item: it, depth: 0, parent: null });
    return out;
}

/** 레이아웃 본체 — RF 노드 배열(부모 먼저)로. */
export function layoutMap(items: readonly LayoutItem[]): LaidNode[] {
    const boxes = absBoxes(items);
    const ordered = topoOrder(items);
    const isParentOf = new Set(ordered.filter((e) => e.parent !== null).map((e) => e.parent!.id));
    return ordered.map(({ item, depth, parent }) => {
        const box = boxes.get(item.id)!;
        const parentBox = parent ? boxes.get(parent.id) : undefined;
        return {
            id: item.id,
            ...(parent ? { parentId: parent.id } : {}),
            position: parentBox ? { x: box.x - parentBox.x, y: box.y - parentBox.y } : { x: box.x, y: box.y },
            width: box.w,
            height: box.h,
            container: isParentOf.has(item.id),
            depth,
            abs: box,
        };
    });
}

/**
 * 드롭 판정 — 이 절대점을 담는 그룹 중 **가장 깊은 것**(제 자신·제 자손 제외: 자손에 넣으면 순환).
 * 잎에 떨어뜨리는 것도 허용한다 — 그게 첫 중첩을 만드는 손짓이다.
 */
export function dropTargetAt(
    laid: readonly LaidNode[],
    point: { x: number; y: number },
    draggedId: string,
): string | null {
    const subtree = new Set<string>([draggedId]);
    // laid 는 부모 먼저라 한 번 훑으면 자손이 전부 모인다.
    for (const n of laid) if (n.parentId !== undefined && subtree.has(n.parentId)) subtree.add(n.id);
    let best: LaidNode | null = null;
    for (const n of laid) {
        if (subtree.has(n.id)) continue;
        const { x, y, w, h } = n.abs;
        if (point.x < x || point.x > x + w || point.y < y || point.y > y + h) continue;
        if (best === null || n.depth > best.depth) best = n;
    }
    return best?.id ?? null;
}

/** 네 변 — 겹침 선이 붙는 자리(각 변의 가운데에 점 하나). */
export type Side = "t" | "r" | "b" | "l";

/**
 * 두 상자 사이에서 쓸 변 한 쌍 — 중심을 잇는 방향이 **가로에 가까우면 좌우, 세로에 가까우면 상하**.
 * 선이 상자를 가로지르지 않고 마주 보는 변끼리 이어져, 기본 곡선이 그 변의 법선으로 빠져나간다
 * (위/아래 두 개만 두면 대상이 위에 있을 때 아래로 나갔다 되돌아 올라오는 고리가 생긴다 — 그게 꼬임이었다).
 */
export function sidesBetween(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): { source: Side; target: Side } {
    const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
    const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { source: "r", target: "l" } : { source: "l", target: "r" };
    return dy >= 0 ? { source: "b", target: "t" } : { source: "t", target: "b" };
}

/** RF 상태의 (상대) 위치 → 절대 **중심** — 드래그 커밋이 저장 좌표(중심)로 되돌릴 때 쓴다. */
export function absCenterOf(
    laid: readonly LaidNode[],
    id: string,
    position: { x: number; y: number },
): { x: number; y: number } | null {
    const node = laid.find((n) => n.id === id);
    if (!node) return null;
    const parent = node.parentId !== undefined ? laid.find((n) => n.id === node.parentId) : undefined;
    const absX = (parent?.abs.x ?? 0) + position.x;
    const absY = (parent?.abs.y ?? 0) + position.y;
    return { x: absX + node.width / 2, y: absY + node.height / 2 };
}
