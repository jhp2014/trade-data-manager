import { describe, it, expect } from "vitest";
import { toRailBand, toRailRanges, toRankBand, toValueRanges } from "../railBound.js";
import type { AxisBound } from "../../stage.js";

const v = (value: number): AxisBound => ({ kind: "value", value });
const p = (point: string): AxisBound => ({ kind: "point", point });

// 도메인 0~100. higher 축이면 왼쪽(약) = 0, lower 축이면 왼쪽 = 100.
const WEAK_H = v(0), STRONG_H = v(100);
const WEAK_L = v(100), STRONG_L = v(0);
/** 값 → 프랙션. higher 는 그대로, lower 는 뒤집힌다(왼쪽이 큰 값). */
const fracH = (b: AxisBound): number => (b.kind === "value" ? b.value / 100 : 0.5);
const fracL = (b: AxisBound): number => (b.kind === "value" ? 1 - b.value / 100 : 0.5);

describe("toRailRanges — 저장 구간을 레일 방향(왼쪽=약)으로", () => {
    it("higher 축은 하한이 왼쪽", () => {
        expect(toRailRanges([{ from: v(20), to: v(60) }], WEAK_H, STRONG_H, "higher")).toEqual([{ from: v(20), to: v(60) }]);
    });

    it("lower 축은 상한이 왼쪽 — 화면 관례가 뒤집힘을 흡수한다", () => {
        expect(toRailRanges([{ from: v(20), to: v(60) }], WEAK_L, STRONG_L, "lower")).toEqual([{ from: v(60), to: v(20) }]);
    });

    it("빈 끝은 도메인 끝으로 채운다(레일은 양끝이 있어야 그린다)", () => {
        expect(toRailRanges([{ from: v(20) }], WEAK_H, STRONG_H, "higher")).toEqual([{ from: v(20), to: STRONG_H }]);
        expect(toRailRanges([{ to: v(20) }], WEAK_H, STRONG_H, "higher")).toEqual([{ from: WEAK_H, to: v(20) }]);
    });

    it("양끝이 다 없는 구간은 조건이 아니라 안 그린다", () => {
        expect(toRailRanges([{}], WEAK_H, STRONG_H, "higher")).toEqual([]);
    });
});

describe("toValueRanges — 끝에 닿은 경계는 무제한으로 돌아간다", () => {
    it("한쪽만 닿으면 반열림", () => {
        expect(toValueRanges([{ from: v(0), to: v(60) }], fracH, "higher")).toEqual([{ from: undefined, to: v(60) }]);
        expect(toValueRanges([{ from: v(20), to: v(100) }], fracH, "higher")).toEqual([{ from: v(20), to: undefined }]);
    });

    it("안 닿았으면 그대로 닫힌 구간", () => {
        expect(toValueRanges([{ from: v(20), to: v(60) }], fracH, "higher")).toEqual([{ from: v(20), to: v(60) }]);
    });

    it("lower 축은 저장할 때 다시 뒤집힌다(왼쪽 = 상한)", () => {
        expect(toValueRanges([{ from: v(60), to: v(20) }], fracL, "lower")).toEqual([{ from: v(20), to: v(60) }]);
    });

    it("양끝 다 닿으면 조건이 아니라 버린다 — 전부 통과를 조건으로 남기지 않는다", () => {
        expect(toValueRanges([{ from: v(0), to: v(100) }], fracH, "higher")).toEqual([]);
    });

    it("타점 앵커는 프랙션이 끝이 아니면 그대로 살아 있다", () => {
        expect(toValueRanges([{ from: p("k1"), to: v(60) }], fracH, "higher")).toEqual([{ from: p("k1"), to: v(60) }]);
    });
});

describe("왕복 — 반열림이 조용히 닫히지 않는다", () => {
    it("채웠다 되돌리면 제자리", () => {
        const orig = [{ from: v(20) }, { to: v(80) }];
        const rail = toRailRanges(orig, WEAK_H, STRONG_H, "higher");
        expect(toValueRanges(rail, fracH, "higher")).toEqual([{ from: v(20), to: undefined }, { from: undefined, to: v(80) }]);
    });

    it("한 구간을 지워도 남은 구간의 반열림이 안 변한다(자리 대응이 아니라 좌표로 판단)", () => {
        const rail = toRailRanges([{ from: v(20) }, { to: v(80) }], WEAK_H, STRONG_H, "higher");
        expect(toValueRanges(rail.slice(1), fracH, "higher")).toEqual([{ from: undefined, to: v(80) }]);
    });
});

describe("판단 축 밴드", () => {
    // 자리 4개: s0(왼·약) s1 s2 s3(오른·강)
    const frac = (slotId: string): number => Number(slotId.slice(1)) / 3;

    it("빈 밴드는 안 그린다", () => {
        expect(toRailBand({}, "s0", "s3")).toEqual([]);
    });

    it("반열림은 끝 자리로 채운다", () => {
        expect(toRailBand({ lo: "s1" }, "s0", "s3")).toEqual([{ from: "s1", to: "s3" }]);
        expect(toRailBand({ hi: "s2" }, "s0", "s3")).toEqual([{ from: "s0", to: "s2" }]);
    });

    it("자리가 없으면 그릴 수 없다", () => {
        expect(toRailBand({ lo: "s1" }, undefined, undefined)).toEqual([]);
    });

    it("끝 자리에 닿은 경계는 무제한으로 저장", () => {
        expect(toRankBand([{ from: "s0", to: "s2" }], frac)).toEqual({ lo: undefined, hi: "s2" });
        expect(toRankBand([{ from: "s1", to: "s3" }], frac)).toEqual({ lo: "s1", hi: undefined });
    });

    it("양끝 다 끝이면 조건이 아니다(null = 그 필터를 지운다)", () => {
        expect(toRankBand([{ from: "s0", to: "s3" }], frac)).toBeNull();
        expect(toRankBand([], frac)).toBeNull();
    });
});
