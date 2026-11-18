import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useNavTarget, useRowNav, walk, type NavTarget } from "./rowNav.js";

const target = (): NavTarget & { step: ReturnType<typeof vi.fn>; stepGroup: ReturnType<typeof vi.fn> } => ({ step: vi.fn(), stepGroup: vi.fn() });

beforeEach(() => useRowNav.setState({ attached: null }));
afterEach(cleanup);

describe("rowNav", () => {
    it("부착된 판의 대상만 걷는다 — 부착이 없거나 등록이 없으면 조용히 쉰다", () => {
        const a = target();
        renderHook(() => useNavTarget("board-1", a));
        walk("step", 1);
        expect(a.step).not.toHaveBeenCalled();
        useRowNav.getState().attach("board-1");
        walk("step", 1);
        walk("stepGroup", -1);
        expect(a.step).toHaveBeenCalledWith(1);
        expect(a.stepGroup).toHaveBeenCalledWith(-1);
        useRowNav.getState().attach("board-2"); // 등록 없는 판
        walk("step", 1);
        expect(a.step).toHaveBeenCalledTimes(1);
    });

    it("대상이 바뀌면 새 대상으로, null 이면 등록을 걷는다", () => {
        const a = target();
        const b = target();
        const { rerender } = renderHook(({ t }) => useNavTarget("board-1", t), { initialProps: { t: a as NavTarget | null } });
        useRowNav.getState().attach("board-1");
        rerender({ t: b });
        walk("step", 1);
        expect(b.step).toHaveBeenCalledTimes(1);
        expect(a.step).not.toHaveBeenCalled();
        rerender({ t: null });
        walk("step", 1);
        expect(b.step).toHaveBeenCalledTimes(1);
    });

    it("같은 판의 옛 등록이 늦게 걷혀도 새 등록을 지우지 않는다", () => {
        const a = target();
        const b = target();
        const first = renderHook(() => useNavTarget("board-1", a));
        renderHook(() => useNavTarget("board-1", b));
        first.unmount();
        useRowNav.getState().attach("board-1");
        walk("step", 1);
        expect(b.step).toHaveBeenCalledTimes(1);
    });

    it("detach·prune — 그 판이 부착돼 있을 때만, 대장에 없는 판만 뗀다", () => {
        useRowNav.getState().attach("board-1");
        useRowNav.getState().detach("board-2");
        expect(useRowNav.getState().attached).toBe("board-1");
        useRowNav.getState().prune(["board-1", "chart-1"]);
        expect(useRowNav.getState().attached).toBe("board-1");
        useRowNav.getState().prune(["chart-1"]);
        expect(useRowNav.getState().attached).toBeNull();
        useRowNav.getState().attach("board-1");
        useRowNav.getState().detach("board-1");
        expect(useRowNav.getState().attached).toBeNull();
    });
});
