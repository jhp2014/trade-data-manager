// 이주 등가 게이트 — **이번 작업의 합격선**.
// 옛 `probesOfDay`(하드코딩 로직 4종)와 새 `evaluateCells(시드 조건 4칸)`가 같은 입력에서 같은
// (종목, 분, 태그) 집합을 내야 한다. 여기가 빨간불이면 시드 환원이 틀린 것이고, 그 증상은 조용하다
// (후보가 몇 건 늘거나 줄 뿐 화면은 멀쩡해 보인다).
//
// 알고 남기는 차이 하나: **타임라인 밖 격자 좌표**. 옛 구현은 dense 타임라인에 없는 격자 분도 값
// 결손으로 실었지만("있을 일 없지만 정직하게"), 새 우주에서 셀은 타임라인의 샘플이라 그 좌표는
// 셀이 아니다(decisions 「집합」 절). 아래 마지막 케이스가 그 차이를 명시적으로 잠근다.
import { describe, it, expect } from "vitest";
import { probesOfDay, DEFAULT_PROBE_PARAMS, type ProbeDeps, type ProbeParams, type ProbeStock } from "../../probe/probe.js";
import { evaluateCells } from "../engine.js";
import { seedConditionsOf, SEED_IDS, type SeedKnobs } from "../seed.js";
import { kstToUnix } from "../../kst.js";

const DATE = "2026-09-16";
const t0 = kstToUnix(DATE, "09:00:00");
const MIN0 = 9 * 60;

function stock(code: string, over: Partial<ProbeStock> & { n?: number } = {}): ProbeStock {
    const n = over.n ?? 5;
    const seq = (v: number[] | undefined, fill: number): number[] => v ?? new Array(n).fill(fill);
    return {
        code,
        times: over.times ?? Array.from({ length: n }, (_, i) => t0 + i * 60),
        rate: seq(over.rate as number[] | undefined, 0),
        cumAmount: seq(over.cumAmount as number[] | undefined, 0),
        minuteHigh: seq(over.minuteHigh as number[] | undefined, 0),
        trailingHighs: over.trailingHighs ?? { krx: [], un: [] },
    };
}

const NO_DEPS: ProbeDeps = { gridMinutesOf: () => [], zoneRankAt: () => null };
const P = (over: Partial<ProbeParams>): ProbeParams => ({ ...DEFAULT_PROBE_PARAMS, ...over });

/** 조건 id → 옛 태그(1:1). 태그 어휘가 갈리면 비교가 성립하지 않으므로 여기서 한 번 번역한다. */
const TAG_OF: Record<string, string> = {
    [SEED_IDS.grid]: "grid",
    [SEED_IDS.surge]: "surge",
    [SEED_IDS.priorHigh]: "priorHigh",
    [SEED_IDS.zone]: "zoneRise",
};

const normOld = (hits: readonly { code: string; min: number; tags: readonly string[] }[]): string[] =>
    hits.map((h) => `${h.code}@${h.min - MIN0}:${[...h.tags].sort().join(",")}`);

const normNew = (hits: readonly { code: string; min: number; tags: readonly string[] }[]): string[] =>
    hits.map((h) => `${h.code}@${h.min - MIN0}:${h.tags.map((t) => TAG_OF[t] ?? t).sort().join(",")}`);

/** 같은 입력을 두 엔진에 물려 비교 — 픽스처마다 이 한 줄이면 된다. */
function bothAgree(stocks: readonly ProbeStock[], deps: ProbeDeps, params: ProbeParams): void {
    const old = probesOfDay(stocks, deps, params);
    const now = evaluateCells(stocks, deps, seedConditionsOf(params as SeedKnobs));
    expect(normNew(now.hits), JSON.stringify(params)).toEqual(normOld(old));
}

describe("시드 등가 — 옛 probesOfDay 와 같은 발화", () => {
    it("② 급등대금 — 두 조건이 동시에 참인 첫 분 1회", () => {
        const s = stock("A", { rate: [3, 6, 6, 6, 6], cumAmount: [50e8, 80e8, 120e8, 200e8, 300e8] });
        bothAgree([s], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
    });

    it("② 등락률이 나중에 오르는 케이스(대금 먼저 도달)", () => {
        const s = stock("A", { rate: [1, 2, 3, 7, 7], cumAmount: [200e8, 210e8, 220e8, 230e8, 240e8] });
        bothAgree([s], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
    });

    it("② rate 가 오르내려도 하루 1회다 — firstTrue 였다면 여기서 갈린다", () => {
        const s = stock("A", { rate: [6, 1, 6, 1, 6], cumAmount: [200e8, 200e8, 200e8, 200e8, 200e8] });
        bothAgree([s], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
    });

    it("③ 전고 돌파 — index 0 제외·창별 자·창이 비면 침묵", () => {
        const s = stock("A", {
            minuteHigh: [2, 10, 11, 11, 11],
            cumAmount: [10e8, 20e8, 30e8, 40e8, 50e8],
            trailingHighs: { krx: [], un: [20, 8, 5, 12, 3, 1] },
        });
        bothAgree([s], NO_DEPS, P({ gridOn: false, surgeOn: false, priorHighDays: 2 }));
        bothAgree([s], NO_DEPS, P({ gridOn: false, surgeOn: false, priorHighDays: 5 }));
        const fresh = stock("B", { minuteHigh: [50, 50, 50, 50, 50], trailingHighs: { krx: [], un: [50] } });
        bothAgree([fresh], NO_DEPS, P({ gridOn: false, surgeOn: false }));
    });

    it("④ 존 순위 — 진입·개선 발화, 유지·악화 침묵, 이탈 후 재진입 재발화", () => {
        const s = stock("A", { n: 6, cumAmount: new Array(6).fill(1e8) });
        const seq: (number | null)[] = [null, 3, 3, 2, null, 3];
        const deps: ProbeDeps = {
            gridMinutesOf: () => [],
            zoneRankAt: (_c, min) => {
                const r = seq[min - MIN0];
                return r === null || r === undefined ? null : { rank: r, theme: "테마X" };
            },
        };
        bothAgree([s], deps, P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: true }));
    });

    it("④ zoneMaxRank 밖 순위는 개선이어도 침묵", () => {
        const s = stock("A", { n: 3, cumAmount: [1e8, 1e8, 1e8] });
        const deps: ProbeDeps = { gridMinutesOf: () => [], zoneRankAt: (_c, min) => ({ rank: [9, 5, 4][min - MIN0]!, theme: "T" }) };
        bothAgree([s], deps, P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: true, zoneMaxRank: 3 }));
    });

    it("① 격자 — 그 분의 값을 싣고 태그 grid", () => {
        const s = stock("A", { rate: [1, 2, 3, 4, 5], cumAmount: [10e8, 20e8, 30e8, 40e8, 50e8] });
        const deps: ProbeDeps = { gridMinutesOf: (c) => (c === "A" ? [MIN0 + 2] : []), zoneRankAt: () => null };
        bothAgree([s], deps, P({ surgeOn: false, priorHighOn: false }));
    });

    it("병합 — 같은 (종목,분)의 두 로직은 한 항목에 태그 둘", () => {
        const s = stock("A", {
            rate: [6, 6, 6, 6, 6],
            cumAmount: [120e8, 130e8, 140e8, 150e8, 160e8],
            minuteHigh: [10, 10, 10, 10, 10],
            trailingHighs: { krx: [], un: [20, 8] },
        });
        bothAgree([s], NO_DEPS, P({ gridOn: false }));
    });

    it("하한 — 소거가 아니라 지연(하한 > 로직 임계면 하한 충족 첫 분에서 발화)", () => {
        const s = stock("A", {
            rate: [6, 6, 6, 6, 6],
            cumAmount: [120e8, 200e8, 250e8, 320e8, 400e8],
            minuteHigh: [10, 10, 10, 10, 10],
            trailingHighs: { krx: [], un: [20, 8] },
        });
        bothAgree([s], NO_DEPS, P({ gridOn: false, minCumAmountEok: 300 }));
    });

    it("하한 — 격자에도 걸린다(미달 좌표는 빠진다)", () => {
        const s = stock("A", { rate: [6, 6, 6, 6, 6], cumAmount: [120e8, 130e8, 140e8, 150e8, 160e8] });
        const deps: ProbeDeps = { gridMinutesOf: () => [MIN0], zoneRankAt: () => null };
        bothAgree([s], deps, P({ priorHighOn: false, minCumAmountEok: 200 }));
    });

    it("정렬·다종목·전부 끔·빈 재료", () => {
        const a = stock("B", { rate: [6, 0, 0, 0, 0], cumAmount: new Array(5).fill(120e8) });
        const b = stock("A", { rate: [0, 6, 0, 0, 0], cumAmount: new Array(5).fill(120e8) });
        const c = stock("C", { rate: [6, 0, 0, 0, 0], cumAmount: new Array(5).fill(120e8) });
        bothAgree([a, b, c], NO_DEPS, P({ gridOn: false, priorHighOn: false }));
        bothAgree([a, b, c], NO_DEPS, P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: false }));
        bothAgree([], NO_DEPS, DEFAULT_PROBE_PARAMS);
        bothAgree([stock("A", { n: 0, times: [] })], NO_DEPS, DEFAULT_PROBE_PARAMS);
    });

    it("4종 동시 — 기본 노브 + 존순위까지 켠 복합 픽스처", () => {
        const s = stock("A", {
            n: 8,
            rate: [0, 2, 6, 6, 7, 7, 3, 8],
            cumAmount: [10e8, 50e8, 120e8, 200e8, 260e8, 300e8, 330e8, 400e8],
            minuteHigh: [1, 3, 7, 9, 12, 12, 8, 14],
            trailingHighs: { krx: [], un: [30, 10, 6, 4] },
        });
        const zoneSeq: (number | null)[] = [null, 5, 3, 3, 2, null, 4, 1];
        const deps: ProbeDeps = {
            gridMinutesOf: (c) => (c === "A" ? [MIN0 + 1, MIN0 + 5] : []),
            zoneRankAt: (_c, min) => {
                const r = zoneSeq[min - MIN0];
                return r === null || r === undefined ? null : { rank: r, theme: "T" };
            },
        };
        bothAgree([s], deps, P({ zoneOn: true, zoneMaxRank: 4 }));
        bothAgree([s], deps, P({ zoneOn: true, zoneMaxRank: 4, minCumAmountEok: 250 }));
    });
});

describe("알고 남기는 차이 — 타임라인 밖 격자 좌표", () => {
    it("옛 엔진은 값 결손으로 실었지만, 셀 우주에선 그 좌표가 셀이 아니다", () => {
        const s = stock("A", { n: 3 });
        const deps: ProbeDeps = { gridMinutesOf: () => [MIN0 + 99], zoneRankAt: () => null };
        const params = P({ surgeOn: false, priorHighOn: false });
        const old = probesOfDay([s], deps, params);
        const now = evaluateCells([s], deps, seedConditionsOf(params as SeedKnobs));
        expect(old.map((h) => h.min - MIN0)).toEqual([99]); // 옛: 값 없이 실림
        expect(now.hits).toEqual([]); // 새: 셀이 아니다
    });
});

describe("알고 남기는 차이 — 하한이 '지연'인 근거가 깨지는 자리", () => {
    // 하한의 등가(옛 "관찰 연기" ≡ 새 AND 항)는 **세션 누적대금이 단조증가**한다는 입력 불변식에
    // 기대고 있다(미달 분이 항상 접두사라 두 모델이 같은 분에서 깨어난다). 실서비스 재료는 그 성질을
    // 가지므로 아래 둘은 도달 불가에 가깝지만, 어느 쪽이 의도인지 코드가 말하지 않으면 다음 사람이
    // 재발명한다 — 그래서 픽스처로 못 박는다(위 「타임라인 밖 격자 좌표」와 같은 선례).

    it("누적대금이 후퇴하면 새 엔진이 재발화한다 — 미관찰을 '참이었다'로 세지 않는 쪽이 의도다", () => {
        const s = stock("A", { n: 4, cumAmount: [100e8, 100e8, 50e8, 100e8] });
        const deps: ProbeDeps = { gridMinutesOf: () => [], zoneRankAt: () => ({ rank: 3, theme: "T" }) };
        const params = P({ gridOn: false, surgeOn: false, priorHighOn: false, zoneOn: true, zoneMaxRank: 3, minCumAmountEok: 80 });
        const old = probesOfDay([s], deps, params);
        const now = evaluateCells([s], deps, seedConditionsOf(params as SeedKnobs));
        expect(old.map((h) => h.min - MIN0)).toEqual([0]); // 옛: 하한 미달 분을 건너뛰며 prev(=3)를 **보존**해 침묵
        expect(now.hits.map((h) => h.min - MIN0)).toEqual([0, 3]); // 새: 단락으로 안 본 분은 미참으로 되돌려 재진입 발화
    });

    it("누적대금 배열이 짧아 값이 결손이면 새 엔진은 **탈락**시킨다 — 옛 엔진은 통과시켰다", () => {
        const s = stock("A", {
            n: 3,
            cumAmount: [], // 길이 어긋남 = 결손(실서비스엔 없지만 계약상 가능한 모양)
            minuteHigh: [10, 10, 10],
            trailingHighs: { krx: [], un: [20, 8] },
        });
        const params = P({ gridOn: false, surgeOn: false, zoneOn: false, minCumAmountEok: 50 });
        const old = probesOfDay([s], NO_DEPS, params);
        const now = evaluateCells([s], NO_DEPS, seedConditionsOf(params as SeedKnobs));
        expect(old.map((h) => h.min - MIN0)).toEqual([0]); // 옛: `undefined < 하한` 이 거짓이라 게이트를 **통과**
        expect(now.hits).toEqual([]); // 새: 결손을 0 으로 읽어 하한 미달 — 모르는 값을 통과로 세지 않는다
    });
});
