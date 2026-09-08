// 조립 슬라이스 — 부품(저장 집합) **참조**들의 평평한 합집합(OR)을 이름 붙여 영속한다.
//
// 저장 집합(savedSetsSlice)과 성질이 다르다: 저장 집합은 **사본 자립**(하나를 고쳐도 형제가 안 변함)이고,
// 조립은 **참조**다 — 부품을 덮어쓰면 그걸 쓰는 조립이 따라온다(부품의 존재 이유). 죽은 참조(지워진
// 부품)는 지우지 않고 그대로 둔다: 깨진 표시가 계약이다(바인딩의 "깨진 참조 = 빈 집합 + 라벨" 규칙).
//
// OR 는 깔때기 안이 아니라 여기(조립층)에만 있다 — 깔때기 계약(AND 사슬·한계기여도·5칸)은 부품 안에서만
// 성립하고, 조립의 진단은 부품별 고유 기여다(.claude/decisions.md 「집합 조립 (OR)」).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { loadJson, saveJson } from "./persist.js";

const ASSEMBLIES_KEY = "wb.assemblies.v1";

/** 조립의 부품 한 줄 — setId 는 저장 집합 참조. enabled=false 는 지우지 않고 잠깐 빼보는 손짓(단계 on/off 와 동형). */
export interface AssemblyMember {
    setId: string;
    enabled: boolean;
}

/** 조립 — 부품 참조들의 합집합. members 의 setId 는 저장 집합만이다(조립 중첩은 구조적으로 금지 — 파서가 거른다). */
export interface Assembly {
    id: string;
    name: string;
    members: AssemblyMember[];
}

/** 조립 id 접두 — 저장 집합(fs…)과 갈라, 핀 목록 공유·중첩 차단 판정이 접두 하나로 된다. */
const isAssemblyId = (id: string): boolean => id.startsWith("as");

/**
 * 저장본 파싱 — savedSets 로더와 같은 결(항목 단위 관대): 모양이 안 맞는 **항목만** 버리고 나머지는
 * 살린다. 부품 줄은 더 관대하다 — setId 만 맞으면 살리고(enabled 오염은 true), 조립 id 를 든 부품
 * (중첩 시도)과 중복 setId 는 여기서 거른다(리졸버·UI 가 같은 유효성 정의를 보게 파서 한 곳에서).
 * 죽은 setId(지워진 부품)는 **거르지 않는다** — 깨진 표시가 계약이다.
 */
export const parseAssemblies = (o: unknown): Assembly[] | null => {
    if (!Array.isArray(o)) return null;
    const out: Assembly[] = [];
    for (const raw of o) {
        const a = raw as { id?: unknown; name?: unknown; members?: unknown };
        if (typeof a?.id !== "string" || a.id === "" || typeof a.name !== "string" || a.name.trim() === "") continue;
        const members: AssemblyMember[] = [];
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

export interface AssembliesSlice {
    /** 조립들(영속) — SetManager 「조립」 구역이 만들고, 집합 줄 ∪ 칩·viewOf 가 참조한다. */
    assemblies: Assembly[];
    /** 빈 조립 신설(자동 이름 "조립 N") — 부품은 만들고 나서 체크로 담는다. */
    createAssembly: () => void;
    /** 이름만 바꾼다(id·부품 유지). 빈 이름·다른 조립과 같은 이름은 무시(renameSet 규칙 그대로). */
    renameAssembly: (id: string, name: string) => void;
    deleteAssembly: (id: string) => void;
    /** 부품 넣기/빼기 토글 — 없으면 추가(enabled), 있으면 제거. 조립 id 는 받지 않는다(중첩 금지). */
    toggleAssemblyMember: (assemblyId: string, setId: string) => void;
    /** 부품 켬/끔 — 지우지 않고 평가에서 빼본다(고유 기여를 눈으로 확인하는 손짓). */
    setAssemblyMemberEnabled: (assemblyId: string, setId: string, enabled: boolean) => void;
}

export const createAssembliesSlice: StateCreator<WorkbenchState, [], [], AssembliesSlice> = (set) => {
    const put = (next: Assembly[]): Pick<AssembliesSlice, "assemblies"> => {
        saveJson(ASSEMBLIES_KEY, next);
        return { assemblies: next };
    };
    return {
        assemblies: loadJson(ASSEMBLIES_KEY, parseAssemblies) ?? [],

        createAssembly: () => set((s) => {
            // 자동 이름 — 겹치지 않는 첫 "조립 N". 이름이 유일해야 renameAssembly 의 중복 거부와 아귀가 맞는다.
            let n = s.assemblies.length + 1;
            while (s.assemblies.some((a) => a.name === `조립 ${n}`)) n += 1;
            // id 에 난수 꼬리 — 같은 ms 의 연속 생성이 같은 id 가 되지 않게(newStageId 와 같은 규칙).
            const a: Assembly = { id: `as${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: `조립 ${n}`, members: [] };
            return put([...s.assemblies, a]);
        }),

        renameAssembly: (id, name) => set((s) => {
            const n = name.trim();
            if (!n || s.assemblies.some((a) => a.id !== id && a.name === n) || !s.assemblies.some((a) => a.id === id)) return {};
            return put(s.assemblies.map((a) => (a.id === id ? { ...a, name: n } : a)));
        }),

        deleteAssembly: (id) => set((s) => {
            const sel = s.selectedSetRef;
            return {
                ...put(s.assemblies.filter((a) => a.id !== id)),
                // 선택 포인터가 이 조립이면 푼다(작업 깔때기 복귀) — deleteSet 의 규칙 그대로.
                ...(sel?.kind === "assembly" && sel.id === id ? { selectedSetRef: null } : {}),
            };
        }),

        toggleAssemblyMember: (assemblyId, setId) => set((s) => {
            if (isAssemblyId(setId)) return {}; // 조립을 부품으로 — 구조적 금지(파서와 같은 판정)
            const a = s.assemblies.find((x) => x.id === assemblyId);
            if (!a) return {};
            const has = a.members.some((m) => m.setId === setId);
            const members = has ? a.members.filter((m) => m.setId !== setId) : [...a.members, { setId, enabled: true }];
            return put(s.assemblies.map((x) => (x.id === assemblyId ? { ...x, members } : x)));
        }),

        setAssemblyMemberEnabled: (assemblyId, setId, enabled) => set((s) => {
            const a = s.assemblies.find((x) => x.id === assemblyId);
            if (!a || !a.members.some((m) => m.setId === setId)) return {};
            const members = a.members.map((m) => (m.setId === setId ? { ...m, enabled } : m));
            return put(s.assemblies.map((x) => (x.id === assemblyId ? { ...x, members } : x)));
        }),
    };
};
