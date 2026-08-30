// detectGrid — 합성 분봉으로 격자 검출 규칙을 못 박는다(DB 0).
// 특히 "의도된 의미론"들: dense 채움이 tvMax2 의 직전을 끊는 것, 창 필터가 densify 앞인 것,
// 2% 경계의 ≥/≤, 같은 봉 동시 갱신의 결정 규칙, 미확정 마지막 마디.
import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "../../candle/model.js";
import { detectGrid } from "../grid.js";

const D = "2026-07-01";
const mc = (time: string, o: number, h: number, l: number, c: number, vol = 0): MinuteCandle => ({
    stockCode: "005930",
    date: D,
    time,
    krx: null,
    un: { open: String(o), high: String(h), low: String(l), close: String(c), volume: String(vol) },
});
/** 단일가 봉(O=H=L=C). vol 200_000 × 가격 10_000 = 거래대금 20억(floor 경계). */
const flat = (time: string, p: number, vol = 0): MinuteCandle => mc(time, p, p, p, p, vol);

describe("detectGrid — 입력 경계", () => {
    it("분봉 0건 → null(재료 없음)", () => {
        expect(detectGrid([], null)).toBeNull();
    });

    it("세션 창에 한 봉도 없으면 null", () => {
        expect(detectGrid([flat("16:10:00", 10000, 1)], null)).toBeNull();
    });

    it("전 봉 flat(거래정지류) — 피벗 0·신고가 0·예외 없음(무사건 격자)", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10000, 1), flat("09:02:00", 10000, 1)], null);
        expect(g).not.toBeNull();
        expect(g?.pivots).toEqual([]);
        expect(g?.newHighs).toEqual([]);
        expect(g?.touchMin).toBeNull();
    });
});

describe("detectGrid — 신고가 목록·tvMax2", () => {
    it("갭 시작 — 첫 봉이 러닝 최고가, tvMax2 는 자기 자신", () => {
        const g = detectGrid([mc("09:00:00", 13000, 13000, 12900, 13000, 200000), flat("09:01:00", 12950, 1), flat("09:02:00", 12900, 1)], null);
        expect(g?.newHighs).toHaveLength(1);
        expect(g?.newHighs[0]).toMatchObject({ min: 540, high: 13000, bull: false });
        expect(g?.newHighs[0].tvMax2).toBe(g?.newHighs[0].tv);
    });

    it("직전 봉 대금이 tvMax2 로 구제되고, 두 봉 지나면 안 된다", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 200000), flat("09:01:00", 10050, 1000), flat("09:02:00", 10100, 1000)],
            null,
        );
        // 09:00(20억) 수록, 09:01 은 자기 대금 미달이지만 직전 봉 20억으로 구제, 09:02 는 양쪽 다 미달.
        expect(g?.newHighs.map((h) => h.min)).toEqual([540, 541]);
        expect(g?.newHighs[1].tvMax2).toBe("2000000000");
    });

    it("VI 갭 — dense 평탄 채움봉이 tvMax2 의 '직전'을 끊는다(구제는 인접 봉만)", () => {
        const g = detectGrid([flat("09:00:00", 10000, 200000), flat("09:04:00", 10100, 1000)], null);
        // 09:01~03 은 거래량 0 평탄봉으로 채워지므로 09:04 의 직전 대금은 0 — 자기 대금(0.101억)뿐이라 미달.
        expect(g?.newHighs.map((h) => h.min)).toEqual([540]);
    });

    it("floor 는 20억 이상(경계 포함)", () => {
        const yes = detectGrid([flat("09:00:00", 10000, 200000)], null);
        expect(yes?.newHighs).toHaveLength(1);
        const no = detectGrid([flat("09:00:00", 10000, 199999)], null);
        expect(no?.newHighs).toHaveLength(0);
    });
});

describe("detectGrid — 세션 창", () => {
    it("기본 창은 프리마켓(08:00~) 포함, 시간외(15:30 이후) 제외", () => {
        const g = detectGrid(
            [flat("08:20:00", 11000, 200000), flat("09:01:00", 10500, 200000), flat("15:40:00", 12000, 200000)],
            null,
        );
        expect(g?.newHighs.map((h) => h.min)).toEqual([8 * 60 + 20]);
    });

    it("창 축소 시 창 밖 고가가 채움봉으로 새어들지 않는다(필터가 densify 앞)", () => {
        const g = detectGrid(
            [flat("08:20:00", 11000, 200000), flat("09:01:00", 10500, 200000)],
            null,
            { sessionStartMin: 9 * 60 },
        );
        // 08:20 의 11,000 이 09:00 채움봉으로 남으면 09:01(10,500)이 신고가가 못 된다 — 그 함정의 회귀선.
        expect(g?.newHighs.map((h) => h.min)).toEqual([9 * 60 + 1]);
    });
});

describe("detectGrid — 기준선 첫 터치", () => {
    it("미터치 — touchMin null 이면서 격자는 정상 성립", () => {
        const g = detectGrid([flat("09:00:00", 10000, 200000), flat("09:01:00", 10100, 1)], 20000);
        expect(g?.touchMin).toBeNull();
        expect(g?.base).toBe(20000);
        expect(g?.newHighs.length).toBeGreaterThan(0);
    });

    it("기준선이 첫 봉 아래 — 첫 봉이 터치, 볼륨 무관", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1)], 9000);
        expect(g?.touchMin).toBe(540);
    });

    it("장중 터치 — 고가 스침(≥)으로 판정", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10500, 10000, 10200, 1)], 10500);
        expect(g?.touchMin).toBe(541);
    });
});

describe("detectGrid — zigzag", () => {
    it("2% 경계 — 정확히 임계면 확정(≤), 1원 모자라면 미확정", () => {
        // 단일가(flat) 봉으로 떨어뜨린다 — 한 봉이 고·저를 같이 담으면 저가→고가 역방향 폭이 2%를 넘어
        // 반대쪽 확정이 정당하게 같이 성립해 버려 경계 검사가 안 된다.
        const confirmed = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9800, 1)], null);
        expect(confirmed?.pivots[0]).toMatchObject({ kind: "high", min: 540, price: 10000, confirmedMin: 541 });
        const not = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9801, 1)], null);
        expect(not?.pivots).toEqual([]);
    });

    it("같은 봉이 고점을 세우고 자기 저가로 확정할 수 있다(상승 중 스파이크)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10210, 1), mc("09:02:00", 10210, 10450, 10241, 10300, 1)],
            null,
        );
        // 09:01 에 +2% 확정(dir=up) → 09:02 가 고점 10,450 갱신과 동시에 저가 10,241(=10450×0.98)로 확정.
        const high = g?.pivots.find((p) => p.kind === "high");
        expect(high).toMatchObject({ min: 542, price: 10450, confirmedMin: 542 });
    });

    it("종일 단조 상승 — 선두 저점 확정 + 마지막 마디는 미확정(confirmedMin null)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1), flat("09:02:00", 10210, 1), flat("09:03:00", 10400, 1)],
            null,
        );
        expect(g?.pivots).toHaveLength(2);
        expect(g?.pivots[0]).toMatchObject({ kind: "low", price: 10000, confirmedMin: 542 });
        expect(g?.pivots[1]).toMatchObject({ kind: "high", price: 10400, confirmedMin: null });
    });

    it("한 봉에 상하 확정이 같이 성립하면 — 더 오래 서 있던 극값이 선두 피벗", () => {
        // 09:01 봉(고 10000·저 9790): 위로는 자기 저가 대비 +2.1%, 아래로는 고점(09:00) 대비 −2.1% 둘 다
        // 성립 — 고점 후보(09:00)가 저점 후보(09:01 자기 봉)보다 오래 서 있었으므로 고점 피벗이 선두.
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10000, 9790, 9800, 1)], null);
        expect(g?.pivots[0]).toMatchObject({ kind: "high", min: 540, confirmedMin: 541 });
    });

    it("legAmount — 직전 피벗 다음 봉부터 피벗 봉까지 누적(무손실)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 10210, 100000), mc("09:02:00", 10210, 10210, 10005, 10005, 100000)],
            null,
        );
        // 저점 피벗(09:00): 세션 시작~자기 봉 = 10억. 고점 피벗(09:01): 09:01 봉 대금 = 10.21억.
        expect(g?.pivots[0]).toMatchObject({ kind: "low", legAmount: "1000000000" });
        expect(g?.pivots[1]).toMatchObject({ kind: "high", legAmount: "1021000000" });
    });
});
