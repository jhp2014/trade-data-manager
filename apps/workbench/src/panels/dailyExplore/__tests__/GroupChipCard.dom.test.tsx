// 기본 차트 고스트 칩 — **통과한 그룹만 이름으로**(2026-09-27, 그룹 10개 상한과 함께). 모르는 그룹은
// 이름 대신 끝의 회색 표식("…" 계산 중 · "—N" 잘림/오류) — 안 보이면 "불통과"로 오독된다.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { GroupCol } from "../useConditionGroups.js";

let cols: GroupCol[] = [];
vi.mock("../useConditionGroups.js", () => ({ useConditionGroups: () => ({ groupCols: cols }) }));
const { GroupChipCard } = await import("../GroupChipCard.js");

const col = (setId: string, name: string, state: GroupCol["state"]): GroupCol => ({ setId, name, num: "①", color: "#000", state });
const ready = (...keys: string[]): GroupCol["state"] => ({ kind: "ready", member: new Set(keys) });
const chip = (): string | null => {
    const { container } = render(<GroupChipCard code="A" date="2026-09-16" time="09:30:00" active isPoint />);
    return container.firstElementChild === null ? null : container.textContent;
};

describe("GroupChipCard", () => {
    it("통과한 그룹만 이름이 선다", () => {
        cols = [col("x", "아침돌파", ready("A|570")), col("y", "눌림", ready("B|570"))];
        const t = chip();
        expect(t).toContain("아침돌파");
        expect(t).not.toContain("눌림");
    });

    it("전부 알고 통과 0이면 칩이 없다", () => {
        cols = [col("y", "눌림", ready("B|570"))];
        expect(chip()).toBeNull();
    });

    it("계산 중은 …, 모름은 —N — 통과가 없어도 칩이 선다(모름을 불통과로 숨기지 않는다)", () => {
        cols = [col("l", "대금", { kind: "loading" }), col("u1", "사슬", { kind: "unknown", why: "잘림" }), col("u2", "테마", { kind: "unknown", why: "오류" })];
        const t = chip();
        expect(t).toContain("…");
        expect(t).toContain("—2");
        expect(t).not.toContain("대금");
    });
});
