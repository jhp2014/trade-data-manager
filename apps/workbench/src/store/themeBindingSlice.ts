// 테마 조건 행 ↔ 조건판 인스턴스의 **영속 바인딩**(pull 연동, 2026-09-17 재편 — 옛 세션 연동
// 포인터(themeLink THEME_LINK_SCOPE)의 후임). 결정권은 집합 편성 보드에 있고, 여기는 저장물과
// 1:1 불변식만 진다.
//
// · 저장물 = 행 id → 판 id 맵. **술어 payload 밖**이다 — SavedSet 은 조건 사본으로 자립한다는
//   원칙(집합을 다른 데서 열면 남의 패널 배선까지 따라가면 안 된다).
// · 고아는 지우지 않고 **읽기 시점에 해석**한다 — 행이 없거나(집합 적용으로 통째 교체) 판 슬롯이
//   없으면 그냥 미연동이다(decisions: "고아 = 미연동으로 정직하게").
// · 1:1 — 한 판은 한 행만 비춘다. bind 가 같은 판을 가리키던 기존 항목을 걷어낸다.
// · ⚠ 슬롯 번호는 재사용된다(panelSlots.nextFreeSlot) — 행 id 는 재사용되지 않으므로, 죽은 슬롯의
//   옛 바인딩이 **새로 세운 같은 번호 판**에 조용히 붙을 수 있다. 그래서 "새 조건판을 세우는 손"
//   (보드의 새 조건판·판 복제가 아니라 바인딩 생성 지점)이 clearBindingsToPanel 로 그 판 id 의
//   기존 항목을 끊는 게 불변식이다.
import type { StateCreator } from "zustand";
import { persistedField } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export interface ThemeBindingSlice {
    /** 행 id → 조건판 panelId. 고아 포함 가능(읽기 시점 해석). */
    themeBindings: Record<string, string>;
    /** 연동 — 1:1 강제: 같은 판을 가리키던 기존 행의 바인딩은 걷어낸다. */
    bindTheme: (stageId: string, panelId: string) => void;
    unbindTheme: (stageId: string) => void;
    /** 판 id 재사용 가드 — 새 판을 그 id 로 세우기 직전에 부른다(위 머리 주석 ⚠). */
    clearBindingsToPanel: (panelId: string) => void;
}

const FIELD = persistedField<Record<string, string>>(
    "wb.themeRankBindings.v1",
    (o) => {
        if (!o || typeof o !== "object") return null;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
        return out;
    },
    {},
);

export const createThemeBindingSlice: StateCreator<WorkbenchState, [], [], ThemeBindingSlice> = (set) => ({
    themeBindings: FIELD.load(),
    bindTheme: (stageId, panelId) =>
        set((s) => {
            const next: Record<string, string> = {};
            for (const [k, v] of Object.entries(s.themeBindings)) if (v !== panelId && k !== stageId) next[k] = v;
            next[stageId] = panelId;
            return { themeBindings: FIELD.save(next) };
        }),
    unbindTheme: (stageId) =>
        set((s) => {
            if (!(stageId in s.themeBindings)) return {};
            const next = { ...s.themeBindings };
            delete next[stageId];
            return { themeBindings: FIELD.save(next) };
        }),
    clearBindingsToPanel: (panelId) =>
        set((s) => {
            const entries = Object.entries(s.themeBindings).filter(([, v]) => v !== panelId);
            if (entries.length === Object.keys(s.themeBindings).length) return {};
            return { themeBindings: FIELD.save(Object.fromEntries(entries)) };
        }),
});
