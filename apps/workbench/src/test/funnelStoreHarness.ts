// 깔때기·저장 집합 슬라이스 테스트 공용 하네스.
//
// 슬라이스는 **모듈 로드 시점**에 localStorage 를 읽어 초기 상태를 만들므로, 테스트마다
// ① 스토리지 스텁을 먼저 깔고 ② 모듈을 새로 불러온다(vi.resetModules + 동적 import).
// 스토어 통째 로드는 의도다 — putStages·loadSlots 등은 비공개 함수라, 계약은 액션 단위로만 잠근다.
import { vi } from "vitest";
import type { FilterPredicate } from "../panels/filter/stage.js";

export function stubStorage(seed: Record<string, unknown> = {}): Map<string, string> {
    const m = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
    vi.stubGlobal("localStorage", {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
    });
    return m;
}

export async function loadStore(): Promise<typeof import("../store/workbench.js")["useWorkbench"]> {
    return (await import("../store/workbench.js")).useWorkbench;
}

/** 비어 있지 않은 술어 한 벌 — 사전(그룹·축) 없이도 활성 판정이 서는 date 를 쓴다. */
export const datePred: FilterPredicate = { kind: "date", ranges: [{ from: "2026-01-01", to: "2026-01-31" }] };
