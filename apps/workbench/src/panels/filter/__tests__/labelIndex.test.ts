// 라벨 색인 — 셀 판정의 재료(계층 상속·분 키·날짜 거르기). 엔진 쪽 판정 규칙은 core engine.test 가 잠근다.
import { describe, expect, it } from "vitest";
import { labelAtOf, labelIndexOf } from "../cellMaterials.js";

const groupByName = new Map([
    ["돌파", { name: "돌파", parentName: null }],
    ["돌파: 성공", { name: "돌파: 성공", parentName: "돌파" }],
    ["후발주", { name: "후발주", parentName: null }],
]);
const DATE = "2026-07-01";
const ix = labelIndexOf(
    DATE,
    [{ stockCode: "A", date: DATE, groupNames: ["후발주"] }, { stockCode: "B", date: "2026-07-02", groupNames: ["후발주"] }],
    [{ stockCode: "B", date: DATE, time: "09:05:00", groupNames: ["돌파: 성공"] }],
    groupByName,
);
const labelAt = labelAtOf(ix);
const MIN = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

describe("labelIndexOf / labelAtOf", () => {
    it("day — 그날 그 종목의 차트 소속(다른 날 소속은 안 샌다)", () => {
        expect(labelAt("A", MIN("10:00"), "day", ["후발주"])).toBe(true);
        expect(labelAt("B", MIN("10:00"), "day", ["후발주"]), "B 의 후발주는 다음 날 것").toBe(false);
    });

    it("point — 정확히 그 분 좌표만, 분 키는 엔진 셀과 같은 자정기준 분", () => {
        expect(labelAt("B", MIN("09:05"), "point", ["돌파: 성공"])).toBe(true);
        expect(labelAt("B", MIN("09:06"), "point", ["돌파: 성공"])).toBe(false);
    });

    it("계층 상속 — 자식 라벨이 부모 그룹을 만족한다(반대는 아니다)", () => {
        expect(labelAt("B", MIN("09:05"), "point", ["돌파"]), "부모로 걸면 자식 라벨이 통과").toBe(true);
    });

    it("groups 는 OR", () => {
        expect(labelAt("A", MIN("09:00"), "day", ["없음", "후발주"])).toBe(true);
    });
});
