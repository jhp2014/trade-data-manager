import { describe, it, expect } from "vitest";
import { parseAssemblies } from "../assembliesSlice.js";

describe("parseAssemblies — 항목 단위 관대 파싱", () => {
    it("정상 저장물은 왕복한다(죽은 setId 도 그대로 — 깨진 표시가 계약)", () => {
        const src = [{ id: "as1", name: "비교셋", members: [{ setId: "fs1", enabled: true }, { setId: "지워진집합", enabled: false }] }];
        expect(parseAssemblies(JSON.parse(JSON.stringify(src)))).toEqual(src);
    });

    it("모양이 안 맞는 **항목만** 버린다 — 통째 폐기하지 않는다", () => {
        const out = parseAssemblies([
            { id: "", name: "빈 id" },
            { id: "as2", name: "  " },
            { id: "as3", name: "정상", members: [] },
            "문자열",
        ]);
        expect(out).toEqual([{ id: "as3", name: "정상", members: [] }]);
    });

    it("부품 줄의 관대함 — enabled 오염은 true, members 오염은 빈 목록", () => {
        const out = parseAssemblies([{ id: "as1", name: "a", members: [{ setId: "fs1", enabled: "yes" }] }]);
        expect(out).toEqual([{ id: "as1", name: "a", members: [{ setId: "fs1", enabled: true }] }]);
        expect(parseAssemblies([{ id: "as2", name: "b", members: "오염" }])).toEqual([{ id: "as2", name: "b", members: [] }]);
    });

    it("조립을 부품으로 든 저장물(중첩 시도)과 중복 setId 는 파서가 거른다", () => {
        const out = parseAssemblies([{
            id: "as1", name: "a",
            members: [{ setId: "as9", enabled: true }, { setId: "fs1", enabled: true }, { setId: "fs1", enabled: false }],
        }]);
        expect(out).toEqual([{ id: "as1", name: "a", members: [{ setId: "fs1", enabled: true }] }]);
    });

    it("배열이 아니면 null(키 전체 무시 → 기본값)", () => {
        expect(parseAssemblies({})).toBeNull();
        expect(parseAssemblies(null)).toBeNull();
    });
});
