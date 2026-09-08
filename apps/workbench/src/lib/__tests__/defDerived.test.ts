// defDerived — 캐시의 **신원 계약**을 잰다: 같은 (번들 × judge 키)는 같은 객체, 다른 키·다른 번들·
// LRU 축출은 새 객체. 파생 값 자체(pointsOf·걷기)는 core/각 빌더 테스트의 몫이라 여기서 안 잰다.
import { describe, expect, it } from "vitest";
import type { PointGrid, PointJudgeDef } from "@trade-data-manager/market/domain";
import { defDerivedFor, derivedOfAuto } from "../defDerived.js";

type ByDate = ReadonlyMap<string, ReadonlyMap<string, PointGrid>>;
const bundle = (): ByDate => new Map();

const def = (gate: number): PointJudgeDef => ({
    baselineGateEok: gate,
    renewalGateEok: 20,
    qualifyWindows: [],
    mergeRisePct: 5,
    bullOnly: true,
    approachPct: 0.5,
});

describe("defDerivedFor — 신원 계약", () => {
    it("같은 번들 × 같은 judge 키 = 같은 객체(참조 동일 — 하류 memo 의 자)", () => {
        const b = bundle();
        const a = defDerivedFor(b, def(50));
        expect(defDerivedFor(b, def(50))).toBe(a);
        expect(defDerivedFor(b, { ...def(50) })).toBe(a); // 내용 키 — 객체 신원이 아니라
    });

    it("judge 키가 다르면 다른 객체 · T·시뮬은 judge 키가 아니다(층 분리)", () => {
        const b = bundle();
        expect(defDerivedFor(b, def(50))).not.toBe(defDerivedFor(b, def(30)));
    });

    it("번들이 갈리면(격자 refetch) 같은 정의도 새 객체 — WeakMap 통째 무효", () => {
        expect(defDerivedFor(bundle(), def(50))).not.toBe(defDerivedFor(bundle(), def(50)));
    });

    it("LRU 상한(4) — 다섯 번째 정의가 가장 오래된 것을 밀어낸다, 최근 접근은 나이를 갱신한다", () => {
        const b = bundle();
        const first = defDerivedFor(b, def(1));
        defDerivedFor(b, def(2));
        defDerivedFor(b, def(3));
        defDerivedFor(b, def(1)); // 접근 — 1 이 최신이 된다
        defDerivedFor(b, def(4));
        defDerivedFor(b, def(5)); // 축출 대상은 1 이 아니라 2
        expect(defDerivedFor(b, def(1))).toBe(first);
        // 2 는 밀려났다 — 재요청은 새 객체.
        const two = defDerivedFor(b, def(2));
        expect(defDerivedFor(b, def(2))).toBe(two);
    });

    it("derivedOfAuto — auto 산출물에서 그 정의의 묶음으로 되돌아온다(캐시 밖 뷰는 undefined)", () => {
        const d = defDerivedFor(bundle(), def(50));
        expect(derivedOfAuto(d.auto)).toBe(d);
        expect(derivedOfAuto({ isLoading: true, error: null, points: [], rows: [], byChart: new Map() })).toBeUndefined();
    });

    it("게으른 층 — walks·outcomes·sim 단면은 같은 키면 같은 객체", () => {
        const d = defDerivedFor(bundle(), def(50));
        expect(d.walks()).toBe(d.walks());
        expect(d.outcomes(5)).toBe(d.outcomes(5));
        expect(d.outcomes(5)).not.toBe(d.outcomes(6));
        const cancel = { cancelRisePct: null, cancelAfterMin: null };
        expect(d.simBasis(cancel)).toBe(d.simBasis({ ...cancel }));
    });
});
