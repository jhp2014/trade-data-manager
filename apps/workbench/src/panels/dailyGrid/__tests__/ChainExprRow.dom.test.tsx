// 사슬 필터 식 줄 — 생성소 줄과 같은 손짓: 연산자 클릭 = AND/OR, 연산자 우클릭 = 괄호, 칩 우클릭 = NOT·지우기,
// 괄호 우클릭 = 순번. 순번은 칩·괄호 뒤 꼬리표로 보인다.
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ChainExpr } from "@trade-data-manager/market/domain";
import { ChainExprRow } from "../ChainExprRow.js";

const expr = (over: Partial<ChainExpr> = {}): ChainExpr => ({
    id: "chain",
    of: [
        { kind: "check", id: "a", cond: { kind: "amount", minEok: 50 }, firstK: 1 },
        { kind: "check", id: "b", cond: { kind: "sessionHigh" } },
    ],
    ops: ["and"],
    groups: [],
    ...over,
});
const menuItem = (label: string): HTMLButtonElement =>
    [...document.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((b) => (b.textContent ?? "").trim() === label)!;

describe("ChainExprRow", () => {
    it("칩은 조건 글자 + 순번 꼬리표로 선다", () => {
        const { container } = render(<ChainExprRow expr={expr()} open={null} onPick={() => {}} onChange={() => {}} />);
        expect(container.textContent).toContain("봉 대금 ≥ 50억처음 1");
        expect(container.textContent).toContain("AND");
        expect(container.textContent).toContain("세션 고가 돌파");
    });

    it("연산자 클릭 → OR", () => {
        const onChange = vi.fn();
        const { container } = render(<ChainExprRow expr={expr()} open={null} onPick={() => {}} onChange={onChange} />);
        act(() => { fireEvent.click(container.querySelector("[data-op='0']")!); });
        act(() => { fireEvent.click(menuItem("OR")); });
        expect(onChange.mock.calls[0]![0].ops).toEqual(["or"]);
    });

    it("칩 우클릭 → NOT", () => {
        const onChange = vi.fn();
        const { container } = render(<ChainExprRow expr={expr()} open={null} onPick={() => {}} onChange={onChange} />);
        act(() => { fireEvent.contextMenu(container.querySelector("[data-chip='b']")!); });
        act(() => { fireEvent.click(menuItem("NOT")); });
        expect(onChange.mock.calls[0]![0].of[1]).toMatchObject({ id: "b", neg: true });
    });

    it("순번 괄호에 NOT 항 하나만 남게 되는 지우기는 막는다(회색)", () => {
        const e = expr({
            of: [
                { kind: "check", id: "a", cond: { kind: "amount", minEok: 50 }, neg: true },
                { kind: "check", id: "b", cond: { kind: "sessionHigh" } },
            ],
            groups: [{ from: 0, to: 1, neg: true, firstK: 1 }],
        });
        const { container } = render(<ChainExprRow expr={e} open={null} onPick={() => {}} onChange={() => {}} />);
        act(() => { fireEvent.contextMenu(container.querySelector("[data-chip='b']")!); });
        expect(menuItem("지우기").disabled).toBe(true);
    });

    it("연산자 우클릭 → 괄호 묶기, 괄호 우클릭 → 순번 처음", () => {
        const onChange = vi.fn();
        const { container, rerender } = render(<ChainExprRow expr={expr()} open={null} onPick={() => {}} onChange={onChange} />);
        act(() => { fireEvent.contextMenu(container.querySelector("[data-op='0']")!); });
        act(() => { fireEvent.click(menuItem("괄호 묶기")); });
        // 줄 전체 괄호는 수식어가 없으면 뜻이 없어 걷힌다 — 세 항으로 다시.
        const three = expr({
            of: [...expr().of, { kind: "check", id: "c", cond: { kind: "label", label: "high" } }],
            ops: ["and", "and"],
            groups: [{ from: 0, to: 1 }],
        });
        rerender(<ChainExprRow expr={three} open={null} onPick={() => {}} onChange={onChange} />);
        const paren = [...container.querySelectorAll("span")].find((s) => s.textContent === "(")!;
        act(() => { fireEvent.contextMenu(paren); });
        const first = [...document.querySelectorAll("button")].find((b) => b.textContent === "처음")!;
        act(() => { fireEvent.click(first); });
        const last = onChange.mock.calls.at(-1)![0] as ChainExpr;
        expect(last.groups).toEqual([{ from: 0, to: 1, firstK: 1 }]);
    });
});
