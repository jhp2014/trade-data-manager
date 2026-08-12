import { describe, it, expect } from "vitest";
import {
    and3, blockedBy, cellOf, expandUniverse, finestGrain, funnelKey, tallyFunnel,
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

describe("cellOf — 이번 통과 셋은 상류 상태로만 갈린다", () => {
    it("이번 탈락·미배치는 상류와 무관하게 제 칸으로", () => {
        expect(cellOf(false, true)).toBe("fail");
        expect(cellOf(false, false)).toBe("fail");
        expect(cellOf(undefined, true)).toBe("pending");
    });

    it("이번 통과 + 상류 통과 = 생존", () => {
        expect(cellOf(true, true)).toBe("survive");
    });

    it("이번 통과 + 상류 탈락 = 근접 탈락(배울 게 있는 곳)", () => {
        expect(cellOf(true, false)).toBe("nearMiss");
    });

    it("이번 통과 + 상류 미배치 = 상류 보류 — 근접 탈락과 절대 안 섞는다", () => {
        expect(cellOf(true, undefined)).toBe("upstreamPending");
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

    it("1차는 상류가 없어 전부 생존/탈락/미배치로만 갈린다", () => {
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.stages[0].counts).toEqual({ survive: 2, nearMiss: 0, upstreamPending: 0, fail: 1, pending: 1 });
    });

    it("2차에서 근접 탈락과 상류 보류가 갈린다", () => {
        const r = tallyFunnel(items, [s1, s2]);
        // A=생존 · C=근접 탈락(1차 탈락) · D=상류 보류(1차 미배치) · B=이번 탈락
        expect(r.stages[1].counts).toEqual({ survive: 1, nearMiss: 1, upstreamPending: 1, fail: 1, pending: 0 });
        expect(r.stages[1].cells.nearMiss).toEqual([c]);
        expect(r.stages[1].cells.upstreamPending).toEqual([d]);
    });

    it("생존자 = 전 단계 AND — 미배치는 못 든다", () => {
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.survivors).toEqual([a]);
        expect(r.universe).toBe(4);
    });

    it("생존 집합은 단계 순서를 바꿔도 같다 — 순서가 바꾸는 건 서술뿐", () => {
        const fwd = tallyFunnel(items, [s1, s2]);
        const rev = tallyFunnel(items, [s2, s1]);
        expect(rev.survivors).toEqual(fwd.survivors);
    });

    it("근접 탈락은 순서를 바꾸면 자리를 옮긴다 — 상류는 앞선 단계들이므로", () => {
        const rev = tallyFunnel(items, [s2, s1]);
        // 이제 s1 이 2차 — B 는 s1 통과인데 상류(s2)에서 죽어 근접 탈락이 된다
        expect(rev.stages[1].cells.nearMiss).toEqual([b]);
    });
});

describe("newlyKilled — 한계 기여도", () => {
    const items = [day("A", "2025-07-01"), day("B", "2025-07-01"), day("C", "2025-07-01")];
    const k = (code: string): string => `${code}|2025-07-01|`;

    it("상류 통과였는데 이번에 죽인 것만 센다 — 이미 죽어 있던 건 제 공이 아니다", () => {
        const s1 = stageOf("s1", { [k("A")]: true, [k("B")]: true, [k("C")]: false });
        const s2 = stageOf("s2", { [k("A")]: true, [k("B")]: false, [k("C")]: false });
        const r = tallyFunnel(items, [s1, s2]);
        // 2차는 B·C 둘을 떨궜지만 C 는 이미 1차에서 죽어 있었다 → 새로 죽인 건 B 하나
        expect(r.stages[1].counts.fail).toBe(2);
        expect(r.stages[1].newlyKilled).toBe(1);
    });

    it("상류가 미배치면 새로 죽인 게 아니다 — 통과였다고 말할 수 없다", () => {
        const s1 = stageOf("s1", {}); // 전부 미배치
        const s2 = stageOf("s2", { [k("A")]: false, [k("B")]: false, [k("C")]: false });
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.stages[1].counts.fail).toBe(3);
        expect(r.stages[1].newlyKilled).toBe(0);
    });

    it("전부 이미 죽어 있으면 0 — 겉보기 선택도가 커도 장식이라는 뜻", () => {
        const s1 = stageOf("s1", { [k("A")]: false, [k("B")]: false, [k("C")]: false });
        const s2 = stageOf("s2", { [k("A")]: false, [k("B")]: false, [k("C")]: false });
        const r = tallyFunnel(items, [s1, s2]);
        expect(r.stages[1].counts.fail).toBe(3);
        expect(r.stages[1].newlyKilled).toBe(0);
    });
});

describe("blockedBy — 근접 탈락 목록의 '막힌 단계'", () => {
    const item = day("A", "2025-07-01");
    const k = "A|2025-07-01|";

    it("앞선 단계 중 탈락시킨 것들만 — 미배치는 막은 게 아니다", () => {
        const s1 = stageOf("s1", { [k]: false });
        const s2 = stageOf("s2", {}); // 미배치
        const s3 = stageOf("s3", { [k]: true });
        expect(blockedBy([s1, s2, s3], 2, item)).toEqual(["s1"]);
    });

    it("뒤 단계는 안 본다 — 상류만이 '막았다'가 된다", () => {
        const s1 = stageOf("s1", { [k]: true });
        const s2 = stageOf("s2", { [k]: false });
        expect(blockedBy([s1, s2], 1, item)).toEqual([]);
    });
});
