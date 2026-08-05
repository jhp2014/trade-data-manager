import { describe, it, expect } from "vitest";
import { ANCHOR_FIELDS, anchorCoordKey, beatsAsBaseline, candlePrice, chartKeyOf, FIELD_RANK, pointKeyOf } from "#domain";

// 계층 횡단 헬퍼 — 서버(리졸버·캐시 지문)와 클라(차트 표시·키 조인)가 같은 함수를 쓰는 것들.
// 각자의 소비처 테스트가 행동을 이미 덮지만, 여기서는 **계약 자체**(형식·규칙)를 못박는다.
describe("키 직렬화 — 구분자 | 계약", () => {
    it("pointKeyOf / chartKeyOf", () => {
        const p = { stockCode: "005930", date: "2026-07-02", time: "09:30:00" };
        expect(pointKeyOf(p)).toBe("005930|2026-07-02|09:30:00");
        expect(chartKeyOf(p)).toBe("005930|2026-07-02");
    });
});

describe("candlePrice — 미수집/0/비수치 = null(결손)", () => {
    it("정상 값은 수치로", () => {
        expect(candlePrice("10000")).toBe(10000);
        expect(candlePrice(10000)).toBe(10000);
    });
    it("결손 경로 전부 null — 지어내지 않는다", () => {
        expect(candlePrice(undefined)).toBeNull();
        expect(candlePrice("0")).toBeNull(); // 0 가격 캔들 = 데이터 오류
        expect(candlePrice("-100")).toBeNull();
        expect(candlePrice("abc")).toBeNull();
        expect(candlePrice("")).toBeNull(); // Number("") === 0
    });
});

describe("beatsAsBaseline — 가격 최저, 타이면 좌표 최신", () => {
    const c = (price: number, coord: string) => ({ price, coord });
    it("낮은 가격이 이긴다", () => {
        expect(beatsAsBaseline(c(100, "a"), c(200, "z"))).toBe(true);
        expect(beatsAsBaseline(c(200, "z"), c(100, "a"))).toBe(false);
    });
    it("같은 가격은 좌표 최신이 이긴다 — anchorCoordKey 사전순이 시간순", () => {
        const older = anchorCoordKey({ anchorDate: "2026-06-25" });
        const newer = anchorCoordKey({ anchorDate: "2026-06-30" });
        const newerMinute = anchorCoordKey({ anchorDate: "2026-06-30", anchorTime: "09:30:00" });
        expect(beatsAsBaseline(c(100, newer), c(100, older))).toBe(true);
        expect(beatsAsBaseline(c(100, older), c(100, newer))).toBe(false);
        expect(beatsAsBaseline(c(100, newerMinute), c(100, newer))).toBe(true); // 같은 날 분봉 > 일봉
    });
});

describe("ANCHOR_FIELDS — 런타임 목록과 타입의 정합", () => {
    it("FIELD_RANK(전 필드 Record)와 같은 집합 — 한쪽만 늘면 여기서 잡힌다", () => {
        expect([...ANCHOR_FIELDS].sort()).toEqual(Object.keys(FIELD_RANK).sort());
    });
});
