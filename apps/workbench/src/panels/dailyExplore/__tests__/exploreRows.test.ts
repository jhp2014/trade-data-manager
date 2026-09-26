// 탐색판 순수부 — 행은 기본 종목순(토글로 시간순), 분 대금은 누적의 차분, 자동 그룹은 최상위 참조만,
// 열 상태는 모름을 탈락으로 안 찍는다.
import { describe, expect, it } from "vitest";
import type { CellHit } from "@trade-data-manager/market/domain";
import { MAX_GROUPS, autoGroupIds, cellKeyOf, exploreRowsOf, groupColStateOf, membershipOf } from "../exploreRows.js";
import type { SetExpr } from "../../filter/expr.js";

const hit = (code: string, min: number): CellHit => ({ code, min, tags: [], ratePct: null, cumAmount: null, zoneRank: null, zoneTheme: null });

describe("exploreRowsOf", () => {
    // 분(minute-of-day)을 unix 초로 흉내 — minuteOf 는 항등 취급.
    const stock = { times: [570, 571, 573], cumAmount: [10e8, 30e8, 31e8] };

    it("기본 = 종목순(종목 안 시간순) — 대부분 종목 단위로 걷는다", () => {
        const rows = exploreRowsOf([hit("B", 570), hit("A", 571), hit("A", 570)], () => stock, (t) => t);
        expect(rows.map((r) => [r.code, r.min])).toEqual([["A", 570], ["A", 571], ["B", 570]]);
    });

    it("시간순(같은 분이면 종목코드) · 분 대금 = 누적 차분, 첫 봉은 누적 그대로", () => {
        const rows = exploreRowsOf([hit("B", 571), hit("A", 571), hit("A", 570)], () => stock, (t) => t, "time");
        expect(rows.map((r) => [r.code, r.min, r.amount])).toEqual([
            ["A", 570, 10e8],
            ["A", 571, 20e8],
            ["B", 571, 20e8],
        ]);
        expect(rows[0]!.time).toBe("09:30:00"); // 570분 = 09:30
    });

    it("재료에 없는 종목·분은 대금 null — 0억으로 찍지 않는다", () => {
        const rows = exploreRowsOf([hit("A", 999), hit("X", 570)], (c) => (c === "A" ? stock : undefined), (t) => t, "time");
        expect(rows.map((r) => r.amount)).toEqual([null, null]);
    });
});

describe("autoGroupIds — 최상위 참조 항만, 상한까지", () => {
    const ref = (setId: string) => ({ kind: "ref" as const, id: `r-${setId}`, setId });
    it("조건 항은 안 세고, 중복은 한 번, MAX_GROUPS 에서 자른다", () => {
        const e: SetExpr = {
            id: "root",
            of: [{ kind: "cond", stage: { id: "s", enabled: true, predicates: [] } }, ref("a"), ref("b"), ref("a"), ref("c"), ref("d"), ref("e"), ref("f")],
            ops: ["or", "or", "or", "or", "or", "or", "or"],
            groups: [],
        };
        expect(autoGroupIds(e)).toEqual(["a", "b", "c", "d", "e"]);
        expect(autoGroupIds(e)).toHaveLength(MAX_GROUPS);
    });
});

describe("groupColStateOf — 모름은 ●/· 가 아니다", () => {
    const base = { evaluable: true, ready: true, isLoading: false, tooWide: false, truncated: false, themesReady: true, error: null, hits: [hit("A", 570)] };
    it("정상 = 멤버십 · 로딩 = loading · 잘림·오류 = unknown(이유)", () => {
        const ok = groupColStateOf(base);
        expect(ok.kind).toBe("ready");
        expect(ok.kind === "ready" && ok.member.has(cellKeyOf("A", 570))).toBe(true);
        expect(groupColStateOf({ ...base, isLoading: true }).kind).toBe("loading");
        expect(groupColStateOf({ ...base, ready: false }).kind).toBe("loading");
        expect(groupColStateOf({ ...base, tooWide: true }).kind).toBe("unknown");
        // 잘림도 모름이다 — 종목째 잘린 편향 표본(2026-09-26 실측: 시각-only 그룹이 ● 0개로 떨어졌다).
        expect(groupColStateOf({ ...base, truncated: true }).kind).toBe("unknown");
        expect(groupColStateOf({ ...base, error: new Error("x") }).kind).toBe("unknown");
        // 평가할 게 없는 그룹(전부 꺼짐·미연동 돌파·종단 참조) — ready 가 영영 안 서므로 "…" 가 아니라 모름.
        expect(groupColStateOf({ ...base, evaluable: false, ready: false }).kind).toBe("unknown");
        // 존 순위 재료(테마 멤버십)가 아직이면 모름 — · 로 찍으면 탈락처럼 보인다.
        expect(groupColStateOf({ ...base, themesReady: false }).kind).toBe("loading");
    });

    it("membershipOf — 좌표 키 한 벌", () => {
        expect(membershipOf([hit("A", 570), hit("B", 571)]).has("A|570")).toBe(true);
        expect(membershipOf([hit("A", 570)]).has("A|571")).toBe(false);
    });
});
