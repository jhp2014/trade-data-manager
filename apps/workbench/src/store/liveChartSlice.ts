// 실시간 차트 메모리 가격선(당일) — code 별 D/M 선 앵커. **영속 안 함**(zustand 인메모리 → 세션 종료/다음날 소멸).
// 큐레이션 DB(복기 차트)와 별개: 실시간 선은 저장 불필요("당일만 메모리"). [[two-plane-focus-data-routing]]
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export interface LiveLineAnchor {
    id: string;
    anchorDate: string; // YYYY-MM-DD
    anchorTime?: string; // HH:MM:SS (있으면 M 선, 없으면 D 선)
}

export interface LiveChartSlice {
    liveLines: Record<string, LiveLineAnchor[]>; // code → 메모리 선
    toggleLiveLine: (code: string, anchor: { anchorDate: string; anchorTime?: string }) => void;
    removeLiveLine: (code: string, id: string) => void;
}

export const createLiveChartSlice: StateCreator<WorkbenchState, [], [], LiveChartSlice> = (set) => ({
    liveLines: {},
    // 같은 앵커(anchorDate+anchorTime) 있으면 토글 삭제, 없으면 추가(새 id).
    toggleLiveLine: (code, anchor) =>
        set((s) => {
            const cur = s.liveLines[code] ?? [];
            const at = anchor.anchorTime;
            const existing = cur.find((l) => l.anchorDate === anchor.anchorDate && (l.anchorTime ?? undefined) === at);
            const next = existing
                ? cur.filter((l) => l !== existing)
                : [...cur, { id: crypto.randomUUID(), anchorDate: anchor.anchorDate, ...(at ? { anchorTime: at } : {}) }];
            return { liveLines: { ...s.liveLines, [code]: next } };
        }),
    removeLiveLine: (code, id) =>
        set((s) => ({ liveLines: { ...s.liveLines, [code]: (s.liveLines[code] ?? []).filter((l) => l.id !== id) } })),
});
