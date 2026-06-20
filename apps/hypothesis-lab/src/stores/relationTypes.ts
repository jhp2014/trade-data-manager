import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
    DEFAULT_RELATION_TYPES,
    makeRelationValue,
    type RelationTypeDef,
} from "@/domain/relationType";

// 브라우저에서만 localStorage 사용. SSR·테스트(node)에선 no-op.
const noopStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

/**
 * 관계 종류(relationType) 정의를 보유하는 클라이언트 영속 스토어.
 * 그래프 간선 스타일·생성 드롭다운·순환검사 directional 집합이 이 목록에서 파생되고,
 * 설정 모달에서 추가/편집/삭제한다.
 * hypothesisRelations.relationType 에는 value 키만 저장되므로, 종류를 지워도
 * 기존 간선은 보존된다(모르는 value 는 중립 스타일 폴백).
 */
type RelationTypesState = {
    options: RelationTypeDef[];
    /** 새 종류 추가(label 에서 안전 value 자동 생성). 추가된 value 반환, 빈 label 이면 null. */
    addOption: (def: Omit<RelationTypeDef, "value">) => string | null;
    /** value 로 종류 일부 필드 수정(label 변경 포함. value 자체는 불변). */
    updateOption: (value: string, patch: Partial<Omit<RelationTypeDef, "value">>) => void;
    /** value 로 종류 정의 삭제(기존 DB 간선은 보존, 중립 폴백). */
    removeOption: (value: string) => void;
};

export const useRelationTypes = create<RelationTypesState>()(
    persist(
        (set, get) => ({
            options: DEFAULT_RELATION_TYPES.map((d) => ({ ...d })),
            addOption: (def) => {
                const label = def.label.trim();
                if (label === "") return null;
                const existing = get().options;
                const value = makeRelationValue(
                    label,
                    existing.map((o) => o.value),
                );
                set({ options: [...existing, { ...def, label, value }] });
                return value;
            },
            updateOption: (value, patch) =>
                set((s) => ({
                    options: s.options.map((o) =>
                        o.value === value
                            ? { ...o, ...patch, value: o.value }
                            : o,
                    ),
                })),
            removeOption: (value) =>
                set((s) => ({ options: s.options.filter((o) => o.value !== value) })),
        }),
        {
            name: "hypothesis-lab-relation-types",
            storage: createJSONStorage(() =>
                typeof window !== "undefined" ? window.localStorage : noopStorage,
            ),
        },
    ),
);
