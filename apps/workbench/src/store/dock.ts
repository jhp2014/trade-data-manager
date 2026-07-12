import { create } from "zustand";
import type { DockviewApi } from "dockview-react";

// 창 배치(dockview) 상태 버스 — onReady 의 DockviewApi 를 커맨드/작업표시줄이 닿을 수 있게 보관하고,
// 레이아웃 프리셋(저장 배치)을 관리한다. UI 오버레이(ui 스토어)와 성격이 달라 전용 스토어로 둔다.
export const PRESET_COUNT = 5;
const PRESETS_KEY = "wb.layoutPresets";

// api.toJSON() 직렬화 형태. 버전에 안 묶이게 ReturnType 로 파생.
type LayoutJSON = ReturnType<DockviewApi["toJSON"]>;
type PresetSlots = (LayoutJSON | null)[]; // index 0 = 화면 1

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
    return out;
}

interface DockState {
    api: DockviewApi | null;
    presets: PresetSlots;
    activePreset: number | null; // 1-based. null = 프리셋 밖(기본 배치/수동 변경).
    openPanelIds: string[] | null; // 현재 열린 패널 id(작업표시줄 닫힌창 목록용). null = dock 미준비.
    setApi: (api: DockviewApi | null) => void;
    setOpenPanels: (ids: string[]) => void;
    savePreset: (n: number) => void; // 현재 배치를 슬롯 n(1-based)에 저장
    loadPreset: (n: number) => void; // 슬롯 n 배치로 전환(빈 슬롯이면 무시)
    cyclePreset: () => void; // 저장된 프리셋들을 순환
}

export const useDock = create<DockState>((set, get) => ({
    api: null,
    presets: loadPresets(),
    activePreset: null,
    openPanelIds: null,
    setApi: (api) => set({ api }),
    setOpenPanels: (ids) => set({ openPanelIds: ids }),
    savePreset: (n) => {
        const api = get().api;
        if (!api) return;
        const presets = get().presets.slice();
        presets[n - 1] = api.toJSON();
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
        } catch {
            /* 영속 실패 무시 */
        }
        set({ presets, activePreset: n });
    },
    loadPreset: (n) => {
        const api = get().api;
        const data = get().presets[n - 1];
        if (!api || !data) return;
        try {
            api.fromJSON(data);
            // fromJSON 후 열린 패널 재동기화(패널 이벤트 누락 대비).
            set({ activePreset: n, openPanelIds: api.panels.map((p) => p.id) });
        } catch {
            /* 손상/비호환 레이아웃 → 무시(현 배치 유지) */
        }
    },
    cyclePreset: () => {
        const { presets, activePreset, loadPreset } = get();
        const saved = presets.flatMap((p, i) => (p ? [i + 1] : []));
        if (saved.length === 0) return;
        const cur = activePreset ? saved.indexOf(activePreset) : -1;
        loadPreset(saved[(cur + 1) % saved.length]);
    },
}));
