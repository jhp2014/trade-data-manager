// 차트 앵커 표식 **배치**의 계약. 화면 상태를 안 보는 순수 계산이라 그대로 잰다.
//
// 제일 중요한 건 마지막 두 검사다: `xOf === null`(그 봉이 시리즈에 없다)과 "상자 밖"(봉은 있는데
// 스크롤 밖)은 **다른 사건**이라는 것. 합치면 "데이터에 없는 것"과 "지금 안 보이는 것"이 한 덩어리가
// 되고, 그 순간 ◀▶ 칩이 "2년 창 밖이라 못 그리는 것"까지 가리키는 거짓말을 하게 된다.
import { describe, it, expect } from "vitest";
import { BASELINE_PARAM, IGNORE_CANDLE_PARAM } from "@trade-data-manager/market/domain";
import { HIGH_GAP, MARK_H, MARK_ROW_H, type AnchorMark } from "../../lib/anchorMarks.js";
import { layoutAnchorMarks } from "../anchorMarkOverlay.js";

const mark = (date: string, over: Partial<AnchorMark> = {}): AnchorMark => ({
    key: `${BASELINE_PARAM}@${date}T`, param: BASELINE_PARAM, short: "기준", solid: true,
    anchorDate: date, tip: "", ...over,
});

const base = {
    highOf: () => 1000,
    hasMarkerAt: () => false,
    timeOf: (m: AnchorMark) => m.anchorDate,
    width: 500,
    topPad: 2,
    markerReserve: 16,
};

describe("layoutAnchorMarks — 드롭선", () => {
    it("봉당 하나 — 같은 봉에 표식이 여럿이면 칩만 쌓이고 선은 하나다", () => {
        const marks = [mark("2026-07-01"), mark("2026-07-01", { key: "ign@2026-07-01T", param: IGNORE_CANDLE_PARAM, short: "무시" })];
        const out = layoutAnchorMarks({ ...base, marks, xOf: () => 100 });
        expect(out.chips).toHaveLength(2);
        expect(out.drops).toHaveLength(1);
        // 칩 무더기 **바닥**에서 출발한다(둘째 줄 아래).
        expect(out.drops[0].fromY).toBe(2 + MARK_ROW_H + MARK_H + 2);
    });

    it("그 봉에 기존 마커가 있으면 끝을 예약분만큼 더 띄운다 — 안 그러면 선이 마커를 뚫는다", () => {
        const marks = [mark("2026-07-01")];
        const plain = layoutAnchorMarks({ ...base, marks, xOf: () => 100 });
        const withMarker = layoutAnchorMarks({ ...base, marks, xOf: () => 100, hasMarkerAt: () => true });
        expect(plain.drops[0].gap).toBe(HIGH_GAP);
        expect(withMarker.drops[0].gap).toBe(HIGH_GAP + base.markerReserve);
    });

    it("고가를 모르면 안 긋는다 — 끝점을 지어내지 않는다(칩은 남는다)", () => {
        const out = layoutAnchorMarks({ ...base, marks: [mark("2026-07-01")], xOf: () => 100, highOf: () => null });
        expect(out.chips).toHaveLength(1);
        expect(out.drops).toEqual([]);
    });

    it("후보만의 봉은 선도 흐리다 — 채운 칩이 하나라도 있으면 진하다", () => {
        const cand = layoutAnchorMarks({ ...base, marks: [mark("2026-07-01", { solid: false, short: "후보" })], xOf: () => 100 });
        const mixed = layoutAnchorMarks({
            ...base, xOf: () => 100,
            marks: [mark("2026-07-01", { key: "a", solid: false, short: "후보" }), mark("2026-07-01", { key: "b", solid: true })],
        });
        expect(cand.drops[0].opacity).toBeLessThan(mixed.drops[0].opacity);
    });
});

describe("layoutAnchorMarks — 없는 봉과 창 밖은 다른 사건이다", () => {
    it("xOf 가 null 이면(시리즈에 없는 봉) 표식 자체를 버린다 — ◀▶ 로도 안 샌다", () => {
        const out = layoutAnchorMarks({ ...base, marks: [mark("2020-01-01")], xOf: () => null });
        expect([out.chips, out.offLeft, out.offRight, out.drops]).toEqual([[], [], [], []]);
    });

    it("상자 밖이면 ◀▶ 로 간다 — 드롭선은 없다(x 를 주장하지 않는다)", () => {
        const left = layoutAnchorMarks({ ...base, marks: [mark("2026-07-01")], xOf: () => -30 });
        const right = layoutAnchorMarks({ ...base, marks: [mark("2026-07-01")], xOf: () => 900 });
        expect([left.offLeft.length, left.chips.length, left.drops.length]).toEqual([1, 0, 0]);
        expect([right.offRight.length, right.chips.length, right.drops.length]).toEqual([1, 0, 0]);
    });
});
