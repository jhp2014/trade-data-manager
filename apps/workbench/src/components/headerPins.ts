// 머리글 컨트롤의 **핀·순서 영속** — 순수 로직만(React 없음). 그리는 쪽은 HeaderControls 가 한다.
//
// 저장하는 건 **예외뿐**이다: 언핀 목록(핀이 기본)과 손이 바꾼 순서. 그래야 나중에 추가된 컨트롤이
// "목록에 없다"는 이유로 숨거나 맨 뒤로 밀리지 않는다 — 모르는 것은 코드가 말하게 둔다.

export interface PinState {
    unpinned: readonly string[];
    order: readonly string[];
}
export const EMPTY_PINS: PinState = { unpinned: [], order: [] };

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** 옛 형식(언핀 배열만)도 읽는다 — 순서 기능이 붙기 전에 꽂아 둔 핀이 초기화되지 않게. */
export function parsePins(raw: unknown): PinState | null {
    if (isIds(raw)) return { unpinned: raw, order: [] };
    if (raw && typeof raw === "object") {
        const o = raw as { unpinned?: unknown; order?: unknown };
        if (isIds(o.unpinned) || isIds(o.order)) {
            return { unpinned: isIds(o.unpinned) ? o.unpinned : [], order: isIds(o.order) ? o.order : [] };
        }
    }
    return null;
}

/**
 * 저장된 순서를 지금 컨트롤 목록에 씌운다.
 *  · 저장에 있고 지금도 있는 것 → 저장된 순서대로
 *  · 저장에 **없는 것**(새로 생긴 컨트롤) → 맨 뒤가 아니라 **선언에서 바로 앞에 있던 이웃 뒤**에.
 *    맨 뒤로 던지면 새 컨트롤이 늘 낯선 자리에 나타나고, 선언 순서가 가진 뜻(비슷한 것끼리 이웃)이 죽는다.
 *  · 저장에만 있고 지금 없는 것(사라진 컨트롤·다른 grain) → 조용히 무시. 지우지는 않는다 —
 *    일봉/분봉처럼 available 로 갈리는 패널에서 저쪽 순서를 날려 버리면 안 된다.
 */
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
    if (order.length === 0) return [...items];
    const byId = new Map(items.map((i) => [i.id, i]));
    const out = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
    const placed = new Set(out.map((x) => x.id));

    // 선언 순서로 훑는다 — 새 것이 여럿이면 앞의 새 것이 뒤의 새 것에게 다시 이웃이 된다.
    items.forEach((it, i) => {
        if (placed.has(it.id)) return;
        let at = 0;
        for (let k = i - 1; k >= 0; k--) {
            const idx = out.findIndex((x) => x.id === items[k]!.id);
            if (idx >= 0) { at = idx + 1; break; }
        }
        out.splice(at, 0, it);
        placed.add(it.id);
    });
    return out;
}
