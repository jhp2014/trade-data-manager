// 가설 큐레이션 슬라이스 — 선택 축(리스트↔그래프 하이라이트) + 필터 draft(DNF) 편집 + 속성 패싯 드릴다운.
import type { StateCreator } from "zustand";
import type { HypothesisFilterExpr, PointAttr } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";

export interface HypothesisSlice {
    selectedHypothesisId: string | null; // 가설 선택 축 — 리스트↔그래프 하이라이트 동기화.
    // 가설 필터 draft(DNF: AND그룹들의 OR). 어느 surface(그래프·목록)든 addFilterLeaf 로 채운다.
    // 활성(비어있지 않은 그룹 ≥1)이면 작업셋이 월별→전 기간 필터 모드로 전환(모드 플래그 없이 활성여부가 곧 모드).
    filterDraft: HypothesisFilterExpr;
    // 속성 패싯 선택(2단계 드릴다운). 값 배열(null=미분류). 임시라 저장 안 함. 필터 지우기/불러오기 시 리셋.
    facetSelected: Record<PointAttr, (string | null)[]>;
    setSelectedHypothesis: (id: string | null) => void;
    // 가설 필터 편집 — 어느 surface든 같은 액션. 기본 OR: addFilterLeaf 는 항상 새 OR 그룹(중복 허용, 제거는 칩 ×). AND=드래그로 합침.
    addFilterLeaf: (hypothesisId: string) => void;
    moveLeafToGroup: (fromGroupIndex: number, hypothesisId: string, target: number | "new") => void; // 드래그: 그룹으로=AND / "new"=OR 분리
    removeFilterLeaf: (groupIndex: number, hypothesisId: string) => void;
    toggleFilterNegate: (groupIndex: number, hypothesisId: string) => void;
    removeFilterGroup: (groupIndex: number) => void;
    clearFilter: () => void;
    setFilterExpr: (expr: HypothesisFilterExpr) => void; // 저장 필터 불러오기
    toggleFacet: (attr: PointAttr, value: string | null) => void;
}

// 필터 그룹 깊은 복사(불변 편집용).
const cloneGroups = (expr: HypothesisFilterExpr) => expr.groups.map((g) => g.map((l) => ({ ...l })));
const EMPTY_FACETS = (): Record<PointAttr, (string | null)[]> => ({ outcome: [], type: [] });

export const createHypothesisSlice: StateCreator<WorkbenchState, [], [], HypothesisSlice> = (set) => ({
    selectedHypothesisId: null,
    filterDraft: { groups: [] },
    facetSelected: EMPTY_FACETS(),

    setSelectedHypothesis: (id) => set(() => ({ selectedHypothesisId: id })),

    // 기본 OR: 없으면 새 OR 그룹, 이미 있으면 그 자리에서 순환(포함→제외→삭제, 우클릭 반복). AND 는 드래그로.
    addFilterLeaf: (hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            groups.push([{ hypothesisId, negated: false }]); // 항상 새 OR 그룹으로 추가(중복 허용). 제거는 칩 × 로.
            return { filterDraft: { groups } };
        }),
    // 드래그 이동 — 다른 그룹으로=AND 합침 / "new"=새 OR 그룹으로 분리. 빈 그룹은 정리, 대상 그룹에 이미 있으면 중복 안 만듦.
    moveLeafToGroup: (fromGroupIndex, hypothesisId, target) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            const from = groups[fromGroupIndex];
            const li = from?.findIndex((l) => l.hypothesisId === hypothesisId) ?? -1;
            if (!from || li < 0) return {};
            if (target !== "new" && target === fromGroupIndex) return {}; // 자기 그룹 = no-op
            const [leaf] = from.splice(li, 1);
            if (target === "new") {
                groups.push([leaf]);
            } else {
                const to = groups[target];
                if (!to) {
                    from.splice(li, 0, leaf); // 대상 없음 → 되돌림
                    return {};
                }
                if (!to.some((l) => l.hypothesisId === leaf.hypothesisId)) to.push(leaf);
            }
            for (let i = groups.length - 1; i >= 0; i--) if (groups[i].length === 0) groups.splice(i, 1);
            return { filterDraft: { groups } };
        }),
    removeFilterLeaf: (groupIndex, hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            if (!groups[groupIndex]) return {};
            groups[groupIndex] = groups[groupIndex].filter((l) => l.hypothesisId !== hypothesisId);
            if (groups[groupIndex].length === 0) groups.splice(groupIndex, 1);
            return { filterDraft: { groups } };
        }),
    toggleFilterNegate: (groupIndex, hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            const leaf = groups[groupIndex]?.find((l) => l.hypothesisId === hypothesisId);
            if (!leaf) return {};
            leaf.negated = !leaf.negated;
            return { filterDraft: { groups } };
        }),
    removeFilterGroup: (groupIndex) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            groups.splice(groupIndex, 1);
            return { filterDraft: { groups } };
        }),
    clearFilter: () => set(() => ({ filterDraft: { groups: [] }, facetSelected: EMPTY_FACETS() })),
    setFilterExpr: (expr) => set(() => ({ filterDraft: { groups: expr.groups.map((g) => g.map((l) => ({ ...l }))) }, facetSelected: EMPTY_FACETS() })),
    toggleFacet: (attr, value) =>
        set((s) => {
            const cur = s.facetSelected[attr];
            const next = cur.some((v) => v === value) ? cur.filter((v) => v !== value) : [...cur, value];
            return { facetSelected: { ...s.facetSelected, [attr]: next } };
        }),
});
