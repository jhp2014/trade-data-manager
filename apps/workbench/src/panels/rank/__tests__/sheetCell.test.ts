import { describe, it, expect } from "vitest";
import type { RankCell } from "../../../lib/rankIndex.js";
import { cellView, nextCellMode, parseCellMode } from "../sheetCell.js";

/** 12자리 중 3위, 균등 좌표로는 오른쪽에서 세 번째. */
const cell: RankCell = { rank: 3, total: 12, frac: 0.82, orderKey: 42 };

describe("cellView — 판단 축(값 없음)", () => {
    it("숫자는 순위 + 분모", () => {
        const v = cellView(cell, "number");
        expect(v.text).toBe("3");
        expect(v.sub).toBe("/12");
        expect(v.title).toBe("3/12");
    });

    it("값 눈금을 골라도 순위 자리로 폴백 — 없는 좌표를 지어내지 않는다", () => {
        expect(cellView(cell, "value").frac).toBe(0.82);
        expect(cellView(cell, "rank").frac).toBe(0.82);
    });
});

describe("cellView — 계산 축(값 있음)", () => {
    const valued = { frac: 0.35, text: "+12.3%" };

    it("숫자는 값이 먼저, 순위는 보조로", () => {
        const v = cellView(cell, "number", valued);
        expect(v.text).toBe("+12.3%");
        expect(v.sub).toBe(" (3/12)");
    });

    it("순위 눈금은 균등 자리, 값 눈금은 값의 실제 자리 — 둘은 다른 것을 말한다", () => {
        expect(cellView(cell, "rank", valued).frac).toBe(0.82);
        expect(cellView(cell, "value", valued).frac).toBe(0.35);
    });

    it("툴팁은 모드와 무관하게 값과 순위를 다 말한다", () => {
        expect(cellView(cell, "rank", valued).title).toBe("+12.3% · 3/12");
    });
});

describe("모드 토글·영속", () => {
    it("한 손잡이로 셋을 돈다", () => {
        expect(nextCellMode("number")).toBe("rank");
        expect(nextCellMode("rank")).toBe("value");
        expect(nextCellMode("value")).toBe("number");
    });

    it("옛 저장본(boolean)을 옮겨 읽는다 — 화면 설정이 조용히 초기화되지 않게", () => {
        expect(parseCellMode(true)).toBe("rank");
        expect(parseCellMode(false)).toBe("number");
    });

    it("모르는 값은 null(호출부가 기본값으로)", () => {
        expect(parseCellMode("bar")).toBeNull();
        expect(parseCellMode(null)).toBeNull();
    });
});
