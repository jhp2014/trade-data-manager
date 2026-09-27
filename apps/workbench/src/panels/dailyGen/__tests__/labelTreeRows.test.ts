// 라벨 팝오버 트리 — 부모 다음 자식 · 끊긴 사슬 · 순환 고리가 목록에서 사라지지 않는다(체크를 못 푸는 사고 방지).
import { describe, expect, it } from "vitest";
import { labelTreeRows } from "../LabelCondEditor.js";

const g = (name: string, parentName: string | null = null) => ({ name, parentName });
const shape = (rows: ReturnType<typeof labelTreeRows>): string[] => rows.map((r) => `${"  ".repeat(r.depth)}${r.group.name}`);

describe("labelTreeRows", () => {
    it("부모 다음에 자식(이름순) — 허용 밖 그룹은 안 선다", () => {
        const groups = [g("돌파"), g("돌파: 실패", "돌파"), g("돌파: 성공", "돌파"), g("후발주")];
        expect(shape(labelTreeRows(groups, new Set(["돌파", "돌파: 성공", "돌파: 실패"])))).toEqual(["돌파", "  돌파: 성공", "  돌파: 실패"]);
    });

    it("부모가 허용 밖이면 자식이 최상위로 선다(끊긴 사슬 관대)", () => {
        const groups = [g("분류"), g("돌파: 성공", "분류")];
        expect(shape(labelTreeRows(groups, new Set(["돌파: 성공"])))).toEqual(["돌파: 성공"]);
    });

    it("순환 고리(A↔B)도 목록에서 사라지지 않는다", () => {
        const groups = [g("A", "B"), g("B", "A")];
        expect(labelTreeRows(groups, new Set(["A", "B"])).map((r) => r.group.name).sort()).toEqual(["A", "B"]);
    });
});
