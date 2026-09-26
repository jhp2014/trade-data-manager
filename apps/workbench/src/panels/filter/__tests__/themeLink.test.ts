import { describe, it, expect } from "vitest";
import { nextLinkedId, themeReadParamsOf } from "../themeLink.js";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import type { FilterStage } from "../stage.js";

// 연동 행이 사라졌을 때 어디로 가나 — 삭제 입구가 보드 밖(막대 목록·집합 적용)에도 있어 순수 해석기가 진다.
describe("nextLinkedId", () => {
    it("살아 있으면 그대로", () => {
        expect(nextLinkedId(["a", "b"], ["a", "b"], "b")).toBe("b");
    });

    it("사라지면 이전 목록에서의 다음 생존자로", () => {
        expect(nextLinkedId(["a", "b", "c"], ["a", "c"], "b")).toBe("c");
    });

    it("다음이 없으면 이전 생존자로", () => {
        expect(nextLinkedId(["a", "b"], ["a"], "b")).toBe("a");
    });

    it("이전 목록을 모르는 id(통째 교체)면 첫 행으로", () => {
        expect(nextLinkedId(["a", "b"], ["x", "y"], "b")).toBe("x");
        expect(nextLinkedId([], ["x"], "gone")).toBe("x");
    });

    it("목록이 비면 null", () => {
        expect(nextLinkedId(["a"], [], "a")).toBeNull();
    });
});

// 읽기 기준 사다리 — 겹침(ThemeScopePanel)·타점 정보가 같은 기준을 본다. 빈 술어를 건너뛰지 않으면
// [빈 theme, 활성 theme] 순서에서 빈 술어의 값이 "걸린 조건"처럼 그려진다(리뷰 #3).
describe("themeReadParamsOf", () => {
    const themeOn: FilterStage = {
        id: "b", enabled: true,
        predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE, countOn: false, baseRankOn: false, zoneRankOn: true, zoneRankMax: 4 }],
    };
    const themeEmpty: FilterStage = {
        id: "a", enabled: true,
        predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE, countOn: false, baseRankOn: false, zoneRankOn: false }],
    };

    it("첫 **켜진** theme 조건 — 컷이 전부 꺼진 빈 술어는 건너뛴다", () => {
        expect(themeReadParamsOf([themeEmpty, themeOn])).toMatchObject({ zoneRankOn: true, zoneRankMax: 4 });
    });

    it("켜진 조건이 없으면 기본값 — 꺼진 칸도 조건이 아니다", () => {
        expect(themeReadParamsOf([themeEmpty, { ...themeOn, enabled: false }])).toBe(DEFAULT_THEME_ZONE);
    });
});
