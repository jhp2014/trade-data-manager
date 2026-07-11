// 보드 배제 필터 슬라이스 — 이슈/복기 보드가 각자 인스턴스(상태 독립), 편집 로직은 makeFilterActions 1벌 공유.
// DNF(그룹별 dim/hide), 술어 = domain 레지스트리. 매 변경 localStorage 저장.
import type { StateCreator } from "zustand";
import { type BoardFilterExpr, type BoardFilterMode, type BoardFilterGroup, defaultParams } from "@trade-data-manager/market/domain";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

// 배제 필터 편집 액션 묶음 — 이슈/복기 보드가 각자 인스턴스(상태 독립), 로직은 makeFilterActions 로 1벌 공유.
export interface BoardFilterActions {
    addGroup: (kind: string) => void;
    addPredicate: (groupIndex: number, kind: string) => void;
    setPredicateKind: (groupIndex: number, predIndex: number, kind: string) => void;
    setPredicateParam: (groupIndex: number, predIndex: number, key: string, value: number) => void;
    removePredicate: (groupIndex: number, predIndex: number) => void;
    setGroupMode: (groupIndex: number, mode: BoardFilterMode) => void;
    removeGroup: (groupIndex: number) => void;
    clear: () => void;
}

export interface BoardFilterSlice {
    boardFilter: BoardFilterExpr; // 이슈정리 보드(EOD)
    replayFilter: BoardFilterExpr; // 복기 보드(시점 t 스냅샷)
    boardFilterActions: BoardFilterActions;
    replayFilterActions: BoardFilterActions;
}

// 배제 필터 — localStorage 영속(그래프위치 선례). 이슈/복기 각자 키·상태, 편집 로직은 팩토리 1벌.
const BOARD_FILTER_KEY = "wb.boardFilter";
const REPLAY_FILTER_KEY = "wb.replayFilter";
type FilterField = "boardFilter" | "replayFilter";
type SliceSet = (fn: (s: WorkbenchState) => Partial<WorkbenchState>) => void;

const loadFilter = (key: string): BoardFilterExpr =>
    loadJson(key, (o) => (o && typeof o === "object" && Array.isArray((o as BoardFilterExpr).groups) ? (o as BoardFilterExpr) : null)) ?? { groups: [] };

const cloneBoardGroups = (expr: BoardFilterExpr): BoardFilterGroup[] =>
    expr.groups.map((g) => ({ mode: g.mode, predicates: g.predicates.map((p) => ({ kind: p.kind, params: { ...p.params } })) }));

// 필터 편집 액션 묶음 생성 — field(어느 상태를 조작할지)·persistKey 만 다르고 로직은 동일. 노트 2권, 펜 1자루.
function makeFilterActions(set: SliceSet, field: FilterField, persistKey: string): BoardFilterActions {
    const update = (expr: BoardFilterExpr, fn: (groups: BoardFilterGroup[]) => void): Partial<WorkbenchState> => {
        const groups = cloneBoardGroups(expr);
        fn(groups);
        const next: BoardFilterExpr = { groups };
        saveJson(persistKey, next);
        return { [field]: next } as Partial<WorkbenchState>;
    };
    return {
        addGroup: (kind) => set((s) => update(s[field], (g) => g.push({ predicates: [{ kind, params: defaultParams(kind) }], mode: "dim" }))),
        addPredicate: (gi, kind) => set((s) => update(s[field], (g) => { g[gi]?.predicates.push({ kind, params: defaultParams(kind) }); })),
        setPredicateKind: (gi, pi, kind) => set((s) => update(s[field], (g) => { const p = g[gi]?.predicates[pi]; if (p) { p.kind = kind; p.params = defaultParams(kind); } })),
        setPredicateParam: (gi, pi, key, value) => set((s) => update(s[field], (g) => { const p = g[gi]?.predicates[pi]; if (p) p.params[key] = value; })),
        removePredicate: (gi, pi) => set((s) => update(s[field], (g) => { if (!g[gi]) return; g[gi].predicates.splice(pi, 1); if (g[gi].predicates.length === 0) g.splice(gi, 1); })),
        setGroupMode: (gi, mode) => set((s) => update(s[field], (g) => { if (g[gi]) g[gi].mode = mode; })),
        removeGroup: (gi) => set((s) => update(s[field], (g) => { g.splice(gi, 1); })),
        clear: () => set(() => { const next: BoardFilterExpr = { groups: [] }; saveJson(persistKey, next); return { [field]: next } as Partial<WorkbenchState>; }),
    };
}

export const createBoardFilterSlice: StateCreator<WorkbenchState, [], [], BoardFilterSlice> = (set) => ({
    boardFilter: loadFilter(BOARD_FILTER_KEY),
    replayFilter: loadFilter(REPLAY_FILTER_KEY),
    // 새 그룹=dim 기본, 술어 추가 시 domain 기본 파라미터. 매 변경 localStorage 저장.
    boardFilterActions: makeFilterActions(set, "boardFilter", BOARD_FILTER_KEY),
    replayFilterActions: makeFilterActions(set, "replayFilter", REPLAY_FILTER_KEY),
});
