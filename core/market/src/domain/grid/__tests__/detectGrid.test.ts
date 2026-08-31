// detectGrid — 합성 분봉으로 격자 검출 규칙을 못 박는다(DB 0).
// 특히 "의도된 의미론"들: 수록·게이트가 자기 봉 대금뿐인 것(구제 폐기), 창 필터가 densify 앞인 것,
// 2% 경계의 ≥/≤, 자기 봉 확정 금지(반전 확정은 극값 봉보다 뒤의 봉에서만 — 2026-08-31 A안),
// 피벗 축약(compressPivots)이 적용된 출력.
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
        expect(detectGrid([flat("20:10:00", 10000, 1)], null)).toBeNull();
    });

    it("전 봉 flat(거래정지류) — 피벗 0·신고가 0·예외 없음(무사건 격자)", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10000, 1), flat("09:02:00", 10000, 1)], null);
        expect(g).not.toBeNull();
        expect(g?.pivots).toEqual([]);
        expect(g?.newHighs).toEqual([]);
        expect(g?.touchMin).toBeNull();
    });
});

describe("detectGrid — 신고가 목록", () => {
    it("갭 시작 — 첫 봉이 러닝 최고가, OHLC 절대가가 그대로 실린다(양봉 여부는 읽기 층 파생)", () => {
        const g = detectGrid([mc("09:00:00", 13000, 13000, 12900, 13000, 200000), flat("09:01:00", 12950, 1), flat("09:02:00", 12900, 1)], null);
        expect(g?.newHighs).toHaveLength(1);
        expect(g?.newHighs[0]).toEqual({ min: 540, open: 13000, high: 13000, low: 12900, close: 13000, tv: "2595000000" });
    });

    it("직전 봉 대금 구제는 없다 — 수록 기준은 자기 봉 대금뿐(tvMax2 폐기, 2026-08-31)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 200000), flat("09:01:00", 10050, 1000), flat("09:02:00", 10100, 1000)],
            null,
        );
        // 09:00(20억)만 수록 — 09:01 은 러닝 최고가 갱신이지만 자기 대금(0.1억) 미달(직전 봉 20억은 무관).
        expect(g?.newHighs.map((h) => h.min)).toEqual([540]);
    });

    it("dense 채움봉(거래량 0 평탄)은 신고가·피벗 어디에도 영향이 없다(densify 불변성)", () => {
        const gapped = detectGrid([flat("09:00:00", 10000, 200000), flat("09:04:00", 10300, 200000)], null);
        const explicit = detectGrid(
            [flat("09:00:00", 10000, 200000), ...["09:01:00", "09:02:00", "09:03:00"].map((t) => flat(t, 10000, 0)), flat("09:04:00", 10300, 200000)],
            null,
        );
        expect(gapped).toEqual(explicit);
        expect(gapped?.newHighs.map((h) => h.min)).toEqual([540, 544]);
    });

    it("floor 는 20억 이상(경계 포함)", () => {
        const yes = detectGrid([flat("09:00:00", 10000, 200000)], null);
        expect(yes?.newHighs).toHaveLength(1);
        const no = detectGrid([flat("09:00:00", 10000, 199999)], null);
        expect(no?.newHighs).toHaveLength(0);
    });
});

describe("detectGrid — 세션 창", () => {
    it("기본 창은 [08:00, 20:00] — 프리·애프터마켓 포함, 20:00 이후 제외", () => {
        const g = detectGrid(
            [flat("08:20:00", 11000, 200000), flat("09:01:00", 10500, 200000), flat("16:30:00", 12000, 200000), flat("20:10:00", 13000, 200000)],
            null,
        );
        // 16:30(애프터마켓)이 신고가로 수록되고, 20:10 은 창 밖이라 12,000 이 그날 최고가로 남는다.
        expect(g?.newHighs.map((h) => h.min)).toEqual([8 * 60 + 20, 16 * 60 + 30]);
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

    it("같은 봉이 고점을 세우고 자기 저가로 확정하지 못한다 — 자기 봉 확정 금지(2026-08-31 A안)", () => {
        // 09:01 에 +2% 확정(dir=up) → 09:02(3% 양봉)가 고점 10,450 을 갱신하지만 자기 저가 10,241
        // (=10450×0.98)로는 확정 불가 — 봉 내부 고·저 순서는 알 수 없고, 양봉의 저가는 상승의 시작점이다.
        // 뒤 봉이 없으므로 미확정 꼬리 고점만 남고, 축약(kept 고점 0)이 버려 피벗 0.
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10210, 1), mc("09:02:00", 10210, 10450, 10241, 10300, 1)],
            null,
        );
        expect(g?.pivots).toEqual([]);
    });

    it("종일 단조 상승 — 확정 고점이 없으므로 축약 후 피벗 0(무사건 취급, 2026-08-31 B안)", () => {
        // zigzag 원출력은 [선두 저점 확정, 미확정 고점 꼬리]지만 kept 고점(확정+러닝 최고가)이 없어
        // 선행 저점·미확정 꼬리 고점 모두 저장하지 않는다 — 소비자(pointsOf·눌림 깊이)가 쓸 수 없는 모양.
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1), flat("09:02:00", 10210, 1), flat("09:03:00", 10400, 1)],
            null,
        );
        expect(g?.pivots).toEqual([]);
    });

    it("seed — 검사 봉 자신이 저점 후보면 canUp 불성립(자기 봉 확정 금지), 반대쪽만 확정", () => {
        // 09:01 봉(고 10000·저 9790): 위로는 자기 저가 대비 +2.1%지만 저점 후보가 자기 봉이라 차단.
        // 아래로는 이전 봉 고점(09:00) 대비 −2.1% 성립 — 고점 피벗만 선두로 확정된다.
        // (참고) 자기 봉 게이트 도입 후 "두 극값이 서로 다른 앞 봉 출신"인 상하 동시 성립은 도달 불가다 —
        // 나중에 선 후보가 그 봉에서 확정을 못 냈다는 조건(임계 미달)이 검사 봉의 반대쪽 성립과 모순.
        // 도달 가능한 타이는 "두 극값이 같은 봉 출신"뿐(아래 동시 확정 타이 테스트가 커버).
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10000, 9790, 9800, 1)], null);
        expect(g?.pivots[0]).toMatchObject({ kind: "high", min: 540, confirmedMin: 541 });
    });

    it("동시 확정 타이 — 두 극값이 같은 봉 출신이면 확정 봉의 방향으로 가른다", () => {
        // 극값 둘 다 09:00 봉(고 10000·저 9600). 09:01 봉(9795 보합)에서 상하 확정이 같이 성립 —
        // 확정 봉이 양봉이 아니므로 고점이 선두 피벗.
        const g = detectGrid([mc("09:00:00", 9800, 10000, 9600, 9700, 1), flat("09:01:00", 9795, 1)], null);
        expect(g?.pivots[0]).toMatchObject({ kind: "high", min: 540, price: 10000, confirmedMin: 541 });
    });

    it("뒤 봉이 새 극값을 세우면서 같은 봉 저가로 확정하는 것도 막힌다 — 다음 봉이 확정", () => {
        // 09:01 에 상승 확정(dir=up) → 09:02 봉이 고점 10,600 갱신 + 자기 저가 10,380(≤10600×0.98=10388)
        // 이지만 극값 봉 자신이라 검사 생략 → 09:03 봉 저가 10,380 이 확정(confirmedMin=543≠542).
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                mc("09:02:00", 10210, 10600, 10380, 10590, 1),
                flat("09:03:00", 10380, 1),
            ],
            null,
        );
        const high = g?.pivots.find((p) => p.kind === "high");
        expect(high).toMatchObject({ min: 542, price: 10600, confirmedMin: 543 });
    });

    it("저점 대칭 — 긴 음봉이 자기 고가로 자기 저점을 확정하지 못한다", () => {
        // 09:01 에 하락 확정(dir=down) → 09:02 봉이 저점 9,600 갱신 + 자기 고가 9,990(≥9600×1.02=9792)
        // 이지만 극값 봉 자신이라 검사 생략 → 09:03 봉 고가 9,795 가 확정(confirmedMin=543≠542).
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9790, 9990, 9600, 9620, 1),
                flat("09:03:00", 9795, 1),
            ],
            null,
        );
        const low = g?.pivots.find((p) => p.kind === "low");
        expect(low).toMatchObject({ min: 542, price: 9600, confirmedMin: 543 });
    });

    it("피벗 min 은 강한 단조 증가 — 같은 분 고·저 퇴화 쌍이 생기지 않는다(재탐색이 피벗 다음 봉부터)", () => {
        // 상승 확정 → 하락 확정 → 상승 확정이 연쇄하는 입력: 러닝 최고가 갱신 고점 2개가 전부 kept.
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                flat("09:02:00", 10005, 1),
                flat("09:03:00", 10450, 1),
                flat("09:04:00", 10240, 1),
            ],
            null,
        );
        expect(g?.pivots.map((p) => [p.kind, p.min])).toEqual([
            ["high", 541],
            ["low", 542],
            ["high", 543],
            ["low", 544],
        ]);
        const mins = g?.pivots.map((p) => p.min) ?? [];
        expect(mins.every((m, i) => i === 0 || m > mins[i - 1])).toBe(true);
    });

    it("마지막 봉에서 확정이 나면 확정 봉 위치의 미확정 꼬리 피벗이 실린다(꼬리 가드 삭제)", () => {
        // 09:01(마지막 봉)에서 고점 확정 — 재탐색이 피벗 다음 봉부터라 꼬리 후보는 확정 봉 자신(퇴화 아님).
        const g = detectGrid([mc("09:00:00", 9800, 10000, 9600, 9700, 1), flat("09:01:00", 9795, 1)], null);
        expect(g?.pivots.map((p) => [p.kind, p.min])).toEqual([
            ["high", 540],
            ["low", 541],
        ]);
        expect(g?.pivots[1]).toMatchObject({ price: 9795, confirmedMin: null });
    });

    it("넓은 피벗 봉의 고가보다 낮은 확정 고점은 레벨이 아니다(kept ① = 실제 러닝 최고가 갱신)", () => {
        // 09:00 넓은 봉(저 10800·고 11200)이 저점 피벗 — 재탐색이 피벗 봉을 제외하므로 고가 11,200 은
        // 상승 leg 극값 후보에서 빠진다. 그 leg 의 확정 고점 11,160(09:01)은 실제 최고가(11,200)보다
        // 낮아 kept 에서 제외(B류 취급) — 앞 시각 캔들(11,200)이 레벨을 "재돌파"하는 역전 방지.
        // 11,250(09:03)은 실제 최고가 갱신이라 kept.
        const g = detectGrid(
            [
                mc("09:00:00", 10800, 11200, 10800, 11050, 1),
                flat("09:01:00", 11160, 1),
                flat("09:02:00", 10930, 1),
                flat("09:03:00", 11250, 1),
                flat("09:04:00", 11020, 1),
            ],
            null,
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 543, 11250],
            ["low", 544, 11020],
        ]);
    });

    it("legAmount — 축약 후엔 버려진 피벗 몫이 다음 kept 피벗에 합산된다(무손실)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 10210, 100000), mc("09:02:00", 10210, 10210, 10005, 10005, 100000)],
            null,
        );
        // zigzag 원출력: 저점(09:00, 10억)·고점(09:01, 10.21억)·꼬리 저점(09:02, 10.107억).
        // 축약: 선두 저점이 버려지며 그 몫이 kept 고점에 합산(10억+10.21억), 꼬리 저점은 자기 몫 그대로.
        expect(g?.pivots).toHaveLength(2);
        expect(g?.pivots[0]).toMatchObject({ kind: "high", min: 541, legAmount: "2021000000" });
        expect(g?.pivots[1]).toMatchObject({ kind: "low", min: 542, confirmedMin: null, legAmount: "1010700000" });
    });
});
