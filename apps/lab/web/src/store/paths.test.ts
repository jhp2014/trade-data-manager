import { beforeEach, describe, expect, it } from "vitest";
import { ACTIVE, resolvePathId, selectPanelPath, usePaths } from "./paths.js";

const st = () => usePaths.getState();

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
});

describe("경로 추가", () => {
    it("활성 경로의 상황을 복사하고, 새 경로가 활성이 된다", () => {
        st().write("B", { code: "009150", date: "2026-07-31" });
        const id = st().addPath();
        expect(id).toBe("C");
        expect(st().active).toBe("C");
        expect(st().paths.find((p) => p.id === "C")?.s).toMatchObject({ code: "009150", date: "2026-07-31" });
    });
    it("지운 이름의 빈자리를 먼저 쓰고, 색은 겹치지 않는다", () => {
        st().addPath(); // C
        st().removePath("B");
        expect(st().addPath()).toBe("B");
        const colors = st().paths.map((p) => p.color);
        expect(new Set(colors).size).toBe(colors.length);
    });
    it("복사본은 원본과 따로 바뀐다", () => {
        st().write("A", { code: "402340" });
        st().addPath(); // C ← A
        st().write("C", { code: "005930" });
        expect(st().paths.find((p) => p.id === "A")?.s.code).toBe("402340");
    });
});

describe("경로 삭제", () => {
    it("그 경로를 보던 패널은 활성으로 돌아가고, 다른 구독은 남는다", () => {
        st().bind("chart-1", "A");
        st().bind("chart-2", "B");
        st().removePath("B");
        expect(st().bindings).toEqual({ "chart-1": "A" });
    });
    it("활성 경로를 지우면 첫 경로가 활성이 된다", () => {
        st().setActive("B");
        st().removePath("B");
        expect(st().active).toBe("A");
    });
    it("마지막 경로는 지울 수 없다", () => {
        st().removePath("B");
        st().removePath("A");
        expect(st().paths.map((p) => p.id)).toEqual(["A"]);
    });
});

describe("쓰기", () => {
    it("쓴 경로만 바뀌고, 그 경로가 활성이 된다", () => {
        st().write("B", { time: "09:44" });
        expect(st().active).toBe("B");
        expect(st().paths.find((p) => p.id === "B")?.s.time).toBe("09:44");
        expect(st().paths.find((p) => p.id === "A")?.s.time).toBe("");
    });
    it("없는 경로에 쓰면 아무것도 안 바뀐다", () => {
        const before = st().paths;
        st().write("Z", { code: "402340" });
        expect(st().paths).toEqual(before);
        expect(st().active).toBe("A");
    });
});

describe("구독 해석", () => {
    it("활성 = 지금 활성 경로, 고정 = 그 경로, 지워진 경로 = 활성", () => {
        const s = { paths: st().paths, active: "B" };
        expect(resolvePathId(s, ACTIVE)).toBe("B");
        expect(resolvePathId(s, "A")).toBe("A");
        expect(resolvePathId(s, "Q")).toBe("B");
    });
    it("지금 없는 패널의 구독은 걷어 낸다", () => {
        st().bind("chart-1", "A");
        st().bind("chart-9", "B");
        st().pruneBindings(["chart-1"]);
        expect(st().bindings).toEqual({ "chart-1": "A" });
    });
});

describe("패널을 고르면 그 경로가 활성", () => {
    it("경로에 고정된 패널은 그 경로를 활성으로 — 이미 활성이어도 다시 고르면 돌아온다", () => {
        usePaths.getState().bind("chart-2", "B");
        selectPanelPath("chart-2");
        expect(st().active).toBe("B");
        st().setActive("A"); // 경로 줄에서 A 를 고른 뒤
        selectPanelPath("chart-2"); // 같은 패널을 다시 고르면
        expect(st().active).toBe("B");
    });
    it("활성을 따라가는 패널·지워진 경로를 보는 패널은 활성을 바꾸지 않는다", () => {
        st().setActive("B");
        selectPanelPath("hts-1"); // 구독 없음 = 활성 따라감
        expect(st().active).toBe("B");
        usePaths.getState().bind("chart-3", "Z");
        selectPanelPath("chart-3");
        expect(st().active).toBe("B");
    });
});

describe("저장본 이전", () => {
    it("v1 저장본의 테마는 버리고 나머지 상황·활성·구독은 살린다", async () => {
        const v1 = {
            paths: [
                { id: "A", color: "#2f6fde", s: { code: "402340", date: "2026-07-31", time: "10:00", theme: "로봇" } },
                { id: "C", color: "#1f9d6b", s: { code: "009150", date: "2026-07-30", time: "", theme: "" } },
            ],
            active: "C",
            bindings: { "chart-1": "A" },
        };
        localStorage.setItem("trade-lab.paths", JSON.stringify({ state: v1, version: 1 }));
        await usePaths.persist.rehydrate();
        expect(st().paths.map((p) => p.open)).toEqual([false, true]); // v3: 그전엔 활성만 펼쳐 보였다
        expect(st().paths.map((p) => p.s)).toEqual([
            { code: "402340", date: "2026-07-31", time: "10:00" },
            { code: "009150", date: "2026-07-30", time: "" },
        ]);
        expect(st().active).toBe("C");
        expect(st().bindings).toEqual({ "chart-1": "A" });
    });
    it("v2 저장본 — 활성만 펼친 채로 옮긴다", async () => {
        const v2 = {
            paths: [
                { id: "A", color: "#2f6fde", s: { code: "", date: "", time: "" } },
                { id: "B", color: "#e0592a", s: { code: "009150", date: "2026-07-30", time: "09:44" } },
            ],
            active: "B",
            bindings: {},
        };
        localStorage.setItem("trade-lab.paths", JSON.stringify({ state: v2, version: 2 }));
        await usePaths.persist.rehydrate();
        expect(st().paths).toEqual([{ ...v2.paths[0], open: false }, { ...v2.paths[1], open: true }]);
        expect(st().active).toBe("B");
    });

    it("v3 저장본은 그대로", async () => {
        const v3 = { paths: [{ id: "B", color: "#e0592a", s: { code: "009150", date: "2026-07-30", time: "09:44" }, open: false }], active: "B", bindings: {} };
        localStorage.setItem("trade-lab.paths", JSON.stringify({ state: v3, version: 3 }));
        await usePaths.persist.rehydrate();
        expect(st().paths).toEqual(v3.paths);
    });
});
