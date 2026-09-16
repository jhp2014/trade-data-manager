import { beforeEach, describe, expect, it } from "vitest";
import { useWorkbench } from "../workbench.js";

// 테마 행 ↔ 조건판 영속 바인딩 — 1:1 불변식·재사용 가드·고아 무해.
beforeEach(() => {
    useWorkbench.setState({ themeBindings: {} });
});

describe("themeBindingSlice", () => {
    it("bind — 1:1 강제: 같은 판을 가리키던 다른 행의 바인딩을 걷어낸다", () => {
        const st = useWorkbench.getState();
        st.bindTheme("row-a", "theme-rank-1");
        useWorkbench.getState().bindTheme("row-b", "theme-rank-1");
        expect(useWorkbench.getState().themeBindings).toEqual({ "row-b": "theme-rank-1" });
    });

    it("bind — 같은 행을 다른 판으로 옮기면 옛 항목이 대체된다(행당 하나)", () => {
        useWorkbench.getState().bindTheme("row-a", "theme-rank-1");
        useWorkbench.getState().bindTheme("row-a", "theme-rank-2");
        expect(useWorkbench.getState().themeBindings).toEqual({ "row-a": "theme-rank-2" });
    });

    it("unbind — 없는 행은 no-op(참조 유지)", () => {
        useWorkbench.getState().bindTheme("row-a", "theme-rank-1");
        const before = useWorkbench.getState().themeBindings;
        useWorkbench.getState().unbindTheme("row-x");
        expect(useWorkbench.getState().themeBindings).toBe(before);
        useWorkbench.getState().unbindTheme("row-a");
        expect(useWorkbench.getState().themeBindings).toEqual({});
    });

    it("clearBindingsToPanel — 슬롯 번호 재사용 가드: 그 판을 가리키던 항목 전부 소거", () => {
        useWorkbench.getState().bindTheme("row-a", "theme-rank-2");
        useWorkbench.getState().bindTheme("row-b", "theme-rank-3");
        useWorkbench.getState().clearBindingsToPanel("theme-rank-2");
        expect(useWorkbench.getState().themeBindings).toEqual({ "row-b": "theme-rank-3" });
    });
});
