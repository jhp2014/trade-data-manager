import { create } from "zustand";
import type { DockviewApi } from "dockview-react";
import { PANEL_CATALOG } from "../shell/panelCatalog.js";

// 창 배치(dockview) 상태 버스 — onReady 의 DockviewApi 를 커맨드/작업표시줄이 닿을 수 있게 보관하고,
// 레이아웃 프리셋(저장 배치)을 관리한다. UI 오버레이(ui 스토어)와 성격이 달라 전용 스토어로 둔다.
export const PRESET_COUNT = 5;
const PRESETS_KEY = "wb.layoutPresets";
const RINGS_KEY = "wb.tabRings";

// api.toJSON() 직렬화 형태. 버전에 안 묶이게 ReturnType 로 파생.
type LayoutJSON = ReturnType<DockviewApi["toJSON"]>;
type PresetSlots = (LayoutJSON | null)[]; // index 0 = 화면 1
type RingSlots = string[][]; // index 0 = 화면 1. 화면별 Tab 순환 링(순서=순환 순서, 패널 id).

// 렌더 가능한 패널 컴포넌트 집합 — 카탈로그가 곧 등록 패널의 단일 출처(WorkbenchShell components 와 1:1).
// 프리셋 JSON 에 이 집합 밖 컴포넌트(삭제된 패널)가 하나라도 있으면 dockview fromJSON 이 통째로 실패한다.
const VALID_COMPONENTS = new Set(PANEL_CATALOG.map((e) => e.component));

// 레이아웃 JSON 에서 등록 안 된 컴포넌트의 패널을 제거한다(패널 삭제 시 옛 프리셋이 안 깨지게).
// panels 맵과 grid 트리·플로팅/팝아웃 그룹을 함께 정리해야 fromJSON 정합이 유지된다(한쪽만 지우면 dangling).
// 빈 그룹/브랜치는 접고, 폐기된 그룹을 가리키는 activeGroup 은 해제. 제거 0건이면 원본을 그대로 반환.
export function sanitizeLayout(json: LayoutJSON): { json: LayoutJSON; removed: string[] } {
    const j = structuredClone(json) as Record<string, any>;
    const panels: Record<string, any> = j?.panels ?? {};
    const removed: string[] = [];
    for (const [id, st] of Object.entries(panels)) {
        const comp = st?.contentComponent;
        if (typeof comp !== "string" || !VALID_COMPONENTS.has(comp)) {
            removed.push(id);
            delete panels[id];
        }
    }
    if (removed.length === 0) return { json, removed };

    const gone = new Set(removed);
    const droppedGroups = new Set<string>();
    // 그룹 데이터(views/activeView/id)에서 제거된 패널을 걸러낸다. 빈 그룹이면 false(폐기 신호) + id 기록.
    const keepGroup = (data: any): boolean => {
        if (!data || !Array.isArray(data.views)) return true;
        data.views = data.views.filter((v: string) => !gone.has(v));
        if (data.activeView && gone.has(data.activeView)) data.activeView = data.views[0];
        if (data.views.length === 0) {
            if (typeof data.id === "string") droppedGroups.add(data.id);
            return false;
        }
        return true;
    };
    const pruneNode = (node: any): any | null => {
        if (!node) return null;
        if (node.type === "leaf") return keepGroup(node.data) ? node : null;
        if (node.type === "branch" && Array.isArray(node.data)) {
            node.data = node.data.map(pruneNode).filter((x: any) => x != null);
            return node.data.length > 0 ? node : null;
        }
        return node;
    };
    if (j.grid?.root) j.grid.root = pruneNode(j.grid.root) ?? { type: "branch", data: [], size: j.grid.root.size };
    const pruneGroupList = (list: any): any => (Array.isArray(list) ? list.filter((g: any) => keepGroup(g?.data)) : list);
    j.floatingGroups = pruneGroupList(j.floatingGroups);
    j.popoutGroups = pruneGroupList(j.popoutGroups);
    if (typeof j.activeGroup === "string" && droppedGroups.has(j.activeGroup)) delete j.activeGroup;

    return { json: j as LayoutJSON, removed };
}

function loadPresets(): PresetSlots {
    const out: PresetSlots = Array<LayoutJSON | null>(PRESET_COUNT).fill(null);
    try {
        const raw = localStorage.getItem(PRESETS_KEY);
        if (raw) {
            const arr: unknown = JSON.parse(raw);
            if (Array.isArray(arr)) for (let i = 0; i < PRESET_COUNT; i++) if (arr[i]) out[i] = arr[i] as LayoutJSON;
        }
    } catch {
        /* localStorage 없음/파싱 실패 → 빈 프리셋 */
    }
    // 삭제된 패널(옛 가설 등)이 박힌 프리셋 자가치유 — 로드 시 걸러내고, 바뀐 게 있으면 storage 에 되쓴다.
    let changed = false;
    for (let i = 0; i < PRESET_COUNT; i++) {
        if (!out[i]) continue;
        const { json, removed } = sanitizeLayout(out[i]!);
        if (removed.length > 0) {
            out[i] = json;
            changed = true;
        }
    }
    if (changed) {
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(out));
        } catch {
            /* 영속 실패 무시 */
        }
    }
    return out;
}

function loadRings(): RingSlots {
    const out: RingSlots = Array.from({ length: PRESET_COUNT }, () => [] as string[]);
    try {
        const raw = localStorage.getItem(RINGS_KEY);
        if (raw) {
            const arr: unknown = JSON.parse(raw);
            if (Array.isArray(arr))
                for (let i = 0; i < PRESET_COUNT; i++) {
                    const r = arr[i];
                    if (Array.isArray(r)) out[i] = r.filter((x): x is string => typeof x === "string");
                }
        }
    } catch {
        /* 파싱 실패 → 빈 링 */
    }
    return out;
}

// 프리셋 JSON 에 실제 들어있는 패널 id 목록. 링 편집 UI·저장 시 프루닝 공용.
function panelIdsInPreset(p: LayoutJSON | null): string[] {
    const panels = (p as { panels?: Record<string, unknown> } | null)?.panels;
    return panels ? Object.keys(panels) : [];
}

interface DockState {
    api: DockviewApi | null;
    presets: PresetSlots;
    rings: RingSlots;
    activePreset: number | null; // 1-based. null = 프리셋 밖(기본 배치/수동 변경).
    ringSource: number | null; // 1-based. 마지막으로 불러온 화면 = Tab 링 출처. 수동 배치 변경엔 안 바뀜.
    openPanelIds: string[] | null; // 현재 열린 패널 id(작업표시줄 닫힌창 목록용). null = dock 미준비.
    setApi: (api: DockviewApi | null) => void;
    setOpenPanels: (ids: string[]) => void;
    savePreset: (n: number) => void; // 현재 배치를 슬롯 n(1-based)에 저장
    loadPreset: (n: number) => void; // 슬롯 n 배치로 전환(빈 슬롯이면 무시)
    clearPreset: (n: number) => void; // 슬롯 n 저장 배치 삭제(+링 비우기)
    cyclePreset: () => void; // 저장된 프리셋들을 순환
    setRing: (n: number, ids: string[]) => void; // 화면 n 의 Tab 순환 링 지정
}

function persistRings(rings: RingSlots): void {
    try {
        localStorage.setItem(RINGS_KEY, JSON.stringify(rings));
    } catch {
        /* 영속 실패 무시 */
    }
}

export const useDock = create<DockState>((set, get) => ({
    api: null,
    presets: loadPresets(),
    rings: loadRings(),
    activePreset: null,
    ringSource: null,
    openPanelIds: null,
    setApi: (api) => set({ api }),
    setOpenPanels: (ids) => set({ openPanelIds: ids }),
    savePreset: (n) => {
        const api = get().api;
        if (!api) return;
        const presets = get().presets.slice();
        const json = api.toJSON();
        presets[n - 1] = json;
        // 링에서 이 배치에 더는 없는 패널은 프루닝(스토리지 청결).
        const present = new Set(panelIdsInPreset(json));
        const rings = get().rings.slice();
        rings[n - 1] = (rings[n - 1] ?? []).filter((id) => present.has(id));
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
        } catch {
            /* 영속 실패 무시 */
        }
        persistRings(rings);
        set({ presets, rings, activePreset: n, ringSource: n });
    },
    loadPreset: (n) => {
        const api = get().api;
        const data = get().presets[n - 1];
        if (!api || !data) return;
        try {
            // 방어적 sanitize — 저장 이후 패널이 삭제됐어도 걸러내고 로드(등록 안 된 컴포넌트 = fromJSON 전체 실패).
            const { json } = sanitizeLayout(data);
            api.fromJSON(json);
            // fromJSON 후 열린 패널 재동기화(패널 이벤트 누락 대비). 링 출처도 이 화면으로 갱신.
            set({ activePreset: n, ringSource: n, openPanelIds: api.panels.map((p) => p.id) });
        } catch {
            /* 손상/비호환 레이아웃 → 무시(현 배치 유지) */
        }
    },
    clearPreset: (n) => {
        const presets = get().presets.slice();
        presets[n - 1] = null;
        const rings = get().rings.slice();
        rings[n - 1] = [];
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
        } catch {
            /* 영속 실패 무시 */
        }
        persistRings(rings);
        set((s) => ({
            presets,
            rings,
            activePreset: s.activePreset === n ? null : s.activePreset,
            ringSource: s.ringSource === n ? null : s.ringSource,
        }));
    },
    cyclePreset: () => {
        const { presets, activePreset, loadPreset } = get();
        const saved = presets.flatMap((p, i) => (p ? [i + 1] : []));
        if (saved.length === 0) return;
        const cur = activePreset ? saved.indexOf(activePreset) : -1;
        loadPreset(saved[(cur + 1) % saved.length]);
    },
    setRing: (n, ids) => {
        const rings = get().rings.slice();
        rings[n - 1] = ids;
        persistRings(rings);
        set({ rings });
    },
}));

export { panelIdsInPreset };
