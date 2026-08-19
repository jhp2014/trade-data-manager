// 달 고르기 — 손짓 셋과 "절대 비지 않는다"는 불변.
//
// 왜 이걸 잠그나: 달은 **시선이라 저장도 안 되는** 상태다. 그래서 잘못 굴러도 데이터가 아니라 화면만
// 조용히 이상해진다(빈 목록·엉뚱한 범위). 결과 목록과 집합 사이드바가 이 한 벌을 공유하므로, 여기가
// 틀리면 두 화면이 같은 방식으로 틀린다.
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMonthPick } from "../monthPick.js";

/** 최근 먼저 — monthBuckets 가 주는 순서 그대로. */
const MONTHS = ["2026-08", "2026-07", "2026-06", "2026-05"];

const click = (
    r: { result: { current: ReturnType<typeof useMonthPick> } },
    ym: string,
    mods: { ctrl?: boolean; shift?: boolean } = {},
): void => {
    act(() => { r.result.current.click(ym, { ctrl: mods.ctrl ?? false, shift: mods.shift ?? false }); });
};

describe("useMonthPick — 달은 시선이다", () => {
    it("아무것도 안 눌렀으면 가장 최근 달 하나 — 빈 화면으로 시작하지 않는다", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        expect([...r.result.current.picked]).toEqual(["2026-08"]);
        expect(r.result.current.multi).toBe(false);
    });

    it("맨 클릭은 갈아타기 — 여럿 고른 뒤에도 하나로 돌아온다", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        click(r, "2026-07", { ctrl: true });
        expect(r.result.current.picked.size).toBe(2);
        click(r, "2026-06");
        expect([...r.result.current.picked]).toEqual(["2026-06"]);
    });

    it("Ctrl+클릭은 더하기·빼기", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        click(r, "2026-07", { ctrl: true });
        expect([...r.result.current.picked].sort()).toEqual(["2026-07", "2026-08"]);
        click(r, "2026-08", { ctrl: true });
        expect([...r.result.current.picked]).toEqual(["2026-07"]);
    });

    it("마지막 하나는 Ctrl 로도 안 빠진다 — 빈 집합은 '아무 달도 안 봄'이라 화면이 사라진다", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        click(r, "2026-08", { ctrl: true });
        expect([...r.result.current.picked]).toEqual(["2026-08"]);
    });

    it("Shift+클릭은 기준부터 범위 — 기준은 Shift 없이 마지막으로 누른 달", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        click(r, "2026-08");
        click(r, "2026-06", { shift: true });
        expect([...r.result.current.picked].sort()).toEqual(["2026-06", "2026-07", "2026-08"]);
        expect(r.result.current.multi).toBe(true);
    });

    it("범위는 거꾸로 눌러도 같다 — 목록이 최근 먼저라 방향이 헷갈리는 자리다", () => {
        const r = renderHook(() => useMonthPick(MONTHS));
        click(r, "2026-05");
        click(r, "2026-07", { shift: true });
        expect([...r.result.current.picked].sort()).toEqual(["2026-05", "2026-06", "2026-07"]);
    });

    it("조건이 바뀌어 사라진 달은 버린다 — 남은 게 없으면 가장 최근 달로(빈 목록 금지)", () => {
        const r = renderHook(({ ms }) => useMonthPick(ms), { initialProps: { ms: MONTHS } });
        click(r, "2026-05");
        r.rerender({ ms: ["2026-08", "2026-07"] });
        expect([...r.result.current.picked]).toEqual(["2026-08"]);
    });

    it("살아남은 달은 지킨다 — 필터를 조금 고쳤다고 보던 자리를 잃지 않는다", () => {
        const r = renderHook(({ ms }) => useMonthPick(ms), { initialProps: { ms: MONTHS } });
        click(r, "2026-07");
        click(r, "2026-06", { ctrl: true });
        r.rerender({ ms: ["2026-07", "2026-05"] });
        expect([...r.result.current.picked]).toEqual(["2026-07"]);
    });
});
