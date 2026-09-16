// 패널 슬롯 문법 — 인스턴스 id = `${idBase}-${n}` (n ≥ 1, 닫힌 최소 번호 재사용).
// 순수 함수만 둔다(카탈로그·스토어 무의존 = 테스트 표면). 어느 밑동이 실존 타입인지는
// panelCatalog 의 몫이고, 여기는 문자열 문법만 안다.

export interface SlotRef {
    base: string;
    n: number;
}

/** 슬롯 id 조립. `slotIdOf("chart", 2)` → `"chart-2"`. */
export function slotIdOf(base: string, n: number): string {
    return `${base}-${n}`;
}

/**
 * 슬롯 id 분해. 밑동에 하이픈이 있어도 된다("hot-points-1" → base "hot-points").
 * 꼬리 숫자가 없거나 0/앞자리 0 이면 null — `slotIdOf(parse(id))` 왕복이 항등이어야
 * 대장·칩·리졸버가 같은 id 를 서로 다른 슬롯으로 읽지 않는다.
 */
export function parseSlotId(id: string): SlotRef | null {
    const m = /^(.+)-([1-9]\d*)$/.exec(id);
    if (!m) return null;
    return { base: m[1], n: Number(m[2]) };
}

/** 그 밑동의 다음 빈 슬롯 번호 — 소멸된 번호를 재사용한다(설정 잔류 = 부활이 기능). */
export function nextFreeSlot(base: string, existingIds: Iterable<string>): number {
    const used = new Set<number>();
    for (const id of existingIds) {
        const s = parseSlotId(id);
        if (s && s.base === base) used.add(s.n);
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
}
