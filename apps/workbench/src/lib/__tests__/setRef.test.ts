import { describe, it, expect } from "vitest";
import { isPersistableSetRef, parseSetRef, setRefKey, type SetRef } from "../setRef.js";

describe("setRefKey — 같은 집합이면 같은 키", () => {
    it("산지마다 키가 갈린다", () => {
        const keys = [
            { kind: "universe" } as SetRef,
            { kind: "survivors" } as SetRef,
            { kind: "saved", setId: "fs1" } as SetRef,
            { kind: "orphan", label: "그룹 테마" } as SetRef,
            { kind: "cell", stageId: "s1", cells: ["survive"] } as SetRef,
            { kind: "groupChain", names: ["테마", "돌파"] } as SetRef,
            { kind: "items", label: "밴드", items: [{ stockCode: "A", date: "2026-07-01" }] } as SetRef,
        ].map(setRefKey);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("칸 고르는 순서는 집합을 안 바꾼다 — 키가 같다", () => {
        const a = setRefKey({ kind: "cell", stageId: "s", cells: ["survive", "nearMiss"] });
        const b = setRefKey({ kind: "cell", stageId: "s", cells: ["nearMiss", "survive"] });
        expect(a).toBe(b);
    });

    it("작업 깔때기 생존과 저장 집합은 다른 키 — 시선은 따라가고 고정은 안 따라간다는 구분의 뿌리", () => {
        expect(setRefKey({ kind: "survivors" })).not.toBe(setRefKey({ kind: "saved", setId: "x" }));
    });

    it("⚠ 자유 텍스트 이름이 키를 오염시키지 못한다 — 'A&B' 그룹 체인 ≠ [A,B] 체인 (캐시 키라 충돌=다른 집합 반환)", () => {
        expect(setRefKey({ kind: "groupChain", names: ["A&B"] }))
            .not.toBe(setRefKey({ kind: "groupChain", names: ["A", "B"] }));
    });

    it("체인 순서는 집합을 안 바꾼다(교집합) — 키가 같아 한 번만 풀린다", () => {
        expect(setRefKey({ kind: "groupChain", names: ["A", "B"] }))
            .toBe(setRefKey({ kind: "groupChain", names: ["B", "A"] }));
    });
});

describe("parseSetRef — 영속 3종 + orphan", () => {
    it("영속 3종과 orphan 은 왕복한다", () => {
        const refs: SetRef[] = [
            { kind: "universe" },
            { kind: "survivors" },
            { kind: "saved", setId: "fs1" },
            { kind: "orphan", label: "그룹 테마" },
        ];
        for (const r of refs) expect(parseSetRef(JSON.parse(JSON.stringify(r)))).toEqual(r);
    });

    it("세션 종류는 저장 대상이 아니다 — 파서가 거부한다", () => {
        expect(parseSetRef({ kind: "groupChain", names: ["a"] })).toBeNull();
        expect(parseSetRef({ kind: "items", label: "x", items: [] })).toBeNull();
        expect(isPersistableSetRef({ kind: "groupChain", names: ["a"] })).toBe(false);
        expect(isPersistableSetRef({ kind: "items", label: "x", items: [] })).toBe(false);
        expect(isPersistableSetRef({ kind: "cell", stageId: "s", cells: ["survive"] })).toBe(false);
    });

    it("옛 filter 바인딩은 무손실 변환 — null=최종 생존, 문자열=저장 집합(이관이 id 를 유지하므로)", () => {
        expect(parseSetRef({ kind: "filter", filterId: null })).toEqual({ kind: "survivors" });
        expect(parseSetRef({ kind: "filter", filterId: "fs1" })).toEqual({ kind: "saved", setId: "fs1" });
    });

    it("폐지된 그룹·칸 직접 바인딩은 orphan — 조용히 연동으로 폴백하지 않는다(깨진 참조 = 빈 집합 + 라벨)", () => {
        expect(parseSetRef({ kind: "group", name: "테마" })).toEqual({ kind: "orphan", label: "그룹 테마" });
        expect(parseSetRef({ kind: "cell", filterId: null, stageId: "s1", cells: ["nearMiss"] }))
            .toEqual({ kind: "orphan", label: "옛 칸 바인딩" });
    });

    it("망가진 모양은 null — 빈 이름·빈 id·모르는 칸 이름", () => {
        expect(parseSetRef({ kind: "group", name: "" })).toBeNull();
        expect(parseSetRef({ kind: "saved", setId: "" })).toBeNull();
        expect(parseSetRef({ kind: "orphan", label: "" })).toBeNull();
        expect(parseSetRef({ kind: "cell", stageId: "s", cells: ["없는칸"] })).toBeNull();
        expect(parseSetRef({ kind: "filter", filterId: 3 })).toBeNull();
        expect(parseSetRef("universe")).toBeNull();
        expect(parseSetRef(null)).toBeNull();
    });
});
