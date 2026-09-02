// detectGrid — 합성 분봉으로 격자 검출 규칙을 못 박는다(DB 0).
// 특히 "의도된 의미론"들: 수록·게이트가 자기 봉 대금뿐인 것(구제 폐기), 창 필터가 densify 앞인 것,
// 재정식화 피벗(2026-08-31): 확정 고점 = 러닝 최고가 갱신(>) 후 더 높은 고가 전 −2% 터치(≤),
// 동봉 터치+갱신은 갱신 승리, 저점 = 구간 봉 최저(양끝·크로싱 봉 제외, confirmedMin null),
// legAmount + renewalAmount(전고점 돌파 후 추격 대금).
import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "../../candle/model.js";
import { detectGrid, type GridDayPrices } from "../grid.js";

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
        expect(g?.touchMin).toBeNull();
    });
});

describe("detectGrid — 신고가 목록", () => {
    it("갭 시작 — 첫 봉이 러닝 최고가, OHLC 절대가가 그대로 실린다(양봉 여부는 읽기 층 파생)", () => {
        const g = detectGrid([mc("09:00:00", 13000, 13000, 12900, 13000, 200000), flat("09:01:00", 12950, 1), flat("09:02:00", 12900, 1)], px());
        expect(g?.newHighs).toHaveLength(1);
        expect(g?.newHighs[0]).toEqual({ min: 540, open: 13000, high: 13000, low: 12900, close: 13000, tv: "2595000000" });
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
    });

    it("floor 는 20억 이상(경계 포함)", () => {
        const yes = detectGrid([flat("09:00:00", 10000, 200000)], px());
        expect(yes?.newHighs).toHaveLength(1);
        const no = detectGrid([flat("09:00:00", 10000, 199999)], px());
        expect(no?.newHighs).toHaveLength(0);
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
    it("미터치 — touchMin null 이면서 격자는 정상 성립", () => {
        const g = detectGrid([flat("09:00:00", 10000, 200000), flat("09:01:00", 10100, 1)], px(20000));
        expect(g?.touchMin).toBeNull();
        expect(g?.base).toBe(20000);
        expect(g?.newHighs.length).toBeGreaterThan(0);
    });

    it("기준선이 첫 봉 아래 — 첫 봉이 터치, 볼륨 무관", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1)], px(9000));
        expect(g?.touchMin).toBe(540);
    });

    it("장중 터치 — 고가 스침(≥)으로 판정", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10500, 10000, 10200, 1)], px(10500));
        expect(g?.touchMin).toBe(541);
    });
});

describe("detectGrid — 피벗(확정 고점·구간 저점)", () => {
    it("2% 경계 — 정확히 임계면 확정(≤), 1원 모자라면 미확정", () => {
        const confirmed = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9800, 1)], px());
        expect(confirmed?.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9800, null],
        ]);
        const not = detectGrid([flat("09:00:00", 10000, 1), flat("09:01:00", 9801, 1)], px());
        expect(not?.pivots).toEqual([]);
    });

    it("장대 양봉이 최고가를 갱신하면 자기 저가로는 확정 못 한다 — 갱신 승리(자기 봉 확정 금지 내장)", () => {
        // 09:02(3% 양봉)가 고점 10,450 을 갱신 — 자기 저가 10,241(=10450×0.98)은 검사하지 않는다.
        // 뒤 봉이 없어 터치가 영영 없으므로 확정 고점 0 → 피벗 0.
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10210, 1), mc("09:02:00", 10210, 10450, 10241, 10300, 1)], px(),
        );
        expect(g?.pivots).toEqual([]);
    });

    it("종일 단조 상승 — 확정 고점 0 → 피벗 0(무사건 취급)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), flat("09:01:00", 10100, 1), flat("09:02:00", 10210, 1), flat("09:03:00", 10400, 1)], px(),
        );
        expect(g?.pivots).toEqual([]);
    });

    it("동봉 터치+상향 갱신은 갱신이 이긴다 — 옛 고점은 소멸하고 새 고점이 확정된다", () => {
        // 09:01 봉이 저가 9,790(≤ 10000×0.98 터치)과 고가 10,210(> 10000 갱신)을 동시에 들고 온다 —
        // 봉 내부 순서 증명 불가라 갱신 승리: 09:00 고점(10,000)은 확정 없이 소멸, 09:02 터치가 10,210 을 확정.
        const g = detectGrid(
            [flat("09:00:00", 10000, 1), mc("09:01:00", 9900, 10210, 9790, 10200, 1), flat("09:02:00", 10005, 1)], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 541, 10210],
            ["low", 542, 10005],
        ]);
    });

    it("터치 봉(확정 봉)이 그 구간의 저점이 될 수 있다", () => {
        const g = detectGrid([flat("09:00:00", 10000, 1), mc("09:01:00", 10000, 10000, 9790, 9800, 1)], px());
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9790, null],
        ]);
    });

    it("넓은 첫 봉 — 자기 저가로 자기 고가를 확정 못 하고, 그 저가는 저점 후보에서도 빠진다", () => {
        // 09:00 봉(고 10000·저 9600): 자기 봉이라 확정도 저점도 못 만든다. 09:01(9795 ≤ 9800)이 확정하고
        // 자기 저가 9,795 가 꼬리 저점 — 9,600 은 어디에도 안 실린다(봉 내부 순서 증명 불가).
        const g = detectGrid([mc("09:00:00", 9800, 10000, 9600, 9700, 1), flat("09:01:00", 9795, 1)], px());
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9795, null],
        ]);
    });

    it("뒤 봉이 새 최고가를 세우면서 자기 저가가 임계 아래여도 확정은 다음 봉이 한다", () => {
        // 09:02 봉이 고점 10,600 갱신 + 자기 저가 10,380(≤10600×0.98=10388) — 갱신 승리로 검사 생략,
        // 09:03 봉 저가 10,380 이 확정(confirmedMin=543≠542).
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                mc("09:02:00", 10210, 10600, 10380, 10590, 1),
                flat("09:03:00", 10380, 1),
            ], px(),
        );
        const high = g?.pivots.find((p) => p.kind === "high");
        expect(high).toMatchObject({ min: 542, price: 10600, confirmedMin: 543 });
    });

    it("저점엔 확정 개념이 없다 — 구간 봉 최저가 confirmedMin null 로 실린다", () => {
        // 09:02 가 구간 최저(9,600)를 만들고 09:03 에 반등해도 저점에 확정 시각 같은 건 안 붙는다.
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9790, 9990, 9600, 9620, 1),
                flat("09:03:00", 9795, 1),
            ], px(),
        );
        const low = g?.pivots.find((p) => p.kind === "low");
        expect(low).toMatchObject({ min: 542, price: 9600, confirmedMin: null });
    });

    it("구조 불변식 — high 시작·low 끝·교대·짝수 길이, min 강한 단조 증가(같은 분 퇴화 쌍 없음)", () => {
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 10210, 1),
                flat("09:02:00", 10005, 1),
                flat("09:03:00", 10450, 1),
                flat("09:04:00", 10240, 1),
            ], px(),
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

    it("넓은 저점 봉이 세션 최고가를 겸하면 그 고가가 그대로 확정 고점이 된다", () => {
        // 09:00 봉(저 10800·고 11200): 저가는 자기 봉이라 못 쓰지만 고가 11,200 은 러닝 최고가 —
        // 09:02(10930 ≤ 11200×0.98=10976)가 확정한다. 옛 상태기계는 leg 재탐색이 이 고가를 잃고
        // 11,160 을 가짜 레벨로 세웠다(runningMaxOf 패치는 버리기만 했음) — 재정식화는 진짜 레벨을 되살린다.
        const g = detectGrid(
            [
                mc("09:00:00", 10800, 11200, 10800, 11050, 1),
                flat("09:01:00", 11160, 1),
                flat("09:02:00", 10930, 1),
                flat("09:03:00", 11250, 1),
                flat("09:04:00", 11020, 1),
            ], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 11200],
            ["low", 542, 10930],
            ["high", 543, 11250],
            ["low", 544, 11020],
        ]);
    });

    it("legAmount — 첫 피벗은 세션 첫 봉부터, 저점은 자기 구간 몫(포함 경계)", () => {
        const g = detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 10210, 100000), mc("09:02:00", 10210, 10210, 10005, 10005, 100000)], px(),
        );
        // 고점(09:01) leg = 09:00+09:01 대금, 꼬리 저점(09:02) leg = 자기 봉 대금.
        expect(g?.pivots).toHaveLength(2);
        expect(g?.pivots[0]).toMatchObject({ kind: "high", min: 541, legAmount: "2021000000", renewalAmount: null });
        expect(g?.pivots[1]).toMatchObject({ kind: "low", min: 542, confirmedMin: null, legAmount: "1010700000", renewalAmount: null });
    });

    it("renewalAmount — 갱신 봉이 곧 고점 봉이면 그 한 봉 몫(= legAmount, 등호 경계)", () => {
        // H1(10000) 확정 후 09:02 한 봉이 크로싱이자 새 고점(10,210) — renewal = 그 봉 대금 = leg.
        const g = detectGrid(
            [flat("09:00:00", 10000, 100000), flat("09:01:00", 9800, 100000), flat("09:02:00", 10210, 100000), flat("09:03:00", 10005, 100000)], px(),
        );
        const h2 = g?.pivots[2];
        expect(h2).toMatchObject({ kind: "high", min: 542, price: 10210, legAmount: "1021000000", renewalAmount: "1021000000" });
    });

    it("renewalAmount — 크로싱 봉부터 고점 봉까지 구간 합(< legAmount), 첫 고점·저점은 null", () => {
        // H1(10000) 확정 → 09:02(9900, 크로싱 전 눌림) → 09:03(10150, 크로싱=고점) → 09:04 터치 확정.
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 100000),
                flat("09:01:00", 9800, 100000),
                flat("09:02:00", 9900, 100000),
                flat("09:03:00", 10150, 100000),
                flat("09:04:00", 9947, 100000),
            ], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.renewalAmount])).toEqual([
            ["high", 540, null], // 첫 확정 고점 — 전고점 없음
            ["low", 541, null],
            ["high", 543, "1015000000"], // 크로싱 봉(09:03) 한 봉 몫 — 눌림 조각(09:02)은 leg−renewal 파생
            ["low", 544, null],
        ]);
        const h2 = g?.pivots[2];
        expect(BigInt(h2!.renewalAmount!) < BigInt(h2!.legAmount)).toBe(true);
        expect(h2?.legAmount).toBe("2005000000"); // 09:02 + 09:03
    });

    it("결측 분의 채움봉(저가=직전 종가)이 터치를 확정하고 구간 저점이 될 수 있다 — 거래 없음 ≠ 가격 없음", () => {
        // 09:00 봉(고 10000·종가 9790 ≤ 9800): 자기 봉이라 확정 불가. 09:01 결측 → 채움봉(9790 평탄)의
        // 저가가 확정(confirmedMin=541). densify 를 검출기 밖으로 옮기면 이 확정이 통째로 사라진다 — 회귀선.
        const g = detectGrid([mc("09:00:00", 9900, 10000, 9790, 9790, 1), flat("09:02:00", 10100, 1)], px());
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price, p.confirmedMin])).toEqual([
            ["high", 540, 10000, 541],
            ["low", 541, 9790, null], // 채움봉이 구간 (고점 봉, 크로싱 봉) 의 유일한 봉 — 구간 저점도 겸한다
        ]);
    });

    it("저점 구간은 크로싱에서 끝난다 — 크로싱 뒤 넓은 갱신 봉의 깊은 저가는 저점이 못 되고 renewal ≤ leg 보존", () => {
        // H1(10000) 확정 → 09:03 크로싱(10150) → 09:04 넓은 갱신 봉(고 10400·저 9500: 갱신 승리로 터치
        // 생략, 저가는 구간 밖) → 09:05 터치가 10400 확정. 저점은 구간 (H1, 크로싱) 안의 9,800.
        // "인접 확정 고점 사이 최저" 단축이 동치가 아닌 바로 그 반례 — 9,500 이 저점이 되면 저점이 크로싱
        // 뒤로 가 renewalAmount > legAmount 로 뒤집힌다(v3 diff 실측 1건의 원인).
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 100000),
                flat("09:01:00", 9800, 100000),
                flat("09:02:00", 9900, 100000),
                flat("09:03:00", 10150, 100000),
                mc("09:04:00", 10150, 10400, 9500, 10300, 100000),
                flat("09:05:00", 10192, 100000),
            ], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 10000],
            ["low", 541, 9800],
            ["high", 544, 10400],
            ["low", 545, 10192],
        ]);
        const h2 = g?.pivots[2];
        // 크로싱 봉(09:03) **포함** ~ 고점 봉(09:04)까지가 renewal — 경계가 한 봉만 밀려도 값이 달라진다.
        expect(h2?.renewalAmount).toBe("2023700000"); // 10150×1e5 + ⌊(10150+10400+9500+10300)/4⌋×1e5
        expect(h2?.legAmount).toBe("3013700000"); // 09:02(9900)+09:03+09:04
        expect(BigInt(h2!.renewalAmount!) <= BigInt(h2!.legAmount)).toBe(true);
    });

    it("크로싱 봉의 저가는 구간 저점 후보에서 빠진다 — 봉 내부(크로싱 전후) 순서 증명 불가", () => {
        // 09:02 크로싱 봉(고 10150·저 9700)이 구간 최저를 겸해도 저점은 09:01(9800)이다.
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9850, 10150, 9700, 10100, 1),
                flat("09:03:00", 10400, 1),
                flat("09:04:00", 10192, 1),
            ], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 10000],
            ["low", 541, 9800],
            ["high", 543, 10400],
            ["low", 544, 10192],
        ]);
    });

    it("꼬리 구간에서도 크로싱 봉(소멸 후보의 것) 저가는 제외된다", () => {
        // H1 확정 후 09:02 가 크로싱(고 10100·저 9750)했지만 터치가 안 와 소멸 — 꼬리 저점은 9,800.
        const g = detectGrid(
            [
                flat("09:00:00", 10000, 1),
                flat("09:01:00", 9800, 1),
                mc("09:02:00", 9900, 10100, 9750, 10050, 1),
                flat("09:03:00", 9990, 1),
            ], px(),
        );
        expect(g?.pivots.map((p) => [p.kind, p.min, p.price])).toEqual([
            ["high", 540, 10000],
            ["low", 541, 9800],
        ]);
    });
});
