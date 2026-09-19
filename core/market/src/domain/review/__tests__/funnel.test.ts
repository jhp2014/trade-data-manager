import { describe, it, expect } from "vitest";
import {
    and3, andStep, expandUniverse, finestGrain, funnelKey, not3, or3, tallyFunnel,
    type FunnelItem, type FunnelStage, type Verdict,
} from "../funnel.js";

const day = (code: string, date: string): FunnelItem => ({ stockCode: code, date });
const pt = (code: string, date: string, time: string): FunnelItem => ({ stockCode: code, date, time });

/** 판정표로 단계를 만든다 — 항목키 → 3치. 표에 없으면 미배치(재료 없음)로 둔다. */
const stageOf = (id: string, table: Record<string, Verdict>): FunnelStage => ({
    id,
    verdictOf: (i) => table[funnelKey(i)],
});

describe("and3 — 3치 AND(미배치는 통과가 아니다)", () => {
    it("하나라도 탈락이면 탈락 — 미배치가 섞여 있어도", () => {
        expect(and3([true, false])).toBe(false);
        expect(and3([undefined, false])).toBe(false);
        expect(and3([false, undefined, true])).toBe(false);
    });

    it("탈락이 없고 미배치가 있으면 미배치", () => {
        expect(and3([true, undefined])).toBeUndefined();
        expect(and3([undefined])).toBeUndefined();
    });

    it("전부 통과여야 통과", () => {
        expect(and3([true, true, true])).toBe(true);
    });

    it("빈 목록은 통과(공허참) — 첫 단계엔 상류가 없으니 막힌 적도 없다", () => {
        expect(and3([])).toBe(true);
    });
});

describe("or3 — Kleene OR(and3 의 짝)", () => {
    it("하나라도 참이면 참 — 모름이 섞여 있어도", () => {
        expect(or3([false, true])).toBe(true);
        expect(or3([undefined, true])).toBe(true);
    });

    it("참이 없고 모름이 있으면 모름", () => {
        expect(or3([false, undefined])).toBeUndefined();
    });

    it("전부 거짓이면 거짓, 빈 목록도 거짓(공허거짓 — and3([]) 가 참인 것과 짝)", () => {
        expect(or3([false, false])).toBe(false);
        expect(or3([])).toBe(false);
    });
});

describe("not3 — 모름의 부정은 모름", () => {
    it("참↔거짓은 뒤집고, 모름은 그대로 둔다", () => {
        expect(not3(true)).toBe(false);
        expect(not3(false)).toBe(true);
        expect(not3(undefined)).toBeUndefined();
    });

    it("드모르간이 성립한다 — 셋이 한 대수라는 뜻(9가지)", () => {
        const ALL: Verdict[] = [true, false, undefined];
        for (const a of ALL) for (const b of ALL) {
            expect(not3(and3([a, b]))).toBe(or3([not3(a), not3(b)]));
        }
    });
});

describe("andStep — 접기 단위가 and3 와 같은 값을 낸다", () => {
    const ALL: Verdict[] = [true, false, undefined];

    it("둘의 AND 가 and3 와 일치한다(9가지 전부)", () => {
        for (const a of ALL) for (const b of ALL) expect(andStep(a, b)).toBe(and3([a, b]));
    });

    it("빈 값에서 접어 나가도 and3 와 일치한다(3단까지 27가지)", () => {
        for (const a of ALL) for (const b of ALL) for (const c of ALL) {
            const folded = [a, b, c].reduce<Verdict>(andStep, true);
            expect(folded).toBe(and3([a, b, c]));
        }
    });
});

describe("finestGrain — 결과 해상도는 걸린 단계 중 가장 가는 것", () => {
    it("타점 단계가 하나라도 있으면 타점", () => {
        expect(finestGrain(["day", "point", "day"])).toBe("point");
    });

    it("전부 하루면 하루", () => {
        expect(finestGrain(["day", "day"])).toBe("day");
    });

    it("단계가 없으면 하루 — 아무것도 안 걸렸는데 타점으로 펼치면 가짜 정밀도가 된다", () => {
        expect(finestGrain([])).toBe("day");
    });
});

describe("expandUniverse — 후보는 (종목·날짜) 하나, 알갱이에서만 갈린다", () => {
    const candidates = [day("000880", "2025-07-01"), day("005490", "2025-07-02")];
    const times: Record<string, string[]> = { "000880|2025-07-01": ["09:21:00", "10:01:00"] };
    const timesOf = (c: { stockCode: string; date: string }): string[] => times[`${c.stockCode}|${c.date}`] ?? [];

    it("하루 알갱이면 후보 그대로 — 타점이 있어도 안 펼친다", () => {
        const out = expandUniverse(candidates, "day", timesOf);
        expect(out).toEqual([day("000880", "2025-07-01"), day("005490", "2025-07-02")]);
    });

    it("타점 알갱이면 그 하루의 타점들로 갈라진다", () => {
        const out = expandUniverse(candidates, "point", timesOf);
        expect(out).toContainEqual(pt("000880", "2025-07-01", "09:21:00"));
        expect(out).toContainEqual(pt("000880", "2025-07-01", "10:01:00"));
    });

    it("타점 0인 후보 하루는 시각 없는 항목 하나로 남는다 — 분모에서 조용히 사라지면 비율이 거짓말한다", () => {
        const out = expandUniverse(candidates, "point", timesOf);
        expect(out).toContainEqual(day("005490", "2025-07-02"));
        expect(out).toHaveLength(3);
    });
});

describe("tallyFunnel — 단계별 독립 평가", () => {
    // a=둘 다 통과 · b=1차만 통과 · c=2차만 통과(근접 탈락이 될 항목) · d=1차 미배치+2차 통과
    const a = day("A", "2025-07-01");
    const b = day("B", "2025-07-01");
    const c = day("C", "2025-07-01");
    const d = day("D", "2025-07-01");
    const items = [a, b, c, d];
    const s1 = stageOf("s1", { "A|2025-07-01|": true, "B|2025-07-01|": true, "C|2025-07-01|": false });
    const s2 = stageOf("s2", {
        "A|2025-07-01|": true, "B|2025-07-01|": false, "C|2025-07-01|": true, "D|2025-07-01|": true,
    });

    it("생존자 = 전 단계 AND — 미배치는 못 든다", () => {
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.survivors).toEqual([a]); // B=2차 탈락 · C=1차 탈락 · D=1차 미배치
        expect(r.universe).toBe(4);
    });

    it("미배치 수는 따로 센다 — 탈락과 섞이면 결손이 조용히 사라진다", () => {
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.pendingCount).toBe(1); // D 만(1차 미배치 + 2차 통과 = AND 가 미배치)
    });

    it("결과는 단계 순서와 무관하다 — 3치 AND 는 교환법칙이 성립한다", () => {
        const fwd = tallyFunnel(items, [s1, s2]);
        const rev = tallyFunnel(items, [s2, s1]);
        expect(rev.survivors).toEqual(fwd.survivors);
        expect(rev.pendingCount).toBe(fwd.pendingCount);
    });

    it("판정은 항목×단계로 한 번씩만 부른다 — verdictOf 가 비쌀 수 있다", () => {
        let calls = 0;
        const counted = (id: string): FunnelStage => ({ id, verdictOf: () => { calls++; return true; } });
        tallyFunnel(items, [counted("x"), counted("y"), counted("z")]);
        expect(calls).toBe(items.length * 3);
    });
});

// 2단짜리 표만으로는 상류 접기가 앞선 **전부**를 보는지 알 수 없다(1차가 곧 상류라서).
// 3단 이상에서 미배치가 끼었을 때 그게 끝까지 점착하는지가 접기의 진짜 계약이다.
describe("tallyFunnel — 상류는 앞선 단계 전부(3단 이상)", () => {
    const a = day("A", "2025-07-01");
    const k = "A|2025-07-01|";

    it("미배치는 3단을 지나도 점착한다 — 뒤가 전부 통과여도 생존이 안 된다", () => {
        const s1 = stageOf("s1", {});                  // 미배치
        const s2 = stageOf("s2", { [k]: true });
        const s3 = stageOf("s3", { [k]: true });
        const r = tallyFunnel([a], [s1, s2, s3]);
        expect(r.survivors).toEqual([]);
        expect(r.pendingCount).toBe(1);
    });

    it("탈락이 미배치를 흡수한다 — 하나라도 탈락이면 결손이 아니라 탈락이다", () => {
        const s1 = stageOf("s1", { [k]: false });
        const s2 = stageOf("s2", {});                  // 미배치
        const s3 = stageOf("s3", { [k]: true });
        const r = tallyFunnel([a], [s1, s2, s3]);
        expect(r.survivors).toEqual([]);
        expect(r.pendingCount).toBe(0); // 미배치가 섞여도 탈락이 이긴다(and3 의 규칙)
    });
});
