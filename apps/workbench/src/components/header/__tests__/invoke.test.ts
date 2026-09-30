import { describe, expect, it, vi } from "vitest";
import { invokeControl, nextChoice } from "../invoke.js";
import type { ActionSpec, ChoiceSpec, PopoverSpec, ToggleSpec } from "../spec.js";

describe("invokeControl", () => {
    it("토글 — 뒤집고 '켬/끔' 한마디", () => {
        const set = vi.fn();
        const spec: ToggleSpec = { kind: "toggle", id: "t", name: "날짜 고정", on: false, set };
        expect(invokeControl(spec)).toEqual({ kind: "done", notice: "날짜 고정 켬" });
        expect(set).toHaveBeenCalledWith(true);
        expect(invokeControl({ ...spec, on: true })).toEqual({ kind: "done", notice: "날짜 고정 끔" });
    });

    it("순환 택1(≤3) — 다음 값으로 넘기고 '이름: 값'", () => {
        const set = vi.fn();
        const spec: ChoiceSpec = {
            kind: "choice", id: "c", name: "정렬", value: "stock", set,
            values: [{ v: "stock", label: "종목순" }, { v: "time", label: "시간순" }],
        };
        expect(invokeControl(spec)).toEqual({ kind: "done", notice: "정렬: 시간순" });
        expect(set).toHaveBeenCalledWith("time");
    });

    it("긴 택1(>3) — 순환하지 않고 판을 열라고 한다", () => {
        const set = vi.fn();
        const spec: ChoiceSpec = {
            kind: "choice", id: "c", name: "축", value: "a", set,
            values: ["a", "b", "c", "d"].map((v) => ({ v, label: v })),
        };
        expect(invokeControl(spec)).toEqual({ kind: "popover" });
        expect(set).not.toHaveBeenCalled();
    });

    it("액션 — run 이 돌려준 문구가 피드백, 없으면 이름", () => {
        const said: ActionSpec = { kind: "action", id: "a", name: "비우기", run: () => "3건 비움" };
        expect(invokeControl(said)).toEqual({ kind: "done", notice: "3건 비움" });
        const silent: ActionSpec = { kind: "action", id: "a", name: "비우기", run: () => {} };
        expect(invokeControl(silent)).toEqual({ kind: "done", notice: "비우기" });
    });

    it("판형·disabled·available:false — 각각 popover / none", () => {
        const pop: PopoverSpec = { kind: "popover", id: "p", name: "사슬", renderPopover: () => null };
        expect(invokeControl(pop)).toEqual({ kind: "popover" });
        expect(invokeControl({ ...pop, disabled: true })).toEqual({ kind: "none" });
        const run = vi.fn();
        expect(invokeControl({ kind: "action", id: "a", name: "x", run, disabled: true })).toEqual({ kind: "none" });
        expect(invokeControl({ kind: "action", id: "a", name: "x", run, available: false })).toEqual({ kind: "none" });
        expect(run).not.toHaveBeenCalled();
    });

    it("nextChoice — 지금 값이 목록에 없으면 첫 값부터", () => {
        const spec: ChoiceSpec = {
            kind: "choice", id: "c", name: "x", value: "ghost", set: () => {},
            values: [{ v: "a", label: "A" }, { v: "b", label: "B" }],
        };
        expect(nextChoice(spec).v).toBe("a");
    });
});
