import { beforeEach, describe, expect, it } from "vitest";
import { MAX_TOKENS, useTokenHistory } from "./tokenHistory.js";

const h = () => useTokenHistory.getState();
const list = () => h().entries.map((e) => e.token);

beforeEach(() => {
    localStorage.clear();
    useTokenHistory.setState({ entries: [] });
});

describe("토큰 기록 store", () => {
    it("여럿을 한꺼번에 — 글 속 순서대로 위에서부터, 다음 붙여넣기는 그 위에", () => {
        h().push(["A@1", "B@2"]);
        h().push(["C@3"]);
        expect(list()).toEqual(["C@3", "A@1", "B@2"]);
    });
    it("같은 글자는 한 줄 — 다시 붙이면 맨 위로, 한 글 안의 중복도 한 줄", () => {
        h().push(["A@1", "B@2", "C@3"]);
        h().push(["B@2", "D@4", "B@2"]);
        expect(list()).toEqual(["B@2", "D@4", "A@1", "C@3"]);
    });
    it("최대 50줄 — 오래된 쪽부터 버린다", () => {
        h().push(Array.from({ length: MAX_TOKENS }, (_, i) => `T@${i}`));
        h().push(["new"]);
        expect(list()).toHaveLength(MAX_TOKENS);
        expect(list()[0]).toBe("new");
        expect(list()).not.toContain(`T@${MAX_TOKENS - 1}`);
    });
    it("지우기 · localStorage 에 남는다", () => {
        h().push(["A@1", "B@2"]);
        h().remove("A@1");
        expect(list()).toEqual(["B@2"]);
        expect(JSON.parse(localStorage.getItem("trade-lab.token-history")!).state.entries.map((e: { token: string }) => e.token)).toEqual(["B@2"]);
    });
    it("전체 지우기", () => {
        h().push(["A@1", "B@2"]);
        h().clear();
        expect(list()).toEqual([]);
    });
});
