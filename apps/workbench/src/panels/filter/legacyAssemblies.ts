// 옛 조립 저장물(`wb.assemblies.v1`) — **동결된 읽기 전용 잔해**다. 2026-09-19 조립층 철거로 슬라이스와
// UI 는 사라졌지만, 저장물은 **지우지 않고 재워 둔다**: 식 트리(5단계)가 들어올 때 옛 조립을
// `OR(참조…)` 노드로 무손실 승계할 재료이기 때문이다(decisions.md 「집합 편성 재설계」의 승계 규칙).
//
// 그래서 여기는 **파서와 키만** 있고 쓰기 경로가 없다 — 옛 `probe` 패널 조건을 재워 둔 legacyProbe.ts
// 와 같은 자리다. 승계가 끝나면 이 파일과 키를 통째로 지운다.
//
// ⚠ 파싱 규칙을 **손대지 않는다**(항목 단위 관대 · 조립 중첩 차단 · 죽은 setId 는 안 거름). 승계가
// 읽어야 하는 건 "그때 그 사용자가 실제로 보던 것"이고, 규칙을 고치면 그게 조용히 달라진다.

/** 조립의 부품 한 줄 — setId 는 저장 집합 참조. enabled=false 는 "지우지 않고 빼보기"였다. */
export interface LegacyAssemblyMember {
    setId: string;
    enabled: boolean;
}

/** 옛 조립 — 부품 참조들의 평평한 합집합(OR). members 의 setId 는 저장 집합만이다. */
export interface LegacyAssembly {
    id: string;
    name: string;
    members: LegacyAssemblyMember[];
}

export const LEGACY_ASSEMBLIES_KEY = "wb.assemblies.v1";

/** 조립 id 접두 — 저장 집합(fs…)과 갈라, 중첩 차단 판정이 접두 하나로 됐다. */
const isAssemblyId = (id: string): boolean => id.startsWith("as");

/**
 * 저장본 파싱 — savedSets 로더와 같은 결(항목 단위 관대): 모양이 안 맞는 **항목만** 버리고 나머지는
 * 살린다. 부품 줄은 더 관대하다 — setId 만 맞으면 살리고(enabled 오염은 true), 조립 id 를 든 부품
 * (중첩 시도)과 중복 setId 는 여기서 거른다. 죽은 setId(지워진 부품)는 **거르지 않는다**.
 */
export const parseLegacyAssemblies = (o: unknown): LegacyAssembly[] | null => {
    if (!Array.isArray(o)) return null;
    const out: LegacyAssembly[] = [];
    for (const raw of o) {
        const a = raw as { id?: unknown; name?: unknown; members?: unknown };
        if (typeof a?.id !== "string" || a.id === "" || typeof a.name !== "string" || a.name.trim() === "") continue;
        const members: LegacyAssemblyMember[] = [];
        const seen = new Set<string>();
        for (const m of Array.isArray(a.members) ? a.members : []) {
            const mm = m as { setId?: unknown; enabled?: unknown };
            if (typeof mm?.setId !== "string" || mm.setId === "" || isAssemblyId(mm.setId) || seen.has(mm.setId)) continue;
            seen.add(mm.setId);
            members.push({ setId: mm.setId, enabled: mm.enabled !== false });
        }
        out.push({ id: a.id, name: a.name, members });
    }
    return out;
};
