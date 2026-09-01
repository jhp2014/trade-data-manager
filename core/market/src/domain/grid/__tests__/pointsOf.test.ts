// pointsOf — 격자 리터럴로 읽기 층 Point 판정을 못 박는다(분봉·DB 0 — 격자 스키마 충분성의 증거).
import { describe, expect, it } from "vitest";
import type { GridNewHigh, GridPivot, PointGrid } from "../grid.js";
import { DEFAULT_POINT_DEFINITION, pointsOf } from "../points.js";

// 양봉/음봉은 OHLC 파생(close > open)이라 픽스처가 몸통 방향으로 표현한다.
const nh = (min: number, high: number, eok: number, bull = true): GridNewHigh => ({
    min,
    open: bull ? high - 100 : high,
    high,
    low: high - 150,
    close: bull ? high : high - 100,
    tv: String(eok * 100_000_000),
});
const hi = (min: number, price: number, confirmedMin: number | null): GridPivot => ({ kind: "high", min, price, confirmedMin, legAmount: "0", renewalAmount: null });
// 재정식화 격자의 저점: confirmedMin·renewalAmount 항상 null — 헬퍼가 규칙을 증언한다.
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: null, legAmount: "0", renewalAmount: null });
const grid = (partial: Partial<PointGrid>): PointGrid => ({ base: 10000, touchMin: 550, pivots: [], newHighs: [], prevBase: null, ...partial });

describe("pointsOf", () => {
    it("기준선 미터치(또는 기준선 없음) → Point 없음", () => {
        expect(pointsOf(grid({ touchMin: null, newHighs: [nh(560, 10050, 60)] }))).toEqual([]);
        expect(pointsOf(grid({ base: null, newHighs: [nh(560, 10050, 60)] }))).toEqual([]);
    });

    it("기본 흐름 — 기준선 돌파(50억 게이트) + 마디 갱신(30억 게이트)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toMatchObject({ kind: "breakout", ordinal: 0, min: 560, levelPrice: 10000 });
        expect(pts[1]).toMatchObject({ kind: "renewal", ordinal: 1, min: 600, levelPrice: 10300 });
    });

    it("게이트 상향 시 그 레벨의 Point 는 같은 레벨의 뒤 캔들로 **이동**한다", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35), nh(620, 10400, 60)],
        });
        const base = pointsOf(g).filter((p) => p.kind === "renewal");
        expect(base).toHaveLength(1);
        expect(base[0].min).toBe(600);
        const raised = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, renewalGateEok: 50 }).filter((p) => p.kind === "renewal");
        expect(raised).toHaveLength(1);
        expect(raised[0].min).toBe(620);
    });

    it("제외 창 — 기본은 꺼짐(프리마켓도 Point 자격), 올리면 다음 자격 캔들로 이동", () => {
        const g = grid({ touchMin: 500, newHighs: [nh(505, 10100, 60), nh(560, 10150, 60)] });
        expect(pointsOf(g)[0]).toMatchObject({ kind: "breakout", min: 505 }); // 08:25 프리마켓 캔들이 그대로 Point
        const excluded = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, excludeUptoMin: 9 * 60 + 5 });
        expect(excluded[0]).toMatchObject({ kind: "breakout", min: 560 });
    });

    it("음봉은 게이트를 넘어도 Point 가 아니다(기본 bullOnly)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60, false), nh(570, 10100, 60)] });
        expect(pointsOf(g)[0]).toMatchObject({ kind: "breakout", min: 570 });
    });

    it("bullOnly 를 끄면 음봉도 Point 자격이 있다(읽기 노브 — 재굽기 없이 뒤집힌다)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60, false), nh(570, 10100, 60)] });
        expect(pointsOf(g, { ...DEFAULT_POINT_DEFINITION, bullOnly: false })[0]).toMatchObject({ kind: "breakout", min: 560 });
    });

    it("한 캔들이 기준선+마디를 한 번에 넘으면 Point 는 하나 — **높은 레벨 몫**(갈리면 재돌파)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(600, 10500, 60)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "renewal", min: 600, levelPrice: 10300, levelIdx: 1, levelMin: 575 });
    });

    it("저대금 터치가 고가를 만들면 이후 크로싱은 재돌파다(재돌파 게이트 30억이 걸린다)", () => {
        // 09:10 기준선 스침 25억(floor 위·게이트 아래) → 마디 10,050 확정 → 09:30 40억 캔들.
        // 옛 규칙이면 기준선 몫(게이트 50억 미달 → Point 없음), 새 규칙은 전고점 재돌파(게이트 30억 통과).
        const g = grid({
            pivots: [hi(550, 10050, 560), lo(565, 9800)],
            newHighs: [nh(550, 10050, 25), nh(570, 10100, 40)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "renewal", min: 570, levelPrice: 10050, levelIdx: 1 });
    });

    it("고가를 못 만든 채 그대로 오르면 여전히 돌파다(기준선 게이트 50억)", () => {
        // 같은 저대금 터치지만 −2% 눌림이 없어 마디가 안 선다 → 레벨은 기준선 하나.
        const g = grid({ newHighs: [nh(550, 10050, 25), nh(570, 10100, 40), nh(590, 10200, 60)] });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "breakout", min: 590, levelPrice: 10000, levelIdx: 0 });
    });

    it("레벨을 선점당한 뒤 캔들은 Point 를 잃는다 — 게이트 비대칭이 만들던 옛 유령 돌파의 소멸", () => {
        // 옛 규칙: 10,100(35억)은 레벨1 몫으로 renewal, 10,200(60억)은 레벨0(50억) 몫으로 breakout = 2건
        //          (뒤 봉이 돌파, 앞 봉이 재돌파 — 시간 역전 라벨). 새 규칙: 둘 다 레벨1 귀속이라 뒤 봉은
        //          이미 선점된 레벨이라 탈락 = 1건. 전 캐시 실측 소멸 284건이 전부 이 형태다.
        const g = grid({
            pivots: [hi(550, 10050, 560), lo(565, 9800)],
            newHighs: [nh(550, 10050, 25), nh(570, 10100, 35), nh(600, 10200, 60)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "renewal", min: 570, levelIdx: 1 });
    });

    it("레벨당 Point 는 최대 하나 — 같은 레벨 구간의 뒤 캔들이 또 서지 않는다", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60), nh(570, 10100, 60), nh(580, 10150, 60)] });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts.filter((p) => p.levelIdx === 0)).toHaveLength(1);
    });

    it("귀속 레벨의 게이트에 미달해도 낮은 레벨로 내려가지 않는다", () => {
        // 10,350 캔들은 마디(10,300) 몫 — 재돌파 게이트를 50억으로 올리면 35억은 탈락이고,
        // 기준선(50억)으로 강등되지도 않는다. 같은 레벨의 다음 자격 캔들(60억)이 대신 선다.
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(600, 10350, 35), nh(620, 10400, 60)],
        });
        const raised = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, renewalGateEok: 50 });
        expect(raised).toHaveLength(1);
        expect(raised[0]).toMatchObject({ kind: "renewal", min: 620, levelIdx: 1 });
    });

    it("하락 중 낮은 고점은 레벨이 아니다(러닝 최고가였던 확정 고점만)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(590, 10100), hi(600, 10200, 610)],
            newHighs: [nh(560, 10050, 60), nh(620, 10250, 60)],
        });
        // 10,200 마디는 러닝 최고가(10,300) 아래라 레벨이 아니고, 10,250 캔들은 아무것도 못 넘는다.
        expect(pointsOf(g)).toHaveLength(1);
    });

    it("미확정 마지막 마디는 넘을 대상이 아니다", () => {
        const g = grid({
            pivots: [hi(575, 10300, null)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        expect(pointsOf(g).filter((p) => p.kind === "renewal")).toHaveLength(0);
    });

    it("mergeRisePct — 잔 마디를 병합하면 그 레벨의 Point 가 다음 유효 레벨로 넘어간다", () => {
        const g = grid({
            pivots: [lo(555, 10150), hi(570, 10250, 580), lo(585, 10180), hi(600, 10600, 610)],
            newHighs: [nh(550, 10050, 60), nh(590, 10280, 35), nh(620, 10700, 35)],
        });
        const loose = pointsOf(g);
        expect(loose.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [590, 10250],
            [620, 10600],
        ]);
        const merged = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, mergeRisePct: 3 });
        // 10,250 마디(저점 10,150 대비 +0.99%)는 병합 — 10,280 캔들은 Point 가 못 되고 레벨은 10,600 뿐.
        expect(merged.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [620, 10600],
        ]);
    });

    it("첫 마디는 선행 저점이 없어 mergeRisePct 병합이 안 걸린다(수용된 편향)", () => {
        // 재정식화 격자엔 첫 확정 고점 이전 선행 저점이 없다 — lastLow 가 null 이라 병합 검사가 스킵.
        const g = grid({
            pivots: [hi(570, 10250, 580)],
            newHighs: [nh(590, 10280, 35)],
        });
        expect(pointsOf(g, { ...DEFAULT_POINT_DEFINITION, mergeRisePct: 99 }).map((p) => p.min)).toEqual([590]);
    });
});
