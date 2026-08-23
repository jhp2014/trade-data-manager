// 저장 집합 슬라이스 — 집합 편성 패널이 게시한 **이름 붙인 산출물**의 목록(영속).
//
// 작업 깔때기(filterFunnelSlice — 조건 한 벌·시선·선택 포인터)와 일부러 갈라져 있다: 저쪽은 "지금 만지는
// 조건", 여기는 "이름을 붙여 게시한 저장물"이라 수명이 다르다(깔때기는 편집마다 변하고, 저장물은
// 저장·덮어쓰기에만 변한다). 접점은 putStages 하나 — 열기(openSet)도 "깔때기에 조건을 쓰는 손"이라
// 같은 규칙(영속·시선·포인터 정리)을 지난다.
import type { StateCreator } from "zustand";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";
import { parseStages, type FilterStage } from "../panels/filter/stage.js";
import { putStages, selectFilterStages } from "./filterFunnelSlice.js";
import { loadJson, saveJson } from "./persist.js";

const LEGACY_SETS_KEY = "wb.filterFunnelSets"; // 옛 "저장한 깔때기" — 저장 집합(부위=생존자)으로 읽어 들인다
// v2 로 키를 올린 이유(2026-08-23): 골격 은퇴로 skeleton-* 축·존재 리터럴이 사라졌다 — 옛 저장분의
// 그 leaf 들은 참조가 깨진 채 남으므로 통째로 리셋한다(사용자 확정: "어차피 나중에 다시 만들면 돼").
const SAVED_SETS_KEY = "wb.savedSets.v2";

/**
 * 저장 집합의 부위 — 조건 한 벌에서 **무엇을 꺼내 오나**. 생존자(전 단계 통과) 또는 특정 단계의 칸들.
 * 칸 부위의 stageId 가 (덮어쓰기로) 사라지면 그 집합은 깨진 참조가 된다 — 조용히 생존자로 넓히지 않는다.
 */
export type SavedSetPart =
    | { kind: "survivors" }
    | { kind: "cell"; stageId: string; cells: FunnelCell[] };

/**
 * 저장 집합 — **자립 저장물**(이름 + 조건 사본 + 부위). 집합끼리 아무것도 공유하지 않는다: 같은 깔때기에서
 * 두 집합을 뽑아도 조건이 각자에게 복사되고, 하나를 덮어써도 다른 하나는 절대 안 바뀐다(사용자 확정).
 * 정의 저장이라 라이브다 — 멤버는 읽는 순간 재계산되고, 죽은 참조(지워진 그룹·축)는 3치가 받아낸다.
 */
export interface SavedSet {
    id: string;
    name: string;
    stages: FilterStage[];
    part: SavedSetPart;
}

const CELLS: readonly FunnelCell[] = ["survive", "nearMiss", "upstreamPending", "fail", "pending"];
const parsePart = (o: unknown): SavedSetPart | null => {
    if (typeof o !== "object" || o === null) return null;
    const p = o as { kind?: unknown; stageId?: unknown; cells?: unknown };
    if (p.kind === "survivors") return { kind: "survivors" };
    if (p.kind === "cell" && typeof p.stageId === "string" && Array.isArray(p.cells)
        && p.cells.length > 0 && p.cells.every((c) => (CELLS as readonly unknown[]).includes(c))) {
        return { kind: "cell", stageId: p.stageId, cells: p.cells as FunnelCell[] };
    }
    return null;
};

/** 새 키를 먼저 읽고, 없으면 옛 "저장한 깔때기"를 부위=생존자로 이관한다(id 유지 — 옛 필터 바인딩이
 *  같은 id 의 saved 참조로 무손실 전환되는 근거). 옛 키는 안 지운다 — 새 키가 생기면 자연히 안 읽힌다. */
const loadSavedSets = (): SavedSet[] => {
    const parse = (arr: unknown[], withPart: boolean): SavedSet[] => {
        const out: SavedSet[] = [];
        for (const raw of arr) {
            const f = raw as { id?: unknown; name?: unknown; stages?: unknown; part?: unknown };
            if (typeof f?.id !== "string" || typeof f?.name !== "string") continue;
            const stages = parseStages(f.stages);
            if (!stages) continue;
            const part = withPart ? parsePart(f.part) : { kind: "survivors" as const };
            if (part) out.push({ id: f.id, name: f.name, stages, part });
        }
        return out;
    };
    const fresh = loadJson(SAVED_SETS_KEY, (o) => (Array.isArray(o) ? o : null));
    if (fresh) return parse(fresh, true);
    // v2 리셋 이전 키들(wb.savedSets·LEGACY)은 읽지 않는다 — 골격 leaf 가 되살아나는 뒷문이 된다.
    void LEGACY_SETS_KEY;
    return [];
};

export interface SavedSetsSlice {
    /** 저장 집합들(영속) — 집합 편성 패널이 만든 산출물. 집합 칩·연동 피커의 유일한 저장물 목록. */
    savedSets: SavedSet[];
    /**
     * 지금 조건으로 집합 저장 — 부위는 **저장하는 순간의 시선**에서 온다(칸을 짚었으면 그 칸, 아니면
     * 생존자). 같은 이름 = 같은 물건 — 엎어쓰기(id 유지 — 그 집합을 고정 구독 중인 바인딩이 따라온다).
     */
    saveSet: (name: string) => void;
    /** 열어 둔 집합에 지금 조건을 덮어쓴다 — **그 집합 하나만** 바뀐다(부위·이름 유지). */
    overwriteSet: (id: string) => void;
    /**
     * 집합을 깔때기로 연다 — 조건 **사본**이 작업 깔때기에 펼쳐진다. 이후 편집은 저장물을 안 흔들고,
     * 덮어쓰기를 눌러야 실제로 바뀐다(보드에서 만지는 동안 고정 구독 패널이 작업 중간 상태를 받지 않게).
     */
    openSet: (id: string) => void;
    /** 이름만 바꾼다(id·조건·부위 유지 — 바인딩이 id 로 따라오므로 이름은 표시물일 뿐). 빈 이름·다른 집합과 같은 이름은 무시. */
    renameSet: (id: string, name: string) => void;
    deleteSet: (id: string) => void;
    /** 마지막으로 연 집합 — 덮어쓰기 버튼의 대상. 그 집합이 지워지면 풀린다(세션 한정). */
    openedSetId: string | null;
}

export const createSavedSetsSlice: StateCreator<WorkbenchState, [], [], SavedSetsSlice> = (set) => ({
    savedSets: loadSavedSets(),
    openedSetId: null,

    // 같은 이름 = 같은 물건 — **엎어쓰기**(id 유지). 저장이 늘 새 항목이면 참조(패널 바인딩의 saved id)가
    // 옛 스냅샷에 묶여, "집합을 고쳐 저장했는데 바인딩은 옛것"이라는 조용한 갈림이 생긴다.
    saveSet: (name) => set((s) => {
        const n = name.trim();
        const stages = selectFilterStages(s);
        // 부위 = 저장하는 순간의 시선. 칸을 짚고 저장하면 "그 칸"이 이 집합의 정체가 된다.
        const part: SavedSetPart = s.funnelSelection
            ? { kind: "cell", stageId: s.funnelSelection.stageId, cells: [...s.funnelSelection.cells] }
            : { kind: "survivors" };
        const at = s.savedSets.findIndex((x) => x.name === n);
        const saved = at >= 0
            ? { ...s.savedSets[at]!, stages, part }
            // id 에 난수 꼬리 — 시각만으로는 같은 ms 의 연속 저장이 같은 id 가 된다(newStageId 와 같은 규칙).
            : { id: `fs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, stages, part };
        const next = at >= 0 ? s.savedSets.map((x, i) => (i === at ? saved : x)) : [...s.savedSets, saved];
        saveJson(SAVED_SETS_KEY, next);
        // 방금 저장한 집합이 곧 "열어 둔 집합" — 이어서 만지면 덮어쓰기가 그 집합을 가리킨다.
        return { savedSets: next, openedSetId: saved.id };
    }),
    overwriteSet: (id) => set((s) => {
        if (!s.savedSets.some((x) => x.id === id)) return {};
        // 조건만 바뀐다(부위·이름 유지). 같은 조건에서 나온 형제 집합이 있어도 **이 하나만** — 느리지만 암묵이 없다.
        const next = s.savedSets.map((x) => (x.id === id ? { ...x, stages: selectFilterStages(s) } : x));
        saveJson(SAVED_SETS_KEY, next);
        return { savedSets: next };
    }),
    openSet: (id) => set((s) => {
        const f = s.savedSets.find((x) => x.id === id);
        if (!f) return {};
        // 사본이 작업 깔때기로(배열 공유는 안전 — 편집 함수들이 늘 새 배열을 만든다). 시선은 푼다(다른 깔때기의 칸).
        return { ...putStages(s, f.stages), funnelSelection: null, openedSetId: id };
    }),
    renameSet: (id, name) => set((s) => {
        const n = name.trim();
        if (!n || s.savedSets.some((x) => x.id !== id && x.name === n) || !s.savedSets.some((x) => x.id === id)) return {};
        const next = s.savedSets.map((x) => (x.id === id ? { ...x, name: n } : x));
        saveJson(SAVED_SETS_KEY, next);
        return { savedSets: next };
    }),
    deleteSet: (id) => set((s) => {
        const next = s.savedSets.filter((x) => x.id !== id);
        saveJson(SAVED_SETS_KEY, next);
        const sel = s.selectedSetRef;
        return {
            savedSets: next,
            ...(s.openedSetId === id ? { openedSetId: null } : {}),
            // 선택 포인터도 그 집합이면 푼다(작업 깔때기 복귀) — 연동 패널 전부가 죽은 참조를 보게 두지 않는다.
            // 고정 바인딩은 일부러 안 푼다(깨진 참조 표시가 그쪽의 계약이다 — 패널마다 라벨과 전환 손잡이가 받는다).
            ...(sel?.kind === "saved" && sel.setId === id ? { selectedSetRef: null } : {}),
        };
    }),
});
