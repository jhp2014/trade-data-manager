import { describe, it, expect } from "vitest";
import { probesOfDay, DEFAULT_PROBE_PARAMS, type ProbeDeps, type ProbeParams, type ProbeStock } from "../probe.js";
import { kstToUnix } from "../../kst.js";

// 픽스처 — 09:00 부터 1분 간격 dense 타임라인. 값은 UN % 공간(deriveMinutes 산과 같은 모양).
const DATE = "2026-09-16";
const t0 = kstToUnix(DATE, "09:00:00");
const MIN0 = 9 * 60;

function stock(code: string, over: Partial<ProbeStock> & { n?: number } = {}): ProbeStock {
    const n = over.n ?? 5;
    const seq = (v: number[] | undefined, fill: number): number[] => v ?? new Array(n).fill(fill);
    return {
        code,
        times: over.times ?? Array.from({ length: n }, (_, i) => t0 + i * 60),
        rate: seq(over.rate, 0),
        cumAmount: seq(over.cumAmount, 0),
        minuteHigh: seq(over.minuteHigh, 0),
        trailingHighs: over.trailingHighs ?? { krx: [], un: [] },
    };
}

const NO_DEPS: ProbeDeps = { gridMinutesOf: () => [], zoneRankAt: () => null };
const P = (over: Partial<ProbeParams>): ProbeParams => ({ ...DEFAULT_PROBE_PARAMS, ...over });
const OFF = P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: false });

describe("probesOfDay — surge(② 등락+누적대금 첫 도달)", () => {
    it("두 조건이 동시에 참인 첫 분에서 1회만 발화한다", () => {
        const s = stock("A", {
            rate: [3, 6, 6, 6, 6],
            cumAmount: [50e8, 80e8, 120e8, 200e8, 300e8], // 100억 도달 = i2
        });
        const hits = probesOfDay([s], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ code: "A", min: MIN0 + 2, tags: ["surge"], ratePct: 6, cumAmount: 120e8 });
    });

    it("등락률이 나중에 오르면 그때 발화한다(대금 먼저 도달 케이스)", () => {
        const s = stock("A", { rate: [1, 2, 3, 7, 7], cumAmount: [200e8, 210e8, 220e8, 230e8, 240e8] });
        const hits = probesOfDay([s], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
        expect(hits.map((h) => h.min)).toEqual([MIN0 + 3]);
    });
});

describe("probesOfDay — priorHigh(③ 전고 돌파)", () => {
    it("index 0(당일 전체 고가)은 자에서 제외된다 — 포함하면 영영 거짓", () => {
        // 당일 고가 20%(index 0), 직전 5일 고가 최대 8%. 분봉 고가 10% 는 8% 를 넘으므로 발화해야 한다.
        const s = stock("A", {
            minuteHigh: [2, 10, 11, 11, 11],
            cumAmount: [10e8, 20e8, 30e8, 40e8, 50e8],
            trailingHighs: { krx: [], un: [20, 8, 5, 3, 1, 2] },
        });
        const hits = probesOfDay([s], NO_DEPS, P({ gridOn: false, surgeOn: false }));
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ min: MIN0 + 1, tags: ["priorHigh"] });
    });

    it("창 W 를 줄이면 자가 달라진다(창별 1회)", () => {
        // W=2 자 = max(8,5)=8 → i1(10%) 발화. W=5 와 동일하지만 W=1 자 = 8 → 동일.
        // 자가 커지는 케이스: W=5 에 12 가 들어 있으면 미발화.
        const s = stock("A", {
            minuteHigh: [2, 10, 11, 11, 11],
            cumAmount: [10e8, 20e8, 30e8, 40e8, 50e8],
            trailingHighs: { krx: [], un: [20, 8, 5, 12, 3, 1] },
        });
        expect(probesOfDay([s], NO_DEPS, P({ gridOn: false, surgeOn: false, priorHighDays: 2 }))).toHaveLength(1);
        expect(probesOfDay([s], NO_DEPS, P({ gridOn: false, surgeOn: false, priorHighDays: 5 }))).toHaveLength(0);
    });

    it("창이 비면(신규 상장) 결손 — 발화하지 않는다", () => {
        const s = stock("A", { minuteHigh: [50, 50, 50, 50, 50], trailingHighs: { krx: [], un: [50] } });
        expect(probesOfDay([s], NO_DEPS, P({ gridOn: false, surgeOn: false }))).toHaveLength(0);
    });
});

describe("probesOfDay — zoneRise(④ 존 순위 상승)", () => {
    it("진입·개선에서 발화하고 유지·악화에선 침묵, 이탈 후 재진입은 다시 발화한다", () => {
        const s = stock("A", { n: 6, cumAmount: [1e8, 1e8, 1e8, 1e8, 1e8, 1e8] });
        // 분별 존 순위: null → 3(진입) → 3(유지) → 2(개선) → null(이탈) → 3(재진입)
        const seq: (number | null)[] = [null, 3, 3, 2, null, 3];
        const deps: ProbeDeps = {
            gridMinutesOf: () => [],
            zoneRankAt: (_c, min) => {
                const r = seq[min - MIN0];
                return r === null ? null : { rank: r, theme: "테마X" };
            },
        };
        const hits = probesOfDay([s], deps, P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: true }));
        expect(hits.map((h) => h.min - MIN0)).toEqual([1, 3, 5]);
        expect(hits[1]).toMatchObject({ zoneRank: 2, zoneTheme: "테마X" });
    });

    it("zoneMaxRank 밖 순위는 개선이어도 발화하지 않는다", () => {
        const s = stock("A", { n: 3, cumAmount: [1e8, 1e8, 1e8] });
        const deps: ProbeDeps = {
            gridMinutesOf: () => [],
            zoneRankAt: (_c, min) => ({ rank: [9, 5, 4][min - MIN0], theme: "T" }),
        };
        const hits = probesOfDay([s], deps, P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: true, zoneMaxRank: 3 }));
        expect(hits).toHaveLength(0);
    });
});

describe("probesOfDay — 병합·게이트·정렬", () => {
    it("같은 (종목,분)의 두 로직은 한 항목에 태그 둘로 병합된다", () => {
        const s = stock("A", {
            rate: [6, 6, 6, 6, 6],
            cumAmount: [120e8, 130e8, 140e8, 150e8, 160e8], // surge = i0
            minuteHigh: [10, 10, 10, 10, 10], // priorHigh 자 8 → i0
            trailingHighs: { krx: [], un: [20, 8] },
        });
        const hits = probesOfDay([s], NO_DEPS, P({ gridOn: false }));
        expect(hits).toHaveLength(1);
        expect(hits[0].tags.sort()).toEqual(["priorHigh", "surge"]);
    });

    it("격자 Point 는 태그 grid 로 합류하고 그 분의 값을 싣는다", () => {
        const s = stock("A", { rate: [1, 2, 3, 4, 5], cumAmount: [10e8, 20e8, 30e8, 40e8, 50e8] });
        const deps: ProbeDeps = { gridMinutesOf: (c) => (c === "A" ? [MIN0 + 2] : []), zoneRankAt: () => null };
        const hits = probesOfDay([s], deps, P({ surgeOn: false, priorHighOn: false }));
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ min: MIN0 + 2, tags: ["grid"], ratePct: 3, cumAmount: 30e8 });
    });

    it("하한은 소거가 아니라 지연이다 — 하한 > 로직 임계면 하한 충족 첫 분에서 발화한다", () => {
        // surge 임계 100억은 i0 에서 이미 충족, 하한 300억은 i3 부터 — i3 에서 발화해야 한다(영구 소거 금지).
        const s = stock("A", {
            rate: [6, 6, 6, 6, 6],
            cumAmount: [120e8, 200e8, 250e8, 320e8, 400e8],
            minuteHigh: [10, 10, 10, 10, 10], // priorHigh 자 8 → 첫 관찰 분에서 함께 발화
            trailingHighs: { krx: [], un: [20, 8] },
        });
        const hits = probesOfDay([s], NO_DEPS, P({ gridOn: false, minCumAmountEok: 300 }));
        expect(hits).toHaveLength(1);
        expect(hits[0].min).toBe(MIN0 + 3);
        expect(hits[0].tags.sort()).toEqual(["priorHigh", "surge"]);
    });

    it("공통 하한(minCumAmountEok)은 모든 태그에 걸린다", () => {
        const s = stock("A", {
            rate: [6, 6, 6, 6, 6],
            cumAmount: [120e8, 130e8, 140e8, 150e8, 160e8],
        });
        const deps: ProbeDeps = { gridMinutesOf: () => [MIN0], zoneRankAt: () => null };
        expect(probesOfDay([s], deps, P({ priorHighOn: false, minCumAmountEok: 200 }))).toHaveLength(0);
    });

    it("전부 꺼지면 빈 배열, 빈 재료도 빈 배열", () => {
        expect(probesOfDay([stock("A")], NO_DEPS, OFF)).toEqual([]);
        expect(probesOfDay([], NO_DEPS, DEFAULT_PROBE_PARAMS)).toEqual([]);
        expect(probesOfDay([stock("A", { n: 0, times: [] })], NO_DEPS, DEFAULT_PROBE_PARAMS)).toEqual([]);
    });

    it("정렬은 분 오름차순 → 코드 오름차순", () => {
        const a = stock("B", { rate: [6, 0, 0, 0, 0], cumAmount: [120e8, 120e8, 120e8, 120e8, 120e8] });
        const b = stock("A", { rate: [0, 6, 0, 0, 0], cumAmount: [120e8, 120e8, 120e8, 120e8, 120e8] });
        const c = stock("C", { rate: [6, 0, 0, 0, 0], cumAmount: [120e8, 120e8, 120e8, 120e8, 120e8] });
        const hits = probesOfDay([a, b, c], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
        expect(hits.map((h) => `${h.code}@${h.min - MIN0}`)).toEqual(["B@0", "C@0", "A@1"]);
    });
});
