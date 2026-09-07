// 정의 레일 분포 — **규칙 하나(그 노브를 최대 개방한 정의로 굽는다)**가 회귀하면 컷을 끄는 동안
// 막대가 같이 움직인다. 그 불변식이 타입이 아니라 함수 본문에만 있어서(창을 덮어쓰는 한 줄) 여기서 못 박는다.
import { describe, expect, it } from "vitest";
import { DEFAULT_POINT_DEFINITION, type GridNewHigh, type PointGrid, type PointJudgeDef } from "@trade-data-manager/market/domain";
import { buildApproachDist, buildSignalMinuteDist } from "../defDistribution.js";

const nh = (min: number, high: number, eok: number, maxBefore = 0): GridNewHigh => ({
    min,
    open: high - 100,
    high,
    low: high - 150,
    close: high,
    tv: String(eok * 100_000_000),
    cum: "0",
    maxBefore,
});

const grid = (newHighs: GridNewHigh[]): PointGrid => ({
    base: 10000,
    touch: { min: 500, tv: "0", cum: "0" },
    pivots: [],
    newHighs,
    prevBase: null,
    prevBaseKrx: null,
    sessionHigh: { min: 500, price: 10000 },
});

const byDate = (g: PointGrid): ReadonlyMap<string, ReadonlyMap<string, PointGrid>> =>
    new Map([["2026-09-01", new Map([["005930", g]])]]);

const DEF: PointJudgeDef = { ...DEFAULT_POINT_DEFINITION, approachPct: 0 };

describe("buildSignalMinuteDist", () => {
    // 마디(피벗)가 없으니 레벨은 기준선 하나 — 시그널도 그 레벨의 첫 자격 봉 하나다(505).
    // 뒤 봉들은 이미 몫이 나간 레벨이라 시그널이 아니다(pointsOf 의 claimedLevel 커서).
    const data = byDate(grid([nh(505, 10100, 60), nh(560, 10200, 60), nh(700, 10300, 60)]));

    it("창을 좁혀도 막대는 그대로다 — 컷을 끄는 동안 그림이 움직이면 예지 감각이 죽는다", () => {
        const open = buildSignalMinuteDist(data, DEF);
        expect(open).toEqual([505]);
        // 창을 505 밖으로 좁혀도(그 시그널이 실제로는 죽는 조건) 막대는 그대로 — 이게 규칙이다.
        expect(buildSignalMinuteDist(data, { ...DEF, qualifyWindows: [{ from: 600, to: 650 }] })).toEqual(open);
    });

    it("창 밖 노브(게이트)는 그대로 반영된다 — 창만 열고 나머지는 현재 정의다", () => {
        expect(buildSignalMinuteDist(data, { ...DEF, baselineGateEok: 100 })).toEqual([]);
    });
});

describe("buildApproachDist", () => {
    it("진입 봉의 깊이만 모으고 정확 돌파는 따로 센다 — 날짜·종목을 가로질러 합산한다", () => {
        const data = new Map([
            ["2026-09-01", new Map([["005930", grid([nh(560, 10000, 60, 10020), nh(570, 10100, 60)])]])],
            ["2026-09-02", new Map([["000660", grid([nh(600, 20000, 60, 20040)])]])],
        ]);
        const d = buildApproachDist(data, { qualifyWindows: [], bullOnly: true });
        expect(d.strict).toBe(1);
        expect(d.depths).toHaveLength(2);
        expect(d.depths[0]).toBeCloseTo((20 / 10020) * 100, 10);
    });

    it("창을 좁히면 모수가 줄어든다 — 근접 레일의 모수는 근접만 개방하고 나머지는 현재 정의다", () => {
        const data = byDate(grid([nh(505, 10000, 60, 10020), nh(700, 10000, 60, 10020)]));
        expect(buildApproachDist(data, { qualifyWindows: [], bullOnly: true }).depths).toHaveLength(2);
        expect(buildApproachDist(data, { qualifyWindows: [{ from: 600, to: 1200 }], bullOnly: true }).depths).toHaveLength(1);
    });
});
