// pointsOf — 격자 리터럴로 읽기 층 Point 판정을 못 박는다(분봉·DB 0 — 격자 스키마 충분성의 증거).
import { describe, expect, it } from "vitest";
import type { GridNewHigh, GridPivot, PointGrid } from "../grid.js";
import { DEFAULT_POINT_DEFINITION, levelMaxTvOf, pointsOf, type PointDefinition } from "../points.js";

/** v8 동치 모드(근접 0 — 정확 돌파만). 기존 기대값 전부의 회귀선(§10.5) — 밴드(0.5)는 전용 describe 몫. */
const DEF0: PointDefinition = { ...DEFAULT_POINT_DEFINITION, approachPct: 0 };

// 양봉/음봉은 OHLC 파생(close > open)이라 픽스처가 몸통 방향으로 표현한다.
const nh = (min: number, high: number, eok: number, bull = true, maxBefore = 0): GridNewHigh => ({
    min,
    open: bull ? high - 100 : high,
    high,
    low: high - 150,
    close: bull ? high : high - 100,
    tv: String(eok * 100_000_000),
    cum: "0",
    maxBefore, // 기본 0 = 상단 돌파 취급. 밴드 진입 봉은 maxBefore 를 고가 위로 준다(전용 describe).
});
// 판정은 대금 창을 안 보므로 cum 은 자리만 채운다(창 파생은 windows.test 몫). v9 경로 뷰 유효성:
// 레벨(첫 레벨 제외)엔 cross 를, 레벨마다 짝 저점을 채워야 levelViewOf 가 선다(불변식 ④·⑥).
const hi = (min: number, price: number, confirmedMin: number | null, cross: number | null = null): GridPivot => ({
    kind: "high",
    min,
    price,
    confirmedMin,
    cum: "0",
    cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});
const lo = (min: number, price: number, confirmedMin: number | null = null): GridPivot => ({ kind: "low", min, price, confirmedMin, cum: "0", cross: null });
const touch = (min: number) => ({ min, tv: "0", cum: "0" });
const grid = (partial: Partial<PointGrid>): PointGrid => ({ base: 10000, touch: touch(550), pivots: [], newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh: { min: 550, price: 10000 }, ...partial });

describe("pointsOf", () => {
    it("기준선 없음 → Point 없음. 미터치는 더는 게이트가 아니다(touch 게이트 폐지 — 미래 누출)", () => {
        expect(pointsOf(grid({ base: null, newHighs: [nh(560, 10050, 60)] }), DEF0)).toEqual([]);
        // m'=0 에선 기준선 미달 캔들이 레벨을 못 넘어 여전히 [] — 게이트 폐지가 v8 동작을 안 바꾼다.
        expect(pointsOf(grid({ touch: null, newHighs: [nh(560, 9940, 60)] }), DEF0)).toEqual([]);
    });

    it("touch 게이트 폐지 — 접근 캔들이 있으면 그날 터치가 끝내 없어도 돌파 Point(실패 시도가 모수에 남는다)", () => {
        const g = grid({ touch: null, newHighs: [nh(560, 9970, 60, true, 9800)] });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelPrice])).toEqual([[560, "breakout", 10000]]); // 기본 0.5
        expect(pointsOf(g, DEF0)).toEqual([]); // m'=0 불변 — 접근 자체가 후보가 아니다
    });

    it("기본 흐름 — 기준선 돌파(50억 게이트) + 마디 갱신(30억 게이트)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        const pts = pointsOf(g, DEF0);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toMatchObject({ kind: "breakout", ordinal: 0, min: 560, levelPrice: 10000 });
        expect(pts[1]).toMatchObject({ kind: "renewal", ordinal: 1, min: 600, levelPrice: 10300 });
    });

    it("게이트 상향 시 그 레벨의 Point 는 같은 레벨의 뒤 캔들로 **이동**한다", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35), nh(620, 10400, 60)],
        });
        const base = pointsOf(g, DEF0).filter((p) => p.kind === "renewal");
        expect(base).toHaveLength(1);
        expect(base[0].min).toBe(600);
        const raised = pointsOf(g, { ...DEF0, renewalGateEok: 50 }).filter((p) => p.kind === "renewal");
        expect(raised).toHaveLength(1);
        expect(raised[0].min).toBe(620);
    });

    it("제외 창 — 기본은 꺼짐(프리마켓도 Point 자격), 올리면 다음 자격 캔들로 이동", () => {
        const g = grid({ touch: touch(500), newHighs: [nh(505, 10100, 60), nh(560, 10150, 60)] });
        expect(pointsOf(g, DEF0)[0]).toMatchObject({ kind: "breakout", min: 505 }); // 08:25 프리마켓 캔들이 그대로 Point
        const excluded = pointsOf(g, { ...DEF0, excludeUptoMin: 9 * 60 + 5 });
        expect(excluded[0]).toMatchObject({ kind: "breakout", min: 560 });
    });

    it("음봉은 게이트를 넘어도 Point 가 아니다(기본 bullOnly)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60, false), nh(570, 10100, 60)] });
        expect(pointsOf(g, DEF0)[0]).toMatchObject({ kind: "breakout", min: 570 });
    });

    it("bullOnly 를 끄면 음봉도 Point 자격이 있다(읽기 노브 — 재굽기 없이 뒤집힌다)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60, false), nh(570, 10100, 60)] });
        expect(pointsOf(g, { ...DEF0, bullOnly: false })[0]).toMatchObject({ kind: "breakout", min: 560 });
    });

    it("한 캔들이 기준선+마디를 한 번에 넘으면 Point 는 하나 — **높은 레벨 몫**(갈리면 재돌파)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10500, 60)],
        });
        const pts = pointsOf(g, DEF0);
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
        const pts = pointsOf(g, DEF0);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "renewal", min: 570, levelPrice: 10050, levelIdx: 1 });
    });

    it("고가를 못 만든 채 그대로 오르면 여전히 돌파다(기준선 게이트 50억)", () => {
        // 같은 저대금 터치지만 −2% 눌림이 없어 마디가 안 선다 → 레벨은 기준선 하나.
        const g = grid({ newHighs: [nh(550, 10050, 25), nh(570, 10100, 40), nh(590, 10200, 60)] });
        const pts = pointsOf(g, DEF0);
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
        const pts = pointsOf(g, DEF0);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "renewal", min: 570, levelIdx: 1 });
    });

    it("레벨당 Point 는 최대 하나 — 같은 레벨 구간의 뒤 캔들이 또 서지 않는다", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60), nh(570, 10100, 60), nh(580, 10150, 60)] });
        const pts = pointsOf(g, DEF0);
        expect(pts).toHaveLength(1);
        expect(pts.filter((p) => p.levelIdx === 0)).toHaveLength(1);
    });

    it("귀속 레벨의 게이트에 미달해도 낮은 레벨로 내려가지 않는다", () => {
        // 10,350 캔들은 마디(10,300) 몫 — 재돌파 게이트를 50억으로 올리면 35억은 탈락이고,
        // 기준선(50억)으로 강등되지도 않는다. 같은 레벨의 다음 자격 캔들(60억)이 대신 선다.
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10350, 35), nh(620, 10400, 60)],
        });
        const raised = pointsOf(g, { ...DEF0, renewalGateEok: 50 });
        expect(raised).toHaveLength(1);
        expect(raised[0]).toMatchObject({ kind: "renewal", min: 620, levelIdx: 1 });
    });

    it("하락 중 낮은 고점은 레벨이 아니다(러닝 최고가였던 확정 고점만)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(590, 10100), hi(600, 10200, 610)],
            newHighs: [nh(560, 10050, 60), nh(620, 10250, 60)],
        });
        // 10,200 마디는 러닝 최고가(10,300) 아래라 레벨이 아니고, 10,250 캔들은 아무것도 못 넘는다.
        expect(pointsOf(g, DEF0)).toHaveLength(1);
    });

    it("미확정 마지막 마디는 넘을 대상이 아니다", () => {
        const g = grid({
            pivots: [hi(575, 10300, null)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        expect(pointsOf(g, DEF0).filter((p) => p.kind === "renewal")).toHaveLength(0);
    });

    it("mergeRisePct — 잔 마디를 병합하면 그 마디를 넘은 캔들의 귀속이 아래 레벨로 내려가 선점/탈락이 갈린다", () => {
        // 레벨 3개: 10,250 / 10,280(직전 레벨 쌍 저점 10,180 대비 +0.98% — 병합 대상) / 10,600.
        const g = grid({
            pivots: [
                hi(570, 10250, 578),
                lo(578, 10180, 582),
                hi(600, 10280, 603, 585), // 크로싱 585 = 10,250 을 처음 넘은 봉, 확정 603(캔들 605 이전)
                lo(608, 10150, 612),
                hi(620, 10600, 630, 615),
                lo(630, 10400),
            ],
            // 캔들 시각은 넘는 레벨의 확정 이후여야 귀속된다(미래 누출 차단) — 640 은 10,600 확정(630) 뒤.
            newHighs: [nh(550, 10050, 60), nh(585, 10260, 35), nh(605, 10300, 35), nh(640, 10700, 35)],
        });
        const loose = pointsOf(g, DEF0);
        expect(loose.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [585, 10250],
            [605, 10280],
            [640, 10600],
        ]);
        const merged = pointsOf(g, { ...DEF0, mergeRisePct: 3 });
        // 10,280 마디 병합 — 10,300 캔들의 귀속이 10,250(이미 선점)으로 내려가 탈락, Point 는 셋만.
        expect(merged.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [585, 10250],
            [640, 10600],
        ]);
    });

    it("기준 밴드(0.5 기본) — 접근이 슬롯 1, 워터마크를 넘는 다음 자격 캔들이 슬롯 2 재돌파(마디 대칭)", () => {
        // 마디 10,300 확정 후 M=10,300. 10,270 진입 캔들(maxBefore 10,300): 마디 밴드 통과 →
        // 슬롯 1 renewal — 상단(10,300) 미달이라 슬롯 2 개방(워터마크 10,270). 뒤의 10,350 캔들이
        // 워터마크를 넘어 슬롯 2 재돌파(levelPrice = 워터마크, levelMin = 슬롯 1 봉). ⚠ 옛 "선점당해
        // Point 아님" 규칙(2026-09-05 오전)은 같은 날 저녁 슬롯 2 모델로 뒤집혔다.
        // 근접 0 이면 10,270 은 무사건이고 10,350 이 유일한 Point(v8 동치).
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10270, 60, true, 10300), nh(620, 10350, 60, true, 10300)],
        });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelPrice, p.levelMin])).toEqual([
            [600, "renewal", 10300, 575], // 슬롯 1 — 마디 접근
            [620, "renewal", 10270, 600], // 슬롯 2 — 워터마크(10,270) 재돌파
        ]);
        expect(pointsOf(g, DEF0).map((p) => [p.min, p.kind, p.levelPrice])).toEqual([[620, "renewal", 10300]]);
    });

    it("슬롯 2 — 기준선에서도: 접근(훼손) 뒤 워터마크를 넘는 다음 자격 캔들이 재돌파, 3번째는 없다", () => {
        const g = grid({
            newHighs: [
                nh(560, 9970, 60, true, 9800), // 슬롯 1 — 기준선 접근(9,970 ≥ 9,950), 상단(10,000) 미달 → 슬롯 2 개방
                nh(580, 9990, 40, true, 9970), // 슬롯 2 — 워터마크 9,970 초과, 재돌파 게이트(30) 통과
                nh(600, 10050, 60, true, 9990), // 상단까지 넘었지만 슬롯 소진 — 3번째 Point 없음
            ],
        });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelIdx, p.levelPrice, p.levelMin])).toEqual([
            [560, "breakout", 0, 10000, null],
            [580, "renewal", 0, 9970, 560], // 기준선 슬롯 2 — levelIdx 0 인데 renewal("kind = levelIdx 파생" 정리 폐기)
        ]);
    });

    it("슬롯 2 — 워터마크 이하 사건은 '다시 넘음'이 아니다(밴드 리셋으로 하단이 내려간 자리)", () => {
        const g = grid({
            newHighs: [
                nh(560, 9970, 60, true, 9800), // 슬롯 1 접근, 워터마크 9,970
                nh(580, 9955, 60, true, 9990), // 저대금 갱신(M 9,990) 뒤 밴드 사건 — 워터마크 미달 → 무사건
                nh(600, 9985, 60, true, 9990), // 워터마크 초과 → 슬롯 2 재돌파
            ],
        });
        expect(pointsOf(g).map((p) => [p.min, p.levelPrice])).toEqual([
            [560, 10000],
            [600, 9970],
        ]);
    });

    it("슬롯 1 이 상단을 넘으면 슬롯 2 는 안 열린다 — 전형적 돌파는 오늘과 동일(레벨당 1개)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60), nh(580, 10100, 60, true, 10050)] });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelIdx, p.levelPrice, p.levelMin])).toEqual([
            [560, "breakout", 0, 10000, null],
        ]);
    });

    it("슬롯 2 후보가 게이트 미달이면 다음 자격 캔들로 넘어가고, 워터마크는 슬롯 1 고가로 고정이다", () => {
        const g = grid({
            newHighs: [
                nh(560, 9970, 60, true, 9800), // 슬롯 1 접근 — 워터마크 9,970 고정
                nh(580, 9985, 25, true, 9970), // 워터마크는 넘었지만 재돌파 게이트(30) 미달 — 슬롯 2 불발, 워터마크 안 따라감
                nh(600, 9980, 40, true, 9985), // 9,985(직전 봉 고가)보다 낮아도 워터마크(9,970)만 넘으면 슬롯 2
            ],
        });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelPrice, p.levelMin])).toEqual([
            [560, "breakout", 10000, null],
            [600, "renewal", 9970, 560],
        ]);
    });

    it("슬롯 2 는 귀속이 위 레벨로 점프하면 소멸한다 — 아래로 안 내려가는 커서 원칙", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [
                nh(600, 9970, 60, true, 9800), // 기준선 접근 슬롯 1(슬롯 2 개방)
                nh(620, 10400, 60, true, 9970), // 마디(10,300) 돌파 — 귀속 점프, 기준선 슬롯 2 소멸
                nh(640, 10500, 60, true, 10400), // 마디 레벨 소진 — 추가 없음(워터마크 9,970 을 넘었어도)
            ],
        });
        expect(pointsOf(g).map((p) => [p.min, p.kind, p.levelPrice])).toEqual([
            [600, "breakout", 10000],
            [620, "renewal", 10300],
        ]);
    });

    it("기준 밴드 — 아직 확정 전(미래)의 마디는 관통하지 않는다(미래 누출 차단)", () => {
        // 캔들 628(고가 10,900)의 0.5% 밴드가 636 에 발생·이후 확정될 마디 10,950 을 가격으로는 관통
        // (10,900 > 10,950×0.995=10,895.25)하지만, 그 레벨은 캔들 시점에 존재하지 않았다 — 귀속 금지.
        // m'=0 에선 단조성 정리가 원천 차단하던 것(recon 실측 42차트가 잡은 회귀선).
        const g = grid({
            pivots: [hi(628, 10900, 630), lo(630, 10600, 636), hi(636, 10950, 640, 634), lo(640, 10700)],
            newHighs: [nh(628, 10900, 60, true, 10300)],
        });
        const pts = pointsOf(g); // 기본 0.5
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ min: 628, kind: "breakout", levelIdx: 0 }); // 10,950 이 아니라 기준선 몫
    });

    it("기준 밴드 — 마진의 기준은 러닝 최고가 M 이다: M 이 마디 위면 마디 근접만으론 무사건", () => {
        // 저대금 스침이 M 을 10,400 까지 올린 뒤(마디는 10,300 그대로), 10,330 캔들이 밴드에 실렸어도
        // (그때의 하단이 더 낮았던 탓) 읽기 재구성 10,330 > 10,400×0.995=10,348 은 거짓 — 사건 아님.
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10330, 60, true, 10400)],
        });
        expect(pointsOf(g)).toEqual([]); // 기본 0.5 에서도 무사건 — 옛 규칙에서 갱신이 아니던 것과 같은 판단
    });

    it("첫 마디는 직전 레벨 쌍 저점이 없어 mergeRisePct 병합이 안 걸린다 — 선행 저점은 분모가 아니다(v8 동치)", () => {
        // v9 경로 뷰엔 선행 저점이 있을 수 있지만 병합 분모는 **직전 레벨 쌍의 저점**뿐 — 첫 마디는 스킵.
        const g = grid({
            pivots: [lo(560, 10150, 570), hi(570, 10250, 580), lo(580, 10100)],
            newHighs: [nh(590, 10280, 35)],
        });
        expect(pointsOf(g, { ...DEF0, mergeRisePct: 99 }).map((p) => p.min)).toEqual([590]);
    });
});

describe("levelMaxTvOf — 게이트 분포의 재료(레벨당 최대 자격 대금)", () => {
    const EOK = 100_000_000;

    it("기본 흐름 — 레벨별 max tv + 게이트 분류(기준선 baseline / 마디 renewal)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35), nh(620, 10400, 45)],
        });
        expect(levelMaxTvOf(g, DEF0)).toEqual([
            { levelIdx: 0, gate: "baseline", maxTv: 60 * EOK },
            { levelIdx: 1, gate: "renewal", maxTv: 45 * EOK }, // 35억·45억 중 최댓값
        ]);
    });

    it("자격 캔들이 하나도 귀속 안 된 레벨은 목록에서 빠진다(어떤 게이트에서도 Point 불가)", () => {
        // 유일 캔들이 마디까지 한 번에 넘어 레벨 1 귀속 — 기준선(레벨 0)은 자격 캔들 0개.
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10500, 60)],
        });
        expect(levelMaxTvOf(g, DEF0)).toEqual([{ levelIdx: 1, gate: "renewal", maxTv: 60 * EOK }]);
    });

    it("자격 필터(양봉·제외 창)를 통과 못 한 캔들은 max 에 안 들어간다 — 모수가 그 노브의 함수", () => {
        const g = grid({ newHighs: [nh(560, 10050, 90, false), nh(570, 10100, 60)] });
        expect(levelMaxTvOf(g, DEF0)).toEqual([{ levelIdx: 0, gate: "baseline", maxTv: 60 * EOK }]);
        expect(levelMaxTvOf(g, { ...DEF0, bullOnly: false })).toEqual([{ levelIdx: 0, gate: "baseline", maxTv: 90 * EOK }]);
        // 제외 창은 **양봉** 90억 캔들로 검증한다 — 음봉이면 bullOnly 가 먼저 먹어 assertion 이 트리비얼해진다.
        const g2 = grid({ newHighs: [nh(560, 10050, 90), nh(570, 10100, 60)] });
        expect(levelMaxTvOf(g2, DEF0)).toEqual([{ levelIdx: 0, gate: "baseline", maxTv: 90 * EOK }]);
        expect(levelMaxTvOf(g2, { ...DEF0, excludeUptoMin: 565 })).toEqual([{ levelIdx: 0, gate: "baseline", maxTv: 60 * EOK }]);
    });

    it("게이트 불변 — 게이트만 다른 정의에서 산출이 동일하다(타입이 못 보게 하지만 런타임 회귀선)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        expect(levelMaxTvOf(g, { ...DEF0, baselineGateEok: 999, renewalGateEok: 999 } as PointDefinition)).toEqual(levelMaxTvOf(g, DEF0));
    });

    it("등가 정리 — maxTv ≥ gate ⟺ pointsOf 에 그 레벨의 Point 존재(여러 게이트 전수 대조)", () => {
        // 뒤 캔들(80억)이 앞 캔들(60억)보다 크다: 게이트 70억이면 슬롯 1 이 뒤 캔들로 이동해 레벨 생존 —
        // "max 가 슬롯 2 국면 캔들에서 와도 등가 유지"의 그 형태(앞이 게이트에 떨어지면 뒤가 슬롯 1 후보).
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 9970, 60, true, 9800), nh(566, 9995, 80, true, 9970), nh(600, 10350, 35), nh(620, 10400, 45)],
        });
        const def = { ...DEFAULT_POINT_DEFINITION }; // 밴드 0.5 — 슬롯 2 가 실제로 서는 모드
        const stats = levelMaxTvOf(g, def);
        for (const gate of [20, 40, 50, 70, 90, 200]) {
            const pts = pointsOf(g, { ...def, baselineGateEok: gate, renewalGateEok: gate });
            const survived = new Set(pts.map((p) => p.levelIdx));
            for (const s of stats) {
                expect(survived.has(s.levelIdx)).toBe(s.maxTv >= gate * EOK);
            }
            // 역방향 — 목록에 없는 레벨은 어떤 게이트에서도 Point 를 못 낳는다.
            for (const li of survived) expect(stats.some((s) => s.levelIdx === li)).toBe(true);
        }
    });

    it("기준선 없음 → 빈 배열", () => {
        expect(levelMaxTvOf(grid({ base: null, newHighs: [nh(560, 10050, 60)] }), DEF0)).toEqual([]);
    });
});
