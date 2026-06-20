import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
    DEFAULT_OUTCOME_OPTIONS,
    makeOutcomeValue,
    type OutcomeColor,
    type OutcomeOption,
} from "@/domain/outcome";

// 브라우저에서만 localStorage 사용. SSR·테스트(node)에선 no-op.
const noopStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

/**
 * outcome 종류(enum) 정의를 보유하는 클라이언트 영속 스토어.
 * 카드 더블클릭 선택기와 집계가 이 목록에서 파생되고, 설정 모달에서 추가/삭제한다.
 * cases.outcome 에는 value 키만 저장되므로, 종류를 지워도 기존 데이터는 보존된다.
 */
type OutcomeTypesState = {
    options: OutcomeOption[];
    /** label+color 로 새 종류 추가(중복 안전 value 자동 생성). 추가된 value 반환. */
    addOption: (label: string, color: OutcomeColor) => string | null;
    /** value 로 종류 삭제(기존 케이스 값은 그대로 두되 중립 표시로 폴백). */
    removeOption: (value: string) => void;
};

export const useOutcomeTypes = create<OutcomeTypesState>()(
    persist(
        (set, get) => ({
            options: [...DEFAULT_OUTCOME_OPTIONS],
            addOption: (label, color) => {
                const trimmed = label.trim();
                if (trimmed === "") return null;
                const existing = get().options;
                if (existing.some((o) => o.label === trimmed)) return null;
                const value = makeOutcomeValue(
                    trimmed,
                    existing.map((o) => o.value),
                );
                set({ options: [...existing, { value, label: trimmed, color }] });
                return value;
            },
            removeOption: (value) =>
                set((s) => ({ options: s.options.filter((o) => o.value !== value) })),
        }),
        {
            name: "hypothesis-lab-outcomes",
            storage: createJSONStorage(() =>
                typeof window !== "undefined" ? window.localStorage : noopStorage,
            ),
        },
    ),
);
