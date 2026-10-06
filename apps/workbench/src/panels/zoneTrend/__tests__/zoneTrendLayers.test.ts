// 존 추세 표시목록 — 층 순서·시선 맨 위(ACTIVE)·hover 승격/가라앉음·접힘 배지·선 집기.
import { describe, expect, it } from "vitest";
import { ACTIVE } from "../../../styles/palette.js";
import {
    foldedCounts, hoverLayer, memberLinesLayer, memberOpsOf, nearestLine, panYView, subjectLineLayer,
    trendGridLayer, zoneTrendLayers, zoomYView, Y_PAN, Y_ZOOM_MIN_SPAN, type TrendBox, type YView,
} from "../zoneTrendLayers.js";
import type { HoverDetail, ZoneTrendLine, ZoneTrendModel } from "../zoneTrendModel.js";

const line = (code: string, pts: { x: number; y: number }[]): ZoneTrendLine =>
    ({ code, name: code, pts, amountAt: () => 1_000_000_000 });

const scales = { x: (m: number) => m, y: (r: number) => 100 - r };
const box: TrendBox = { left: 0, top: 0, width: 600, height: 100 };
const Y: YView = { lo: 0, hi: 15 };

const model: ZoneTrendModel = {
    members: [line("A", [{ x: 10, y: 1 }, { x: 60, y: 5 }]), line("B", [{ x: 10, y: 2 }, { x: 60, y: 3 }])],
    subject: line("S", [{ x: 10, y: 0 }, { x: 60, y: 8 }]),
    memberCount: 2,
};

describe("zoneTrendLayers — 층 순서(먼저가 아래)", () => {
    it("격자 → 멤버 → hover 상세 → 승격 → 시선 → 현재 분", () => {
        const layers = zoneTrendLayers({
            model, memberOps: memberOpsOf(model.members, scales), hovered: null, hoverDetail: null, minute: 60,
            view: { fromMinute: 0, toMinute: 600 }, yView: Y, box, scales,
        });
        expect(layers.map((l) => l.name)).toEqual(["trend-grid", "trend-members", "trend-lift", "trend-hover", "trend-subject", "trend-now"]);
    });

    it("시선 선은 ACTIVE 색이고, 남을 짚는 중엔 반투명", () => {
        const idle = subjectLineLayer(model.subject, null, scales);
        const op = idle.groups[0].ops[0];
        expect(op.op === "polyline" && op.stroke).toBe(ACTIVE);
        expect(idle.groups[0].opacity).toBe(1);
        expect(subjectLineLayer(model.subject, "A", scales).groups[0].opacity).toBe(0.5);
        expect(subjectLineLayer(model.subject, "S", scales).groups[0].opacity).toBe(1); // 시선 자신을 짚으면 그대로
        expect(subjectLineLayer(null, null, scales).groups).toEqual([]);
    });
});

describe("hover — 짚은 선은 승격 층이 다시 그리고 나머지는 가라앉는다", () => {
    const ops = memberOpsOf(model.members, scales);

    it("평시 = 균일 0.55, 짚는 중 = 짚은 선 제외 + 0.25", () => {
        const idle = memberLinesLayer(ops, null);
        expect(idle.groups).toHaveLength(2);
        expect(idle.groups.every((g) => g.opacity === 0.55)).toBe(true);
        const hovering = memberLinesLayer(ops, "A");
        expect(hovering.groups).toHaveLength(1); // A 는 승격 층 몫
        expect(hovering.groups[0].opacity).toBe(0.25);
    });

    it("승격 층 — 짚은 멤버가 있을 때만 한 묶음, hover 상세(캔들)가 있어도 **남는다**(캔들 아래 짚기 앵커)", () => {
        const layers = zoneTrendLayers({
            model, memberOps: ops, hovered: "A", hoverDetail: null, minute: 60, view: { fromMinute: 0, toMinute: 600 }, yView: Y, box, scales,
        });
        const lift = layers.find((l) => l.name === "trend-lift")!;
        expect(lift.groups).toHaveLength(1);
        expect(zoneTrendLayers({ model, memberOps: ops, hovered: null, hoverDetail: null, minute: 60, view: { fromMinute: 0, toMinute: 600 }, yView: Y, box, scales })
            .find((l) => l.name === "trend-lift")!.groups).toHaveLength(0);
        const detail: HoverDetail = { candles: [{ x: 10, o: 1, h: 2, l: 0.5, c: 1.5 }], amounts: [], bands: [], chains: [] };
        expect(zoneTrendLayers({ model, memberOps: ops, hovered: "A", hoverDetail: detail, minute: 60, view: { fromMinute: 0, toMinute: 600 }, yView: Y, box, scales })
            .find((l) => l.name === "trend-lift")!.groups).toHaveLength(1);
    });
});

describe("hoverLayer — 캔들·대금 마커·밴드·사슬 묶음(투명도 단계)", () => {
    const detail: HoverDetail = {
        candles: [{ x: 10, o: 1, h: 3, l: 0.5, c: 2 }, { x: 11, o: 2, h: 2.5, l: 1, c: 1.2 }],
        amounts: [{ x: 10, h: 3, bucket: 1 }],
        bands: [
            { kind: "high", pts: [{ x: 10, lo: 2, hi: 3 }, { x: 11, lo: 2.2, hi: 3 }] },
            { kind: "base", pts: [{ x: 10, lo: 0.8, hi: 1 }] },
        ],
        chains: [{ from: 10, to: 11 }],
    };

    it("묶음 = 사슬 띠 → 밴드 → 캔들 → 대금 글자(옅은 것부터), 캔들은 봉마다 심지+몸통", () => {
        const layer = hoverLayer(detail, scales, box);
        expect(layer.name).toBe("trend-hover");
        expect(layer.groups).toHaveLength(4);
        const [chains, bands, candles, amounts] = layer.groups;
        expect(chains.ops.every((o) => o.op === "rect")).toBe(true);
        expect(bands.ops).toHaveLength(3); // high 2칸 + base 1칸
        expect(candles.ops).toHaveLength(4); // 봉 2 × (심지 line + 몸통 rect)
        expect(candles.ops.filter((o) => o.op === "rect")).toHaveLength(2);
        const amt = amounts.ops[0];
        expect(amt.op === "text" && amt.text).toBe("30"); // bucket 1 = 30억 구간 하한
        expect((chains.opacity ?? 1) < (bands.opacity ?? 1) && (bands.opacity ?? 1) < (candles.opacity ?? 1)).toBe(true);
    });

    it("상승/하락 캔들 색 — 종가 ≥ 시가 = rise", () => {
        const layer = hoverLayer(detail, scales, box);
        const bodies = layer.groups[2].ops.filter((o) => o.op === "rect");
        expect(bodies[0].op === "rect" && bodies[0].fill).toBe("var(--rise)");
        expect(bodies[1].op === "rect" && bodies[1].fill).toBe("var(--fall)");
    });

    it("null = 빈 층", () => {
        expect(hoverLayer(null, scales, box).groups).toEqual([]);
    });
});

describe("foldedCounts — 머리(마지막 꼭짓점)가 y 창 밖인 선 수(시선 포함)", () => {
    it("기본 모델은 0/0, 위·아래로 나간 머리를 심으면 그만큼", () => {
        expect(foldedCounts(model, Y)).toEqual({ above: 0, below: 0 });
        const out: ZoneTrendModel = {
            members: [line("A", [{ x: 10, y: 1 }, { x: 60, y: 22 }]), line("B", [{ x: 10, y: 1 }, { x: 60, y: -4 }])],
            subject: line("S", [{ x: 10, y: 0 }, { x: 60, y: 29 }]),
            memberCount: 2,
        };
        expect(foldedCounts(out, Y)).toEqual({ above: 2, below: 1 });
    });
});

describe("trendGridLayer — 동적 y 눈금(1/2/5 스텝)", () => {
    const sy = (hi: number, lo: number) => (r: number): number => ((hi - r) / (hi - lo)) * 100;
    const labelsOf = (y: YView): string[] => {
        const layer = trendGridLayer({ x: (m) => m, y: sy(y.hi, y.lo) }, { fromMinute: 0, toMinute: 0 }, y, box);
        return layer.groups[0].ops.filter((o) => o.op === "text").map((o) => (o.op === "text" ? o.text : ""));
    };

    it("자동 맞춤 꼴(−3~15.4) = 5 스텝, 좁은 창(−3~4) = 2 스텝", () => {
        expect(labelsOf({ lo: -3, hi: 15.4 })).toEqual(["0%", "5%", "10%", "15%"]);
        expect(labelsOf({ lo: -3, hi: 4 })).toEqual(["-2%", "0%", "2%", "4%"]);
    });

    it("x 시간 눈금 — 창 폭에 맞춘 동적 스텝(이른 시각의 좁은 창에도 선다)", () => {
        // 창을 box 폭(600px)에 맞춰 사상 — 실제 scale 과 같은 꼴(가장자리 글자 생략 가드가 px 로 재니까).
        const timesOf = (from: number, to: number): string[] => {
            const sx = (m: number): number => ((m - from) / (to - from)) * box.width;
            return trendGridLayer({ x: sx, y: () => 50 }, { fromMinute: from, toMinute: to }, { lo: 0, hi: 15 }, box)
                .groups[0].ops.filter((o) => o.op === "text" && o.text.includes(":")).map((o) => (o.op === "text" ? o.text : ""));
        };
        // 09:00~09:40(이른 시각, 40분 창) — 정시 고정이면 0개였을 자리에 5분 스텝(양끝 글자는 생략).
        expect(timesOf(540, 580)).toEqual(["09:05", "09:10", "09:15", "09:20", "09:25", "09:30", "09:35"]);
        // 하루 전체(390분) — 60분 스텝(과밀 방지).
        expect(timesOf(540, 930)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
    });
});

describe("y 수동 조정 — 줌·팬 한계", () => {
    it("줌은 커서 값 고정·폭 하한에서 멈춘다(변화 없으면 같은 참조)", () => {
        const v: YView = { lo: 0, hi: 10 };
        const zoomed = zoomYView(v, 0.5, 0.5); // 가운데 고정 절반
        expect(zoomed).toEqual({ lo: 2.5, hi: 7.5 });
        let tight: YView = { lo: 4, hi: 4 + Y_ZOOM_MIN_SPAN };
        expect(zoomYView(tight, 0.5, 0.5)).toBe(tight); // 하한 — 같은 참조
        tight = { lo: Y_PAN.lo, hi: Y_PAN.hi };
        expect(zoomYView(tight, 2, 0.5)).toBe(tight); // 상한(전 구간) — 같은 참조
    });

    it("팬은 폭을 유지한 채 Y_PAN 안에서 클램프", () => {
        const v: YView = { lo: 0, hi: 10 };
        expect(panYView(v, 5)).toEqual({ lo: 5, hi: 15 });
        expect(panYView(v, -999)).toEqual({ lo: Y_PAN.lo, hi: Y_PAN.lo + 10 });
        expect(panYView(v, 999)).toEqual({ lo: Y_PAN.hi - 10, hi: Y_PAN.hi });
    });
});

describe("nearestLine — 선분 거리 집기", () => {
    const lines = [line("A", [{ x: 10, y: 10 }, { x: 60, y: 10 }]), line("B", [{ x: 10, y: 2 }, { x: 60, y: 2 }])];
    // y=10 → py 90 · y=2 → py 98.

    it("반경 안에서 가까운 선, 밖이면 null", () => {
        expect(nearestLine(30, 91, lines, scales, box)).toBe("A");
        expect(nearestLine(30, 97, lines, scales, box)).toBe("B");
        expect(nearestLine(30, 60, lines, scales, box)).toBeNull(); // 둘 다 반경 밖
    });

    it("상자 밖 포인터는 안 집는다(유령 집기 방지)", () => {
        expect(nearestLine(-5, 90, lines, scales, box)).toBeNull();
        expect(nearestLine(30, 101, lines, scales, box)).toBeNull();
    });

    it("선분 끝 밖 x 는 끝점 거리로 잰다(세그먼트 클램프)", () => {
        expect(nearestLine(65, 90, lines, scales, box)).toBe("A"); // (60,90) 끝점에서 5px
        expect(nearestLine(80, 90, lines, scales, box)).toBeNull(); // 20px — 반경 밖
    });
});
