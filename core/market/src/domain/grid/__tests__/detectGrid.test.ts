// detectGrid — 합성 분봉으로 격자 검출 규칙을 못 박는다(DB 0).
// 특히 "의도된 의미론"들: 수록·게이트가 자기 봉 대금뿐인 것(구제 폐기), 창 필터가 densify 앞인 것,
// v9 경로 뷰 피벗(2026-09-05): 양방향 zigzag 국소 극값 교대 열, tie 규칙 하나(세션 최고가 갱신 봉에서만
// 고가 우선·그 밖 저가 우선), 자기 봉 확정 금지, 꼬리(미확정)는 마지막 1개, 저점도 확정 시각을 든다.
// 대금은 기록 봉의 누적 스냅샷(cum)뿐 — leg/renewal 창은 windows.ts 파생으로 옛 기대값이 그대로 재현돼야 한다.
import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "../../candle/model.js";
import { detectGrid, type GridDayPrices, type PointGrid } from "../grid.js";
import { checkGridInvariants } from "../invariants.js";
import { levelViewOf } from "../levelView.js";
import { legAmountOf, legAmountOfPair, renewalAmountOf } from "../windows.js";

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

/** 가격 셋(기준선·그날 기준가 UN/KRX) — 검출 테스트는 기준선만 신경 쓴다(prevBase* 는 통과 사실). */
const px = (base: number | null = null, prevBase: number | null = null, prevBaseKrx: number | null = null): GridDayPrices => ({ base, prevBase, prevBaseKrx });

describe("detectGrid — 입력 경계", () => {
    it("분봉 0건 → null(재료 없음)", () => {
        expect(detectGrid([], px())).toBeNull();
    });

    it("세션 창에 한 봉도 없으면 null", () => {
        expect(detectGrid([flat("20:10:00", 10000, 1)], px())).toBeNull();
    });

    it("전 봉 flat(거래정지류) — 피벗 0·신고가 0·예외 없음(무사건 격자)", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10000, 1), flat("09:02:00", 10000, 1)], px());
        expect(g).not.toBeNull();
        expect(g?.pivots).toEqual([]);
        expect(g?.newHighs).toEqual([]);
        expect(g?.touch).toBeNull();
    });
});

describe("detectGrid — 신고가 목록", () => {
    it("갭 시작 — 첫 봉이 러닝 최고가, OHLC 절대가가 그대로 실린다(양봉 여부는 읽기 층 파생)", () => {
        const g = detectGrid([mc("09:00:00", 13000, 13000, 12900, 13000, 200000), flat("09:01:00", 12950, 1), flat("09:02:00", 12900, 1)], px());
        expect(g?.newHighs).toHaveLength(1);
        expect(g?.newHighs[0]).toEqual({ min: 540, open: 13000, high: 13000, low: 12900, close: 13000, tv: "2595000000", cum: "2595000000", maxBefore: 0 });
    });

    it("직전 봉 대금 구제는 없다 — 수록 기준은 자기 봉 대금뿐(tvMax2 폐기, 2026-08-31)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 200000), flat("09:01:00", 10050, 1000), flat("09:02:00", 10100, 1000)], px(),
        );
        // 09:00(20억)만 수록 — 09:01 은 러닝 최고가 갱신이지만 자기 대금(0.1억) 미달(직전 봉 20억은 무관).
        expect(g?.newHighs.map((h) => h.min)).toEqual([540]);
    });

    it("dense 채움봉(거래량 0 평탄)은 신고가·피벗 어디에도 영향이 없다(densify 불변성)", () => {
        const gapped = detectGrid([flat("09:00:00", 10000, 200000), flat("09:04:00", 10300, 200000)], px());
        const explicit = detectGrid(
            [flat("09:00:00", 10000, 200000), ...["09:01:00", "09:02:00", "09:03:00"].map((t) => flat(t, 10000, 0)), flat("09:04:00", 10300, 200000)],
            px(),
        );
        expect(gapped).toEqual(explicit);
        expect(gapped?.newHighs.map((h) => h.min)).toEqual([540, 544]);
        // 누적은 채움봉(대금 0)을 지나도 그대로 — 09:04 의 cum = 09:00 + 09:04.
        expect(gapped?.newHighs.map((h) => h.cum)).toEqual(["2000000000", "4060000000"]);
    });

    it("floor 는 20억 이상(경계 포함)", () => {
        const yes = detectGrid([flat("09:00:00", 10000, 200000)], px());
        expect(yes?.newHighs).toHaveLength(1);
        const no = detectGrid([flat("09:00:00", 10000, 199999)], px());
        expect(no?.newHighs).toHaveLength(0);
    });
});

describe("detectGrid — 기준 밴드(maxBefore, §10.2)", () => {
    it("상단 돌파 직후 밴드 진입 — 리셋된 밴드 안 봉이 사건이고, 좁아진 하단 아래 봉은 무사건", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 250000), // 상단 돌파(첫 봉) — maxBefore 0, bottom = 9950
                flat("09:01:00", 9970, 250000), // 진입(9970 > 9950) — 하단이 9970 으로 좁아진다
                flat("09:02:00", 9960, 250000), // 무사건(9960 ≤ 9970 — 같은 자리 재진입 아님)
                flat("09:03:00", 9980, 250000), // 진입(9980 > 9970)
                flat("09:04:00", 10100, 250000), // 상단 돌파 — 밴드 리셋(bottom = 10049.5)
                flat("09:05:00", 10040, 250000), // 무사건(10040 ≤ 10049.5)
            ], px(),
        ));
        expect(g.newHighs.map((e) => [e.min, e.high, e.maxBefore])).toEqual([
            [540, 10000, 0], // 세션 첫 봉 maxBefore = 0
            [541, 9970, 10000],
            [543, 9980, 10000],
            [544, 10100, 10000],
        ]);
        // maxBefore 비감소 + 상단 돌파 부분열(high > maxBefore) = v8 신고가 목록.
        const mb = g.newHighs.map((e) => e.maxBefore);
        expect(mb.every((v, i) => i === 0 || v >= mb[i - 1])).toBe(true);
        expect(g.newHighs.filter((e) => e.high > e.maxBefore).map((e) => e.min)).toEqual([540, 544]);
    });

    it("저대금 진입 봉은 수록되지 않지만 하단은 올린다 — 그 아래 고대금 봉은 무사건(같은 자리)", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 200000), // 상단 돌파
                flat("09:01:00", 9990, 1), // 진입이지만 저대금 — 미수록, bottom = 9990
                flat("09:02:00", 9985, 200000), // 무사건(9985 ≤ 9990) — 저대금 봉이 이미 그 자리를 지웠다
            ], px(),
        ));
        expect(g.newHighs.map((e) => e.min)).toEqual([540]);
    });
});

describe("detectGrid — 세션 창", () => {
    it("기본 창은 [08:00, 20:00] — 프리·애프터마켓 포함, 20:00 이후 제외", () => {
        const g = detectGrid(
            [flat("08:20:00", 11000, 200000), flat("09:01:00", 10500, 200000), flat("16:30:00", 12000, 200000), flat("20:10:00", 13000, 200000)], px(),
        );
        // 16:30(애프터마켓)이 신고가로 수록되고, 20:10 은 창 밖이라 12,000 이 그날 최고가로 남는다.
        expect(g?.newHighs.map((h) => h.min)).toEqual([8 * 60 + 20, 16 * 60 + 30]);
    });

    it("창 축소 시 창 밖 고가가 채움봉으로 새어들지 않는다(필터가 densify 앞)", () => {
        const g = detectGrid(
            [flat("08:20:00", 11000, 200000), flat("09:01:00", 10500, 200000)], px(),
            { sessionStartMin: 9 * 60 },
        );
        // 08:20 의 11,000 이 09:00 채움봉으로 남으면 09:01(10,500)이 신고가가 못 된다 — 그 함정의 회귀선.
        expect(g?.newHighs.map((h) => h.min)).toEqual([9 * 60 + 1]);
    });
});

describe("detectGrid — 기준선 첫 터치", () => {
    it("미터치 — touch null 이면서 격자는 정상 성립", () => {
        const g = detectGrid([flat("09:00:00", 10000, 200000), flat("09:01:00", 10100, 1)], px(20000));
        expect(g?.touch).toBeNull();
        expect(g?.base).toBe(20000);
        expect(g?.newHighs.length).toBeGreaterThan(0);
    });

    it("기준선이 첫 봉 아래 — 첫 봉이 터치, 볼륨 무관. 터치 봉은 자기 대금·누적을 든다(돌파 창의 시작)", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1)], px(9000));
        expect(g?.touch).toEqual({ min: 540, tv: "10000", cum: "10000" });
    });

    it("장중 터치 — 고가 스침(≥)으로 판정, 누적은 터치 봉 포함", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10500, 10000, 10200, 1)], px(10500));
        expect(g?.touch).toEqual({ min: 541, tv: "10175", cum: "20175" }); // ⌊(10000+10500+10000+10200)/4⌋×1
    });
});

/** 불변식 ①②④⑤⑥ 자동 검사(§2.7) — 피벗 계열 전 fixture 가 이걸 지난다. */
const chk = (g: PointGrid | null | undefined): PointGrid => {
    expect(g).not.toBeNull();
    expect(checkGridInvariants(g!).violations).toEqual([]);
    return g!;
};

describe("detectGrid — 피벗(양방향 zigzag 경로 뷰)", () => {
    it("2% 경계 — 정확히 임계면 확정(≤), 1원 모자라면 미확정(꼬리도 없음 — dir=none)", () => {
        const confirmed = chk(detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9800, 1)], px()));
        expect(confirmed.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9800, null], // 꼬리(미확정 저점)
        ]);
        const not = chk(detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9801, 1)], px()));
        expect(not.pivots).toEqual([]);
    });

    it("(a) 상승→−2%→+2% 교대 기본형 — 선행 저점·확정 고점·확정 저점·꼬리 고점이 한 줄에 선다", () => {
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10210, 1), flat("09:02:00", 10005, 1), flat("09:03:00", 10420, 1), flat("09:04:00", 10215, 1)], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["low", 540, 10000, 541], // 선행 저점 — +2.1% 갱신 봉(09:01)이 확정
            ["high", 541, 10210, 542],
            ["low", 542, 10005, 543],
            ["high", 543, 10420, null], // 꼬리(09:04 는 −2% 터치 미달: 10215 > 10420×0.98=10211.6)
        ]);
    });

    it("(b) 개장 완만 눌림(−2% 미만) 후 반등 — 선행 저점이 첫 항목이 된다", () => {
        const g = chk(detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9850, 1), flat("09:02:00", 10050, 1)], px()));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["low", 541, 9850, 542],
            ["high", 542, 10050, null],
        ]);
    });

    it("(c) 무사건 — 세션 내내 ±2% 사건이 없으면 dir=none 으로 끝나 피벗 0(꼬리도 없음)", () => {
        const g = chk(detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1)], px()));
        expect(g.pivots).toEqual([]);
    });

    it("장대 양봉이 최고가를 갱신해도 자기 저가로는 확정 못 한다 — 선행 저점 + 꼬리 고점만 남는다", () => {
        // v8 은 피벗 0 이었다 — v9 경로 뷰는 선행 저점(+2.1% 갱신이 확정)과 미확정 꼬리를 싣는다.
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10210, 1), mc("09:02:00", 10210, 10450, 10241, 10300, 1)], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["low", 540, 10000, 541],
            ["high", 542, 10450, null], // 자기 저가 10,241 로 자기 고가를 확정하지 않는다(갱신 승리·자기 봉 금지)
        ]);
    });

    it("종일 단조 상승 — 선행 저점 + 꼬리 고점(v8 의 '피벗 0' 개정)", () => {
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1), flat("09:02:00", 10210, 1), flat("09:03:00", 10400, 1)], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["low", 540, 10000, 542], // +2% 도달 봉(09:02)이 확정
            ["high", 543, 10400, null],
        ]);
    });

    it("(f) 동봉 터치+상향 '세션' 갱신은 갱신이 이긴다 — 옛 고점은 소멸하고 새 고점이 확정된다", () => {
        // 09:01 봉이 저가 9,790(≤ 10000×0.98 터치)과 고가 10,210(> 10000 세션 갱신)을 동시에 들고 온다 —
        // renew 봉이라 고가 우선: 09:00 고점(10,000)은 확정 없이 소멸, 09:02 터치가 10,210 을 확정.
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 1), mc("09:01:00", 9900, 10210, 9790, 10200, 1), flat("09:02:00", 10005, 1)], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 541, 10210],
            ["low", 542, 10005],
        ]);
    });

    it("터치 봉(확정 봉)이 그 구간의 저점이 될 수 있다", () => {
        const g = chk(detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10000, 9790, 9800, 1)], px()));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9790, null],
        ]);
    });

    it("(h) 넓은 첫 봉 — 자기 저가로 자기 고가를 확정 못 하고, 그 저가는 저점 후보에서도 빠진다", () => {
        // 09:00 봉(고 10000·저 9600): 자기 봉이라 확정도 저점도 못 만든다. 09:01(9795 ≤ 9800)이 확정하고
        // 자기 저가 9,795 가 꼬리 저점 — 9,600 은 어디에도 안 실린다(봉 내부 순서 증명 불가).
        const g = chk(detectGrid([mc("09:00:00", 9800, 10000, 9600, 9700, 1), flat("09:01:00", 9795, 1)], px()));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9795, null],
        ]);
    });

    it("(f') dir=up 세션 갱신 봉 — 자기 저가가 임계 아래여도 터치 검사 생략, 확정은 다음 봉이 한다", () => {
        // 09:02 봉이 고점 10,600 갱신 + 자기 저가 10,380(≤10600×0.98=10388) — 갱신 승리로 검사 생략,
        // 09:03 봉 저가 10,380 이 확정(confirmedMin=543≠542).
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                mc("09:02:00", 10210, 10600, 10380, 10590, 1),
                flat("09:03:00", 10380, 1),
            ], px(),
        ));
        const high = g.pivots.find((p) => p.kind === "high");
        expect(high).toMatchObject({ min: 542, price: 10600, confirmedMin: 543 });
    });

    it("저점도 확정 시각을 든다(v9) — +2% 반등 봉이 소급 확정, 꼬리가 아니면 null 이 아니다", () => {
        // 09:02 가 구간 최저(9,600)를 만들고 09:03(9795 ≥ 9600×1.02=9792)이 반등 확정한다.
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9790, 9990, 9600, 9620, 1),
                flat("09:03:00", 9795, 1),
            ], px(),
        ));
        const low = g.pivots.find((p) => p.kind === "low");
        expect(low).toMatchObject({ min: 542, price: 9600, confirmedMin: 543 });
    });

    it("(k) 구조 불변식 — kind 교대·min 강한 단조·미확정은 꼬리 1개(선행 저점 허용)", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                flat("09:02:00", 10005, 1),
                flat("09:03:00", 10450, 1),
                flat("09:04:00", 10240, 1),
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min])).toEqual([
            ["low", 540], // 선행 저점(+2.1% 갱신 봉 09:01 이 확정)
            ["high", 541],
            ["low", 542],
            ["high", 543],
            ["low", 544],
        ]);
        const mins = g.pivots.map((p) => p.min);
        expect(mins.every((m, i) => i === 0 || m > mins[i - 1])).toBe(true);
        expect(g.pivots.filter((p) => p.confirmedMin === null)).toHaveLength(1); // 꼬리 저점뿐
    });

    it("넓은 세션 최고가 봉(자기 봉에 깊은 저가) — 고가는 피벗이 못 되고 선행 저점이 그 봉을 대신한다(클래스 ① 일반형)", () => {
        // 09:00 봉(고 11200·저 10800): 자기 봉 확정 금지로 11,200 은 후보로만 남는데, 09:01(11160 ≥
        // 10800×1.02=11016)이 선행 저점(10,800)을 먼저 확정해 스윙이 09:01 에서 시작한다 — 11,200 은
        // 영영 피벗이 못 되고(sessionHigh 필드가 유일한 흔적) 첫 레벨은 11,160 이 된다.
        // v8 은 11,200 을 첫 피벗으로 뒀다 — §2.6 클래스 ① 의 일반형(가격 차가 0.04% 띠를 넘을 수 있다).
        const g = chk(detectGrid(
            [
                mc("09:00:00", 10800, 11200, 10800, 11050, 1),
                flat("09:01:00", 11160, 1),
                flat("09:02:00", 10930, 1),
                flat("09:03:00", 11250, 1),
                flat("09:04:00", 11020, 1),
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["low", 540, 10800],
            ["high", 541, 11160], // 국소 스윙 최고 — 11,200(세션 최고가) 아님
            ["low", 542, 10930],
            ["high", 543, 11250],
            ["low", 544, 11020],
        ]);
        // 마디 뷰: 첫 레벨 = 11,160(확정·이전 고점 피벗 없음), 둘째 = 11,250. 저점은 v8 과 동일.
        expect(levelViewOf(g).map((p) => [p.high.price, p.low.price])).toEqual([
            [11160, 10930],
            [11250, 11020],
        ]);
        expect(checkGridInvariants(g).sessionHighAbovePivots).toBe(false); // 11,250 이 최종 세션 최고가라 ⑤ 등식 성립
        expect(g.sessionHigh).toEqual({ min: 543, price: 11250 });
    });

    it("(d) dir=down 세션 갱신 봉 — 저점 확정(고가 우선), 그 봉의 더 낮은 저가는 버려진다", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9750, 10100, 9700, 10050, 1), // renew(10100>10000) + 자기 저가 9700 < runLow 9800
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9800, 542], // 9,700 이 아니라 9,800 — 갱신 봉의 저가는 버림(고가 우선)
            ["high", 542, 10100, null],
        ]);
    });

    it("(e) dir=down 비갱신 넓은 봉 — 저가 갱신이 저점 확정보다 먼저다(저가 우선, +2% 조건 무시)", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9800, 9999, 9750, 9900, 1), // 비갱신: 고가 9999 ≥ 9800×1.02=9996 이지만 저가 9750 < 9800 이 먼저
                flat("09:03:00", 9950, 1), // 9950 ≥ 9750×1.02=9945 → 저점 확정
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 542, 9750, 543], // 9,800(09:01)이 아니라 09:02 의 9,750 — 저가 갱신 우선
            ["high", 543, 9950, null],
        ]);
    });

    it("(g) dir=up 국소 갱신+터치 동봉 — 비갱신 봉이라 터치가 이긴다(저가 우선), 그 봉의 더 높은 고가는 버려진다", () => {
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1), // 고점 10,000 확정
                flat("09:02:00", 9998, 1), // +2.02% — 저점 9,800 확정, 상승 스윙 시작(runHigh 9,998 < 세션 최고가)
                mc("09:03:00", 9998, 9999, 9798, 9800, 1), // 국소 갱신(9999>9998, 비갱신)+터치(9798≤9998×0.98=9798.04) 동봉
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9800, 542],
            ["high", 542, 9998, 543], // 9,999 가 아니라 9,998 — 확정 봉 자신의 더 높은 고가는 버림(§2.7 ③ 열린 구간)
            ["low", 543, 9798, null],
        ]);
    });

    it("cum — 피벗은 세션 첫 봉부터 자기 봉까지 포함 누적, 마디 뷰 leg 는 레벨 쌍의 차로 재현된다", () => {
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 10210, 100000), mc("09:02:00", 10210, 10210, 10005, 10005, 100000)], px(),
        ));
        // v9: 선행 저점(09:00, +2.1% 갱신이 확정) + 고점(09:01) + 꼬리 저점(09:02). 첫 레벨은 cross null.
        expect(g.pivots).toHaveLength(3);
        expect(g.pivots[0]).toMatchObject({ kind: "low", min: 540, cum: "1000000000", cross: null, confirmedMin: 541 });
        expect(g.pivots[1]).toMatchObject({ kind: "high", min: 541, cum: "2021000000", cross: null });
        expect(g.pivots[2]).toMatchObject({ kind: "low", min: 542, confirmedMin: null, cum: "3031700000", cross: null });
        expect(legAmountOf(g, 1)).toBe("1021000000"); // 피벗 색인 판 — 직전 피벗(선행 저점) 다음 봉부터
        const pairs = levelViewOf(g);
        expect(pairs).toHaveLength(1);
        expect(legAmountOfPair(pairs[0], null)).toBe("2021000000"); // v8 legAmount(첫 고점 = 세션 첫 봉부터) 재현
        expect(renewalAmountOf(g, 1)).toBeNull();
    });

    it("cross — 갱신 봉이 곧 고점 봉이면 크로싱 = 고점 봉, renewal 창은 그 한 봉 몫(= leg, 등호 경계)", () => {
        // H1(10000) 확정 후 09:02 한 봉이 크로싱이자 새 고점(10,210) — renewal = 그 봉 대금 = leg.
        const g = chk(detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 9800, 100000), flat("09:02:00", 10210, 100000), flat("09:03:00", 10005, 100000)], px(),
        ));
        const h2 = g?.pivots[2];
        expect(h2).toMatchObject({ kind: "high", min: 542, price: 10210, cum: "3001000000", cross: { min: 542, tv: "1021000000", cum: "3001000000" } });
        expect(legAmountOf(g!, 2)).toBe("1021000000");
        expect(renewalAmountOf(g!, 2)).toBe("1021000000");
    });

    it("cross — 직전 고점 가격을 처음 넘은 봉(저대금이어도), renewal 창 = 크로싱~고점(< leg), 첫 고점·저점은 null", () => {
        // H1(10000) 확정 → 09:02(9900, 크로싱 전 눌림) → 09:03(10150, 크로싱=고점) → 09:04 터치 확정.
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 100000),
                flat("09:01:00", 9800, 100000),
                flat("09:02:00", 9900, 100000),
                flat("09:03:00", 10150, 100000),
                flat("09:04:00", 9947, 100000),
            ], px(),
        ));
        expect(g?.pivots.map((p) => [p.kind, p.min, p.cross?.min ?? null])).toEqual([
            ["high", 540, null], // 첫 확정 고점 — 전고점 없음
            ["low", 541, null],
            ["high", 543, 543], // 크로싱 봉 = 09:03(고점 봉 자신)
            ["low", 544, null],
        ]);
        expect(renewalAmountOf(g!, 2)).toBe("1015000000"); // 크로싱 봉 한 봉 몫 — 눌림 조각(09:02)은 leg−renewal 파생
        expect(legAmountOf(g!, 2)).toBe("2005000000"); // 09:02 + 09:03
        expect(BigInt(renewalAmountOf(g!, 2)!) < BigInt(legAmountOf(g!, 2))).toBe(true);
    });

    it("결측 분의 채움봉(저가=직전 종가)이 터치를 확정하고 저점 피벗이 될 수 있다 — 거래 없음 ≠ 가격 없음", () => {
        // 09:00 봉(고 10000·종가 9790 ≤ 9800): 자기 봉이라 확정 불가. 09:01 결측 → 채움봉(9790 평탄)의
        // 저가가 확정(confirmedMin=541). densify 를 검출기 밖으로 옮기면 이 확정이 통째로 사라진다 — 회귀선.
        const g = chk(detectGrid([mc("09:00:00", 9900, 10000, 9790, 9790, 1), flat("09:02:00", 10100, 1)], px()));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9790, 542], // 채움봉이 저점 피벗 — 09:02 갱신 봉(+2% 이상)이 소급 확정
            ["high", 542, 10100, null],
        ]);
    });

    it("저점 구간은 크로싱에서 끝난다 — 크로싱 뒤 넓은 갱신 봉의 깊은 저가는 저점이 못 되고 renewal ≤ leg 보존", () => {
        // H1(10000) 확정 → 09:03 크로싱(10150) → 09:04 넓은 갱신 봉(고 10400·저 9500: 갱신 승리로 터치
        // 생략, 저가는 구간 밖) → 09:05 터치가 10400 확정. 저점은 구간 (H1, 크로싱) 안의 9,800.
        // "인접 확정 고점 사이 최저" 단축이 동치가 아닌 바로 그 반례 — 9,500 이 저점이 되면 저점이 크로싱
        // 뒤로 가 renewalAmount > legAmount 로 뒤집힌다(v3 diff 실측 1건의 원인). v9 에선 갱신 봉의
        // 고가 우선(저점 확정 시 그 봉의 더 낮은 저가 버림)이 같은 결과를 준다.
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 100000),
                flat("09:01:00", 9800, 100000),
                flat("09:02:00", 9900, 100000),
                flat("09:03:00", 10150, 100000),
                mc("09:04:00", 10150, 10400, 9500, 10300, 100000),
                flat("09:05:00", 10192, 100000),
            ], px(),
        ));
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 10000],
            ["low", 541, 9800],
            ["high", 544, 10400],
            ["low", 545, 10192],
        ]);
        // 크로싱 봉(09:03) **포함** ~ 고점 봉(09:04)까지가 renewal — 경계가 한 봉만 밀려도 값이 달라진다.
        // 크로싱 봉은 저대금(floor 미만)이라 신고가 목록엔 없다 — 피벗의 cross 승격이 유일한 기록.
        expect(g?.pivots[2].cross?.min).toBe(543);
        expect(g?.newHighs.map((e) => e.min)).not.toContain(543);
        expect(renewalAmountOf(g!, 2)).toBe("2023700000"); // 10150×1e5 + ⌊(10150+10400+9500+10300)/4⌋×1e5
        expect(legAmountOf(g!, 2)).toBe("3013700000"); // 09:02(9900)+09:03+09:04
        expect(BigInt(renewalAmountOf(g!, 2)!) <= BigInt(legAmountOf(g!, 2))).toBe(true);
    });

    it("크로싱(갱신) 봉의 저가는 저점이 못 된다 — 고가 우선(봉 내부 순서 증명 불가)", () => {
        // 09:02 갱신 봉(고 10150·저 9700)이 구간 최저를 겸해도 저점은 09:01(9800)이다.
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9850, 10150, 9700, 10100, 1),
                flat("09:03:00", 10400, 1),
                flat("09:04:00", 10192, 1),
            ], px(),
        ));
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 10000],
            ["low", 541, 9800],
            ["high", 543, 10400],
            ["low", 544, 10192],
        ]);
    });

    it("(c') 갱신 봉이 저점을 확정하고 자신은 미확정 꼬리 고점으로 남는다 — 갱신 봉의 깊은 저가는 버려진다", () => {
        // H1 확정 후 09:02 갱신 봉(고 10100·저 9750): 고가 우선으로 저점 9,800 확정(9,750 버림), 터치가
        // 안 와 10,100 은 꼬리(confirmedMin null). v8 은 소멸시켰다 — v9 는 꼬리로 싣는다.
        const g = chk(detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9900, 10100, 9750, 10050, 1),
                flat("09:03:00", 9990, 1),
            ], px(),
        ));
        expect(g.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9800, 542],
            ["high", 542, 10100, null],
        ]);
    });
});
