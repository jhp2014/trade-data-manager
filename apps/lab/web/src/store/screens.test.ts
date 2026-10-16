import { beforeEach, describe, expect, it } from "vitest";
import { keyOf, keyedScreens, useScreens } from "./screens.js";
import { defaultScreenName } from "../shell/screenActions.js";

const st = () => useScreens.getState();
const snap = { layout: {} as never, panels: {} };

beforeEach(() => {
    localStorage.clear();
    useScreens.setState({ screens: [], keys: {}, activeId: null });
});

describe("화면 번호", () => {
    it("번호 하나에 화면 하나 — 다른 화면에 주면 옮겨 간다", () => {
        const a = st().add("A", snap);
        const b = st().add("B", snap);
        st().setKey(a, "1");
        st().setKey(b, "1");
        expect(keyOf(st().keys, a)).toBeNull();
        expect(keyOf(st().keys, b)).toBe("1");
    });
    it("화면 하나에 번호 하나 — 새 번호를 주면 옛 번호는 떨어진다", () => {
        const a = st().add("A", snap);
        st().setKey(a, "1");
        st().setKey(a, "3");
        expect(st().keys).toEqual({ "3": a });
    });
    it("화면을 지우면 번호도 떨어지고, 활성이었으면 활성도 비운다", () => {
        const a = st().add("A", snap);
        st().setKey(a, "2");
        st().remove(a);
        expect(st().keys).toEqual({});
        expect(st().activeId).toBeNull();
    });
    it("개수 제한 없이 저장한다", () => {
        for (let i = 0; i < 12; i++) st().add(`S${i}`, snap);
        expect(st().screens).toHaveLength(12);
    });
});

describe("번호 붙은 화면", () => {
    it("번호 순 — 지워진 화면을 가리키는 번호는 빠진다", () => {
        const a = st().add("가", snap);
        const b = st().add("나", snap);
        st().setKey(b, "1");
        st().setKey(a, "4");
        expect(keyedScreens(st().screens, st().keys).map((x) => `${x.key}:${x.screen.name}`)).toEqual(["1:나", "4:가"]);
        expect(keyedScreens(st().screens.filter((s) => s.id !== a), st().keys).map((x) => x.key)).toEqual(["1"]);
    });
});

describe("새 화면 기본 이름", () => {
    it("쓰지 않은 가장 작은 번호 — 지운 자리를 다시 쓰고, 겹치지 않는다", () => {
        expect(defaultScreenName([])).toBe("화면 1");
        expect(defaultScreenName([{ name: "화면 2" }])).toBe("화면 1");
        expect(defaultScreenName([{ name: "화면 1" }, { name: "화면 2" }])).toBe("화면 3");
    });
});
