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
    register({ id: "t.screen", title: "화면", category: "t", keys: "ctrl+1", run: () => ran.push("ctrl+1") });
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
        // 수식키 붙은 쉬는 키는 먹는다 — 창이 열린 동안 Ctrl+숫자가 브라우저(탭 전환)로 새지 않게
        const mod = new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true, cancelable: true });
        act(() => void window.dispatchEvent(mod));
        expect(mod.defaultPrevented).toBe(true);
        // 수식키 없는 쉬는 키는 브라우저에 돌려준다 — Tab(토큰 기록)이 창 안의 포커스 이동을 막지 않게
        const plain = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
        act(() => void window.dispatchEvent(plain));
        expect(plain.defaultPrevented).toBe(false);
        expect(ran).toEqual(["ctrl+k"]);
    });

    it("입력칸에선 수식키 없는 키가 쉰다", () => {
        renderHook(() => useKeymap());
        const input = document.body.appendChild(document.createElement("input"));
        press("d", {}, input);
        expect(ran).toEqual([]);
        input.remove();
    });
});
