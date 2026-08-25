// 세션 수명 상태 — **영속과 갈리는 지점만** 본다. panelUi(localStorage)와 코드가 거의 같아서,
// 실수로 저 쪽을 복사해 오면(=load/save 를 붙이면) 조용히 수명이 바뀐다. 그걸 잡는 가드다.
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkbench } from "./workbench.js";
import { createSessionUiSlice } from "./sessionUiSlice.js";

/** 슬라이스 생성자를 직접 불러 초기 상태를 본다(= 다음 부팅). persist.dom.test 의 같은 헬퍼와 짝. */
const initialOf = <T,>(create: (set: never, get: never, store: never) => T): T =>
    create((() => undefined) as never, (() => ({})) as never, {} as never);

beforeEach(() => localStorage.clear());

describe("세션 상태는 localStorage 에 안 남는다", () => {
    it("초기값은 언제나 비어 있다 — 저장된 게 있었더라도(수명이 세션이다)", () => {
        localStorage.setItem("wb.sessionUi", JSON.stringify({ "norm.daily": { axes: { x: { k: 9, t: 9 } } } }));
        expect(initialOf(createSessionUiSlice).sessionUi).toEqual({});
    });

    it("setSessionUi 는 스코프별로 갈리고, localStorage 를 건드리지 않는다", () => {
        const before = localStorage.length;
        useWorkbench.getState().setSessionUi("norm.daily", "axes", { k: 2 });
        useWorkbench.getState().setSessionUi("norm.minute", "axes", { k: 3 });
        const bag = useWorkbench.getState().sessionUi;
        expect(bag["norm.daily"].axes).toEqual({ k: 2 });
        expect(bag["norm.minute"].axes).toEqual({ k: 3 });
        expect(localStorage.length).toBe(before);
    });
});
