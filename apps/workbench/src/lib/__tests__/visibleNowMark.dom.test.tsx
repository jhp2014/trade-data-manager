// 라벨 단축키(e)의 자리·날짜 — 보이는 복기 차트의 시간선 표식(data-now-mark="종목|날짜")을 DOM 에서 찾는다.
// 잠그는 것: ① 그 종목의 **보이는** 표식만(숨은 차트 = 크기 0 은 건너뛴다) ② 날짜는 표식이 말한다(분봉 고정 차트)
//            ③ 없으면 null(호출자가 화면 가운데로 물러선다).
import { describe, it, expect, afterEach } from "vitest";
import { visibleNowMark } from "../chartHooks.js";
import { NOW_MARK_ATTR } from "../../store/groupAssign.js";

const mark = (id: string, rect: { left: number; top: number; width: number; height: number }): HTMLElement => {
    const el = document.createElement("div");
    el.setAttribute(NOW_MARK_ATTR, id);
    el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
    document.body.appendChild(el);
    return el;
};

afterEach(() => { document.body.innerHTML = ""; });

describe("visibleNowMark", () => {
    it("그 종목의 보이는 표식 아래 가운데 · 날짜는 표식의 날", () => {
        mark("005930|2026-09-24", { left: 100, top: 10, width: 18, height: 12 });
        mark("000100|2026-09-25", { left: 300, top: 10, width: 18, height: 12 });
        expect(visibleNowMark("000100")).toEqual({ date: "2026-09-25", at: { x: 309, y: 22 } });
    });

    it("크기 0(탭 뒤·숨은 차트)은 건너뛰고 보이는 쪽을 쓴다", () => {
        mark("000100|2026-09-24", { left: 0, top: 0, width: 0, height: 0 });
        mark("000100|2026-09-25", { left: 50, top: 5, width: 10, height: 10 });
        expect(visibleNowMark("000100")?.date).toBe("2026-09-25");
    });

    it("없으면 null", () => {
        mark("005930|2026-09-24", { left: 100, top: 10, width: 18, height: 12 });
        expect(visibleNowMark("000100")).toBeNull();
    });
});
