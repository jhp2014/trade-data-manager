// 패널 id = `${타입}-${n}` — 같은 타입을 여러 개 띄울 수 있다(설정 창 「패널」로 하나 더).
export function parseSlot(id: string): { base: string; n: number } | null {
    const m = /^(.+)-(\d+)$/.exec(id);
    return m ? { base: m[1], n: Number(m[2]) } : null;
}

/** 안 쓰는 가장 작은 번호의 id. used = 열린 패널 + 최소화한 패널(대장) — 최소화한 것의 번호를 빼앗지 않는다. */
export function nextSlotId(used: Iterable<string>, base: string): string {
    const taken = new Set(used);
    for (let n = 1; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
