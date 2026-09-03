// buildLegSpecs — 다리 표식 스펙 조립(순수): 스냅·중복 제거·값(고가 %) 조회·띠 양끝 스냅을 못 박는다.
// 캔버스 페인트(LegMarks primitive)는 여기서 못 재고, 스펙이 맞으면 그리기는 dropLine 과 같은 경로다.
import { describe, expect, it } from "vitest";
import { buildLegSpecs } from "../legMark.js";
import type { MinutePoint } from "../../lib/derive.js";

const pt = (time: number, high: number): MinutePoint => ({
    time,
    date: "2026-07-01",
    tradeTime: "09:00:00",
    open: 0,
    high,
    low: 0,
    close: 0,
    amount: 0,
    cumAmount: 0,
    highPrice: 0,
});
const points = [pt(100, 1.5), pt(160, 3.2), pt(220, 5.0)];

describe("buildLegSpecs", () => {
    it("캡 — 봉으로 스냅하고 그 봉의 고가(%)를 값으로, 기본 gap = HIGH_GAP(드롭선과 같은 계약)", () => {
        expect(buildLegSpecs(points, [160], null).caps).toEqual([{ time: 160, value: 3.2, gap: 8 }]);
    });

    it("봉 위 마커가 있는 봉은 gap 에 예약분이 붙는다 — 캡이 마커를 관통하지 않게", () => {
        const { caps } = buildLegSpecs(points, [160], null, (p) => p.time === 160);
        expect(caps).toEqual([{ time: 160, value: 3.2, gap: 8 + 16 }]);
    });

    it("봉 사이 시각은 이하 최대 봉으로, 같은 봉 중복은 하나로", () => {
        const { caps } = buildLegSpecs(points, [170, 165], null);
        expect(caps.map((c) => c.time)).toEqual([160]);
    });

    it("첫 봉보다 이른 시각(스냅 실패)은 버린다 — 지어내지 않는다", () => {
        expect(buildLegSpecs(points, [50], null).caps).toEqual([]);
    });

    it("띠 — 양끝 다 스냅돼야 선다, 한 봉짜리(시그널 봉 = 고점 봉)도 선다", () => {
        expect(buildLegSpecs(points, [], { from: 100, to: 220 }).band).toEqual({ from: 100, to: 220 });
        expect(buildLegSpecs(points, [], { from: 160, to: 160 }).band).toEqual({ from: 160, to: 160 });
        expect(buildLegSpecs(points, [], { from: 50, to: 220 }).band).toBeNull();
    });

    it("빈 입력 — 캡 0·띠 없음(갱신 렌즈·실시간 차트)", () => {
        expect(buildLegSpecs(points, [], null)).toEqual({ caps: [], band: null });
    });
});
