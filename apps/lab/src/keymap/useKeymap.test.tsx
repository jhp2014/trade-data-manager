// 디스패처 — 누르고 있기(repeat)는 허용한 커맨드만, 입력칸에선 수식키 없는 키가 쉰다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useKeymapDynamic } from "./dynamic.js";
import { useUi } from "../store/ui.js";
import { useKeymap } from "./useKeymap.js";

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
    act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })));

let ran: string[] = [];
beforeEach(() => {
    ran = [];
    useKeymapDynamic.setState({ commands: {} });
    const { register } = useKeymapDynamic.getState();
    register({ id: "t.step", title: "걷기", category: "t", keys: "d", repeat: true, run: () => ran.push("d") });
    register({ id: "t.zoom", title: "줌", category: "t", keys: "f", run: () => ran.push("f") });
    register({ id: "t.help", title: "도움말", category: "t", keys: "ctrl+k", inDialog: true, run: () => ran.push("ctrl+k") });
    useUi.setState(useUi.getInitialState(), true);
});
afterEach(cleanup);

describe("useKeymap", () => {
    it("누르고 있기 — repeat 를 허용한 커맨드만 반복, 나머지는 첫 누름만", () => {
        renderHook(() => useKeymap());
        press("d");
        press("d", { repeat: true });
        press("f");
        press("f", { repeat: true });
        press("f", { repeat: true });
        expect(ran).toEqual(["d", "d", "f"]);
    });

    it("설정 창이 열려 있으면 inDialog 커맨드만 — 나머지는 쉰다", () => {
        renderHook(() => useKeymap());
        act(() => useUi.getState().openSettings());
        press("d");
        press("f");
        press("k", { ctrlKey: true });
        expect(ran).toEqual(["ctrl+k"]);
        // 쉬는 키도 먹는다 — 창이 열린 동안 Ctrl+숫자 같은 등록 키가 브라우저(탭 전환)로 새지 않게
        const ev = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
        act(() => void window.dispatchEvent(ev));
        expect(ev.defaultPrevented).toBe(true);
    });

    it("입력칸에선 수식키 없는 키가 쉰다", () => {
        renderHook(() => useKeymap());
        const input = document.body.appendChild(document.createElement("input"));
        press("d", {}, input);
        expect(ran).toEqual([]);
        input.remove();
    });
});
