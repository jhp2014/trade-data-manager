import { describe, it, expect } from "vitest";
import type { ChartRef, FunnelItem } from "@trade-data-manager/market/domain";
import type { SetRef } from "../../../lib/setRef.js";
import type { SavedSet } from "../../../store/filterFunnelSlice.js";
import { chartKey } from "../../../lib/pointKey.js";
import type { EvalLookup } from "../evaluate.js";
import type { FilterStage } from "../stage.js";
import { resolveSetRef, type SetResolveCtx } from "../resolveSet.js";

// 유니버스: A(타점 둘) · B(타점 0) · C(타점 하나)
const A: ChartRef = { stockCode: "000001", date: "2026-07-01" };
const B: ChartRef = { stockCode: "000002", date: "2026-07-02" };
const C: ChartRef = { stockCode: "000003", date: "2026-07-03" };
const times = new Map<string, string[]>([
    [chartKey(A), ["09:30:00", "10:00:00"]],
    [chartKey(C), ["11:00:00"]],
]);

// 그룹: "테마"(day) ∋ A·B — 상속으로 A 의 타점 전부에도 적용 / "돌파"(point) ∋ A@09:30 · C@11:00
const groupScopes = new Map([["테마", "day" as const], ["돌파", "point" as const]]);
const dayMembers = new Map([["테마", new Set([chartKey(A), chartKey(B)])]]);
const pointMembers = new Map([["돌파", new Set([`${chartKey(A)}|09:30:00`, `${chartKey(C)}|11:00:00`])]]);

const appliedGroupNamesOf = (i: FunnelItem): string[] => {
    const out: string[] = [];
    for (const [g, set] of dayMembers) if (set.has(chartKey(i))) out.push(g); // 하루 소속은 타점에도 상속
    if (i.time !== undefined) for (const [g, set] of pointMembers) if (set.has(`${chartKey(i)}|${i.time}`)) out.push(g);
    return out;
};

const stage = (id: string, predicates: FilterStage["predicates"], enabled = true): FilterStage => ({ id, enabled, predicates });
const dateStage = (id: string, from: string, to: string): FilterStage =>
    stage(id, [{ kind: "date", ranges: [{ from, to }] }]);
const groupStage = (id: string, groupId: string): FilterStage =>
    stage(id, [{ kind: "group", expr: { groups: [{ literals: [{ groupId, neg: false }] }] } }]);

// 작업 깔때기(활성 슬롯) = 날짜 ≤ 07-02. 저장 집합 둘 — 같은 조건에서 나온 형제(생존/칸)도 각자 사본이다.
const activeStages: FilterStage[] = [dateStage("d1", "2026-07-01", "2026-07-02")];
const savedSets = new Map<string, SavedSet>([
    ["fs1", { id: "fs1", name: "테마 생존", stages: [groupStage("g1", "테마")], part: { kind: "survivors" } }],
    ["fs2", { id: "fs2", name: "테마 탈락", stages: [groupStage("g1", "테마")], part: { kind: "cell", stageId: "g1", cells: ["fail"] } }],
    ["fs3", { id: "fs3", name: "부위 깨짐", stages: [dateStage("d9", "2026-07-01", "2026-07-03")], part: { kind: "cell", stageId: "없는단계", cells: ["survive"] } }],
]);

const evalLook: EvalLookup = {
    groupNamesOf: appliedGroupNamesOf,
    hasGroup: (id) => groupScopes.has(id),
    orderKeyOf: () => undefined,
    bandBoundOrderKey: () => undefined,
    axisValueOf: () => undefined,
    boundValue: () => undefined,
};

const ctx: SetResolveCtx = {
    candidates: [A, B, C],
    timesOf: (c) => times.get(chartKey(c)) ?? [],
    appliedGroupNamesOf,
    groupScope: (n) => groupScopes.get(n),
    activeStages,
    savedSetOf: (id) => savedSets.get(id),
    evalLook,
    grainLook: { groupScope: (n) => groupScopes.get(n), axisScope: () => undefined },
};

const codesOf = (r: { items: FunnelItem[] }): string[] => r.items.map((i) => `${i.stockCode.slice(-1)}${i.time ? "@" + i.time.slice(0, 5) : ""}`);

describe("resolveSetRef — 산지별 풀이", () => {
    it("유니버스: 후보 하루 전부, day 층위", () => {
        const r = resolveSetRef({ kind: "universe" }, ctx);
        expect(r).toMatchObject({ broken: false, grain: "day" });
        expect(codesOf(r)).toEqual(["1", "2", "3"]);
    });

    it("최종 생존: 작업 깔때기의 생존자", () => {
        const r = resolveSetRef({ kind: "survivors" }, ctx);
        expect(r.grain).toBe("day");
        expect(codesOf(r)).toEqual(["1", "2"]); // 날짜 ≤ 07-02
    });

    it("orphan(폐지된 옛 바인딩) = 항상 깨진 참조", () => {
        expect(resolveSetRef({ kind: "orphan", label: "그룹 테마" }, ctx)).toEqual({ broken: true, grain: "day", items: [] });
    });
});

describe("그룹 체인 — 층위 변환 법칙의 첫 실전(짚음 채널)", () => {
    it("day ∩ point 는 가장 가는 층위(point)에서 판정 — 하루 그룹은 상속으로 타점에 적용", () => {
        const r = resolveSetRef({ kind: "groupChain", names: ["테마", "돌파"] }, ctx);
        expect(r.grain).toBe("point");
        expect(codesOf(r)).toEqual(["1@09:30"]); // A@09:30 만 둘 다 — B 는 타점이 없어 돌파일 수 없다
    });

    it("day 만의 체인은 day 층위 그대로", () => {
        const r = resolveSetRef({ kind: "groupChain", names: ["테마"] }, ctx);
        expect(r.grain).toBe("day");
        expect(codesOf(r)).toEqual(["1", "2"]);
    });

    it("체인에 지워진 그룹이 섞이면 통째로 깨진 참조", () => {
        expect(resolveSetRef({ kind: "groupChain", names: ["테마", "없는그룹"] }, ctx).broken).toBe(true);
    });

    it("빈 체인은 전부 — 분모가 통째로 사라지지 않게(membersOfAll 과 같은 규칙)", () => {
        expect(codesOf(resolveSetRef({ kind: "groupChain", names: [] }, ctx))).toEqual(["1", "2", "3"]);
    });
});

describe("저장 집합 — 자립 저장물의 풀이(판정 엔진은 깔때기 것 그대로)", () => {
    it("부위=생존자: 제 조건 사본으로 판정 — 작업 깔때기와 독립", () => {
        expect(codesOf(resolveSetRef({ kind: "saved", setId: "fs1" }, ctx))).toEqual(["1", "2"]);
    });

    it("부위=칸: 같은 조건에서 나온 형제 — fail 칸이면 그 단계가 떨군 것들", () => {
        expect(codesOf(resolveSetRef({ kind: "saved", setId: "fs2" }, ctx))).toEqual(["3"]);
    });

    it("지워진 집합 = 깨진 참조", () => {
        expect(resolveSetRef({ kind: "saved", setId: "없는집합" }, ctx).broken).toBe(true);
    });

    it("부위(칸)의 단계가 조건에서 사라지면 깨진 참조 — 조용히 생존자로 넓히지 않는다", () => {
        expect(resolveSetRef({ kind: "saved", setId: "fs3" }, ctx).broken).toBe(true);
    });
});

describe("작업 깔때기의 칸 — 짚은 칸의 유일한 합집합 구현", () => {
    it("칸 참조: 그 단계의 칸 내용 — fail 칸이면 그 단계가 떨군 것들", () => {
        const r = resolveSetRef({ kind: "cell", stageId: "d1", cells: ["fail"] }, ctx);
        expect(r.broken).toBe(false);
        expect(codesOf(r)).toEqual(["3"]); // C 는 07-03 이라 탈락
    });

    it("칸 여러 개는 합집합(서로소라 겹침 없음)", () => {
        const r = resolveSetRef({ kind: "cell", stageId: "d1", cells: ["survive", "fail"] }, ctx);
        expect(codesOf(r).sort()).toEqual(["1", "2", "3"]);
    });

    it("지워지거나 꺼진 단계의 칸 = 깨진 참조 — 그 칸은 존재하지 않는다", () => {
        expect(resolveSetRef({ kind: "cell", stageId: "없는단계", cells: ["survive"] }, ctx).broken).toBe(true);
    });

    it("단계가 하나도 안 걸린 작업 깔때기의 생존 = 전부(공허참)", () => {
        const empty: SetResolveCtx = { ...ctx, activeStages: [] };
        expect(codesOf(resolveSetRef({ kind: "survivors" }, empty))).toEqual(["1", "2", "3"]);
    });

    it("⚠ 작업 깔때기는 주입된 정산(activeFilter)을 **그대로 재사용**한다 — 재평가하면 grain('타점으로 펼치기')이 갈리고 비용이 두 배가 된다", () => {
        // activeStages 로 재평가하면 날짜 필터라 A·B 가 나올 것 — 주입본이 오면 재사용이 증명된다.
        const injected: SetResolveCtx = {
            ...ctx,
            activeFilter: {
                grain: "point",
                active: [],
                tally: { universe: 1, stages: [], survivors: [{ stockCode: "000003", date: "2026-07-03", time: "11:00:00" }] },
            },
        };
        const r = resolveSetRef({ kind: "survivors" }, injected);
        expect(r.grain).toBe("point");
        expect(codesOf(r)).toEqual(["3@11:00"]);
        // 저장 집합(fs1)은 주입본과 무관 — 제 조건 사본으로 평가된다.
        expect(codesOf(resolveSetRef({ kind: "saved", setId: "fs1" }, injected))).toEqual(["1", "2"]);
    });
});

describe("항목 목록(세션) — 판정 없이 그대로", () => {
    it("시각이 하나라도 있으면 point 층위", () => {
        const ref: SetRef = {
            kind: "items", label: "밴드",
            items: [{ stockCode: "000001", date: "2026-07-01", time: "09:30:00" }, { stockCode: "000002", date: "2026-07-02" }],
        };
        const r = resolveSetRef(ref, ctx);
        expect(r.grain).toBe("point");
        expect(r.items).toHaveLength(2);
    });

    it("전부 하루면 day 층위", () => {
        expect(resolveSetRef({ kind: "items", label: "x", items: [{ stockCode: "000002", date: "2026-07-02" }] }, ctx).grain).toBe("day");
    });
});
