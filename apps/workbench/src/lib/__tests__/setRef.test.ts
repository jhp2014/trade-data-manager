import { describe, it, expect } from "vitest";
import { isPersistableSetRef, parseSetRef, setRefKey, type SetRef } from "../setRef.js";

describe("setRefKey — 같은 집합이면 같은 키", () => {
    it("산지마다 키가 갈린다", () => {
        const keys = [
            { kind: "universe" } as SetRef,
            { kind: "group", name: "테마" } as SetRef,
            { kind: "filter", filterId: null } as SetRef,
            { kind: "filter", filterId: "fs1" } as SetRef,
            { kind: "cell", filterId: null, stageId: "s1", cells: ["survive"] } as SetRef,
            { kind: "groupChain", names: ["테마", "돌파"] } as SetRef,
            { kind: "items", label: "밴드", items: [{ stockCode: "A", date: "2026-07-01" }] } as SetRef,
        ].map(setRefKey);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("칸 고르는 순서는 집합을 안 바꾼다 — 키가 같다", () => {
        const a = setRefKey({ kind: "cell", filterId: "f", stageId: "s", cells: ["survive", "nearMiss"] });
        const b = setRefKey({ kind: "cell", filterId: "f", stageId: "s", cells: ["nearMiss", "survive"] });
        expect(a).toBe(b);
    });

    it("활성 슬롯과 저장 필터는 다른 키 — 연동은 따라가고 고정은 안 따라간다는 구분의 뿌리", () => {
        expect(setRefKey({ kind: "filter", filterId: null })).not.toBe(setRefKey({ kind: "filter", filterId: "active" }));
    });
});

describe("parseSetRef — 영속 4종만 받는다", () => {
    it("영속 4종은 왕복한다", () => {
        const refs: SetRef[] = [
            { kind: "universe" },
            { kind: "group", name: "테마" },
            { kind: "filter", filterId: null },
            { kind: "filter", filterId: "fs1" },
            { kind: "cell", filterId: "fs1", stageId: "s1", cells: ["nearMiss", "survive"] },
        ];
        for (const r of refs) expect(parseSetRef(JSON.parse(JSON.stringify(r)))).toEqual(r);
    });

    it("세션 2종은 저장 대상이 아니다 — 파서가 거부한다", () => {
        expect(parseSetRef({ kind: "groupChain", names: ["a"] })).toBeNull();
        expect(parseSetRef({ kind: "items", label: "x", items: [] })).toBeNull();
        expect(isPersistableSetRef({ kind: "groupChain", names: ["a"] })).toBe(false);
        expect(isPersistableSetRef({ kind: "items", label: "x", items: [] })).toBe(false);
    });

    it("망가진 모양은 null — 빈 이름·빈 칸 목록·모르는 칸 이름", () => {
        expect(parseSetRef({ kind: "group", name: "" })).toBeNull();
        expect(parseSetRef({ kind: "cell", filterId: null, stageId: "s", cells: [] })).toBeNull();
        expect(parseSetRef({ kind: "cell", filterId: null, stageId: "s", cells: ["없는칸"] })).toBeNull();
        expect(parseSetRef({ kind: "cell", filterId: 3, stageId: "s", cells: ["survive"] })).toBeNull();
        expect(parseSetRef("universe")).toBeNull();
        expect(parseSetRef(null)).toBeNull();
    });
});
