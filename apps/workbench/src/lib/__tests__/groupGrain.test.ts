// grain 롤업(자손 포함) — 배정 팝오버 섹션과 그룹 필터 피커가 공유하는 잣대라, 여기가 흔들리면
// 두 화면이 같은 그룹을 다른 층위로 말한다.
import { describe, it, expect } from "vitest";
import type { Group } from "../../api/groups.js";
import { groupGrainSets } from "../groupGrain.js";

const g = (name: string, parentName: string | null = null): Group => ({ name, parentName } as Group);
const dict = (...groups: Group[]): Map<string, Group> => new Map(groups.map((x) => [x.name, x]));

describe("groupGrainSets — 자손 포함 롤업", () => {
    it("직접 멤버가 있는 grain 으로 분류된다", () => {
        const sets = groupGrainSets(
            [{ groupNames: ["돌파형"] }],
            [{ groupNames: ["눌림"] }],
            dict(g("돌파형"), g("눌림")),
        );
        expect(sets.dayGrain.has("돌파형")).toBe(true);
        expect(sets.pointGrain.has("돌파형")).toBe(false);
        expect(sets.pointGrain.has("눌림")).toBe(true);
        expect(sets.dayGrain.has("눌림")).toBe(false);
    });

    it("자식만 멤버인 조상도 그 grain — '빈 그룹' 오판이 반대 grain 목록을 오염시키지 않게", () => {
        const sets = groupGrainSets(
            [],
            [{ groupNames: ["눌림A"] }],
            dict(g("눌림"), g("눌림A", "눌림")),
        );
        expect(sets.pointGrain.has("눌림")).toBe(true); // 조상 전개
        expect(sets.dayGrain.has("눌림")).toBe(false);
    });

    it("빈 그룹은 어느 Set 에도 없다 — 양쪽 후보인지 제외인지는 소비자의 질문이 정한다", () => {
        const sets = groupGrainSets([], [], dict(g("빈그룹")));
        expect(sets.dayGrain.has("빈그룹")).toBe(false);
        expect(sets.pointGrain.has("빈그룹")).toBe(false);
    });

    it("양 grain 에 멤버가 있는 잔해는 양쪽에 선다 — 관례 위반을 숨기지 않는다", () => {
        const sets = groupGrainSets(
            [{ groupNames: ["혼합"] }],
            [{ groupNames: ["혼합"] }],
            dict(g("혼합")),
        );
        expect(sets.dayGrain.has("혼합")).toBe(true);
        expect(sets.pointGrain.has("혼합")).toBe(true);
    });
});
