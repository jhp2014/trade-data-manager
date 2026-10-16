// 화면 번호 단축키 — 번호를 짝지은 화면만 Ctrl+번호로 레지스트리에 오르고, 짝이 바뀌면 따라 바뀐다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { DockviewApi } from "dockview-react";
import { useScreens } from "../store/screens.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { resolveCommand } from "../keymap/registry.js";
import { useScreenCommands } from "./useScreenCommands.js";

const snap = { layout: {} as never, panels: {} };

beforeEach(() => {
    localStorage.clear();
    useScreens.setState(useScreens.getInitialState(), true);
    useKeymapDynamic.setState({ commands: {} });
});
afterEach(cleanup);

describe("useScreenCommands", () => {
    it("짝지은 번호만 오르고(이름이 도움말 제목), 짝을 떼면 내려간다", () => {
        const id = useScreens.getState().add("매매", snap);
        useScreens.getState().add("번호 없음", snap);
        act(() => useScreens.getState().setKey(id, "2"));
        const { unmount } = renderHook(() => useScreenCommands({} as DockviewApi));
        expect(resolveCommand("ctrl+2")?.title).toBe("화면 — 매매");
        expect(resolveCommand("ctrl+1")).toBeUndefined();
        act(() => useScreens.getState().setKey(id, null));
        expect(resolveCommand("ctrl+2")).toBeUndefined();
        unmount();
        expect(Object.keys(useKeymapDynamic.getState().commands)).toEqual([]);
    });

    it("dockview 가 아직 없으면 아무것도 올리지 않는다", () => {
        const id = useScreens.getState().add("매매", snap);
        useScreens.getState().setKey(id, "1");
        renderHook(() => useScreenCommands(null));
        expect(resolveCommand("ctrl+1")).toBeUndefined();
    });
});
