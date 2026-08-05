import { describe, it, expect } from "vitest";
import { skeletonSetError, skeletonShape, sortPivots, type PricedPivot, type SkeletonPivot } from "../skeleton.js";

const CHART_DATE = "2026-07-02";
const CHART = { date: CHART_DATE };                       // 차트 소유(일봉 골격)
const POINT = { date: CHART_DATE, time: "10:00:00" };     // 타점 소유(분봉 골격)
const pv = (anchorDate: string, field: SkeletonPivot["field"], anchorTime?: string): SkeletonPivot => ({ anchorDate, field, anchorTime, market: "un" });
/** 가격 피벗 — tIndex 는 해상도별 시간좌표(형태 계산은 이 차이만 쓴다). */
const pp = (tIndex: number, price: number, field: SkeletonPivot["field"] = "high", anchorDate = `2026-06-${String(tIndex + 1).padStart(2, "0")}`): PricedPivot =>
    ({ anchorDate, field, market: "un", price, tIndex });

describe("sortPivots — 순서는 저장하지 않고 파생한다", () => {
    it("날짜 → 캔들 내 순위(시0·고저1·종2)로 정렬한다", () => {
        const out = sortPivots([pv("2026-06-10", "close"), pv("2026-06-10", "high"), pv("2026-06-09", "close"), pv("2026-06-10", "open")]);
        expect(out.map((p) => `${p.anchorDate.slice(8)}${p.field}`)).toEqual(["09close", "10open", "10high", "10close"]);
    });

    it("한 캔들의 시→고→종은 정리다 — 윗꼬리 슈팅(갭·슈팅·밀림)이 세 점으로 표현된다", () => {
        const out = sortPivots([pv("2026-06-10", "close"), pv("2026-06-10", "open"), pv("2026-06-10", "high")]);
        expect(out.map((p) => p.field)).toEqual(["open", "high", "close"]);
    });

    it("분봉 피벗은 시각까지 보고 정렬한다", () => {
        const out = sortPivots([pv("2026-06-10", "high", "13:00:00"), pv("2026-06-10", "high", "09:30:00")]);
        expect(out.map((p) => p.anchorTime)).toEqual(["09:30:00", "13:00:00"]);
    });
});

describe("skeletonSetError — 행 단위로는 못 보는 집합 규칙", () => {
    it("차트 소유(일봉 골격)는 상한이 차트 날짜 — 당일 봉은 타점 이후 정보를 담는다", () => {
        expect(skeletonSetError(CHART, [], pv(CHART_DATE, "high"))).toMatch(/차트 날짜 이전/);
        expect(skeletonSetError(CHART, [], pv("2026-07-03", "high"))).toMatch(/차트 날짜 이전/);
        expect(skeletonSetError(CHART, [], pv("2026-07-01", "high"))).toBeNull();
    });

    it("같은 캔들에 高·低 동시 금지 — seq 를 안 두는 대가로 지키는 유일한 규칙", () => {
        expect(skeletonSetError(CHART, [pv("2026-06-10", "high")], pv("2026-06-10", "low"))).toMatch(/선후를 알 수 없/);
        // 시·종은 순서가 정리로 정해지므로 같은 캔들에 공존한다.
        expect(skeletonSetError(CHART, [pv("2026-06-10", "high")], pv("2026-06-10", "close"))).toBeNull();
        expect(skeletonSetError(CHART, [pv("2026-06-10", "high")], pv("2026-06-10", "open"))).toBeNull();
        // 다른 캔들의 저가는 무관.
        expect(skeletonSetError(CHART, [pv("2026-06-10", "high")], pv("2026-06-11", "low"))).toBeNull();
    });

    it("타점 소유(분봉 골격)는 상한이 **타점 시각** — 그 뒤 봉은 그 자리에서 알 수 없던 값", () => {
        expect(skeletonSetError(POINT, [], pv(CHART_DATE, "high", "09:30:00"))).toBeNull();
        expect(skeletonSetError(POINT, [], pv(CHART_DATE, "high", "10:00:00"))).toBeNull(); // 타점 시각 자신은 허용
        expect(skeletonSetError(POINT, [], pv(CHART_DATE, "high", "10:01:00"))).toMatch(/타점 시각까지만/);
    });

    it("분봉 골격은 타점 당일만 — 전날 장중은 담지 않는다", () => {
        expect(skeletonSetError(POINT, [], pv("2026-07-01", "high", "14:00:00"))).toMatch(/타점 당일/);
    });

    it("분봉 골격에 일봉 좌표(시각 없음)는 거부 — param 이 해상도라 섞일 표현이 없다", () => {
        expect(skeletonSetError(POINT, [], pv(CHART_DATE, "high"))).toMatch(/타점 시각까지만/);
    });

    it("소유가 달라도 캔들 내 규칙은 같다 — 분봉 한 봉의 高+低도 금지", () => {
        expect(skeletonSetError(POINT, [pv(CHART_DATE, "high", "09:30:00")], pv(CHART_DATE, "low", "09:30:00"))).toMatch(/선후를 알 수 없/);
        expect(skeletonSetError(POINT, [pv(CHART_DATE, "high", "09:30:00")], pv(CHART_DATE, "low", "09:31:00"))).toBeNull();
    });

    it("같은 점 재지정은 사유를 알려준다", () => {
        expect(skeletonSetError(CHART, [pv("2026-06-10", "high")], pv("2026-06-10", "high"))).toMatch(/이미 찍은/);
    });
});

describe("skeletonShape — 1턴차 사례가 실제로 갈리는가", () => {
    it("2점 미만은 골격이 아니다", () => {
        expect(skeletonShape([])).toBeNull();
        expect(skeletonShape([pp(0, 10000)])).toBeNull();
    });

    it("2연상 후 돌파 — 짧고 가파른 상승, 되돌림 0", () => {
        const s = skeletonShape([pp(0, 10000, "close"), pp(2, 16900)])!;
        expect(s.baseRisePct).toBeCloseTo(69, 0);
        expect(s.baseRiseSpan).toBe(2);
        expect(s.baseRiseSlope).toBeCloseTo(34.5, 0);
        expect(s.pullbackRatio).toBe(0); // 되돌림 없음의 **단언**(골격 없음과 다르다)
    });

    it("잔잔한 지속 상승 — 같은 되돌림 0 이지만 기울기가 가른다", () => {
        const s = skeletonShape([pp(0, 10000, "close"), pp(40, 13000)])!;
        expect(s.pullbackRatio).toBe(0); // 2연상과 같은 값
        expect(s.baseRiseSlope).toBeCloseTo(0.75, 2); // 34.5 vs 0.75 — 여기서 갈린다
    });

    it("윗꼬리 슈팅 — 한 캔들 안 상승이라 거래일 0, 기울기는 결손", () => {
        const s = skeletonShape([pp(10, 10000, "open", "2026-06-11"), pp(10, 14000, "high", "2026-06-11"), pp(12, 9000, "close")])!;
        expect(s.baseRiseSpan).toBe(0);
        expect(s.baseRiseSlope).toBeNull(); // 0으로 나누지 않는다 — 식별은 거래일 축이 한다
        expect(s.pullbackRatio).toBeCloseTo(125, 0); // (14000-9000)/(14000-10000) — 본상승을 다 반납하고 더 빠짐
    });

    it("되돌림률은 100%를 넘을 수 있다 — 클램프하면 정보가 사라진다", () => {
        const s = skeletonShape([pp(0, 10000), pp(5, 12000), pp(8, 9000)])!;
        expect(s.pullbackRatio).toBeCloseTo(150, 0);
    });

    it("되돌림은 P2 이후 **최저** 피벗까지 — W 는 더 깊은 골이 이긴다", () => {
        const shallow = skeletonShape([pp(0, 10000), pp(5, 12000), pp(8, 11000), pp(11, 11800)])!;
        const deep = skeletonShape([pp(0, 10000), pp(5, 12000), pp(8, 11000), pp(11, 11800), pp(14, 10400), pp(17, 11700)])!;
        expect(shallow.pullbackRatio).toBeCloseTo(50, 0);
        expect(deep.pullbackRatio).toBeCloseTo(80, 0); // 두 번째 골(10400)이 더 깊다
    });

    it("본상승은 언제나 P1→P2 — 뒤에 더 큰 상승이 와도 정의가 안 흔들린다", () => {
        const s = skeletonShape([pp(0, 10000), pp(5, 11000), pp(8, 10500), pp(11, 13000)])!;
        expect(s.baseRisePct).toBeCloseTo(10, 0); // P2(11000) 기준 — 전역 고점(13000)이 아니다
        expect(s.peakIsFirstHigh).toBe(false); // 감시 장치가 켜진다
    });

    it("첫 세그먼트가 상승이 아니면 되돌림률은 결손 — 정규화할 분모가 없다", () => {
        const s = skeletonShape([pp(0, 12000), pp(5, 10000), pp(8, 11000)])!;
        expect(s.baseRisePct).toBeCloseTo(-16.7, 1); // 음수는 그대로 정보
        expect(s.pullbackRatio).toBeNull();
    });

    it("pivotCount 는 원 해상도 — 축약 전 손으로 찍은 개수", () => {
        expect(skeletonShape([pp(0, 10000), pp(5, 12000), pp(8, 11000)])!.pivotCount).toBe(3);
    });
});
