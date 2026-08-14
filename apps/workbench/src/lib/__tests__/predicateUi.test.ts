// 술어 UI 헬퍼 — 표시 문구·옵션 의미·저장 전 검증.
//
// 이 셋의 공통점은 **아무것도 스스로 알지 않는다**는 것이다. 술어 파라미터는 숫자 인덱스로 저장되고
// (op:0 = "≥", market:1 = "UN"), 그 인덱스의 뜻은 core 레지스트리의 ParamSpec.options 에만 있다.
// 예전엔 워치리스트가 0/1 을 인코딩·디코딩 양쪽에서 손으로 알고 있어서, core 에서 옵션 순서를 뒤집으면
// **알람이 조용히 반대로 울릴 수 있었다** — 실시간 알람이라 틀려도 화면에 빨간 글씨가 안 뜬다.
//
// 그래서 여기서 재는 건 "이 문자열이 나온다"만이 아니라 **레지스트리에 위임한다**는 성질이다:
// 술어를 core 에 하나 더 넣어도 검증이 저절로 따라와야 하고, 그게 스펙 순회로 짠 이유 전부다.
import { describe, it, expect } from "vitest";
import { availablePredicates, boardPredicateDef, defaultParams, LIVE_ALARM_FIELDS, type BoardPredicateInstance } from "@trade-data-manager/market/domain";
import { optionLabel, predicateText, validatePredicates } from "../predicateUi.js";

const price = (params: Record<string, number>): BoardPredicateInstance => ({ kind: "price", params });
const themeRank = (params: Record<string, number>, theme?: string): BoardPredicateInstance =>
    ({ kind: "themeRank", params: { market: 1, mode: 0, threshold: 3, ...params }, ...(theme === undefined ? {} : { textParams: { theme } }) });

describe("optionLabel — 인덱스의 뜻은 레지스트리에만 있다", () => {
    it("고른 옵션의 라벨을 준다", () => {
        expect(optionLabel("price", "op", { op: 0 })).toBe("≥");
        expect(optionLabel("price", "op", { op: 1 })).toBe("≤");
    });

    it("값이 없으면 스펙의 기본값으로 읽는다 — 옛 저장 필터엔 그 키가 없다", () => {
        expect(optionLabel("price", "op", {})).toBe("≥"); // price.op 의 def = 0
        expect(optionLabel("themeRank", "market", {})).toBe("UN"); // themeRank.market 의 def = 1
    });

    // ⚠ 이게 이 함수의 존재 이유다 — 호출부가 0/1 의 뜻을 외우면 core 와 어긋날 수 있다.
    it("**레지스트리에 위임한다** — 손으로 든 표가 아니다", () => {
        const spec = boardPredicateDef("themeRank")!.params.find((s) => s.key === "market")!;
        spec.options!.forEach((label, i) => expect(optionLabel("themeRank", "market", { market: i })).toBe(label));
    });

    it("옵션이 아닌 파라미터(숫자 입력)엔 라벨이 없다", () => {
        expect(optionLabel("price", "value", { value: 5_000 })).toBeUndefined();
    });

    it("모르는 술어·모르는 파라미터는 없음 — 지어내지 않는다", () => {
        expect(optionLabel("없는술어", "op", { op: 0 })).toBeUndefined();
        expect(optionLabel("price", "없는키", {})).toBeUndefined();
    });
});

describe("predicateText — 사람 문장은 core 의 정본", () => {
    it("레지스트리의 label() 을 그대로 쓴다", () => {
        expect(predicateText(price({ op: 0, value: 5_000 }))).toBe("가격 ≥ 5,000원");
        expect(predicateText(price({ op: 1, value: 5_000 }))).toBe("가격 ≤ 5,000원");
    });

    it("문자열 파라미터도 문장에 든다", () => {
        expect(predicateText(themeRank({ mode: 0, threshold: 3 }, "반도체"))).toContain("반도체");
    });

    // 빈 문자열로 지우면 화면에서 그 줄이 통째로 사라져 "왜 이 알람이 있지"가 안 읽힌다.
    it("모르는 술어는 **그 이름으로** 남는다 — 빈 줄이 되지 않는다", () => {
        expect(predicateText({ kind: "없는술어", params: {} })).toBe("없는술어");
    });
});

describe("validatePredicates — 저장 전 검증", () => {
    it("조건이 없으면 못 만든다 — 늘 참인 알람이 된다", () => {
        expect(validatePredicates([])).toBe("조건을 하나 이상 추가하세요");
    });

    it("멀쩡하면 통과(null)", () => {
        expect(validatePredicates([price({ op: 0, value: 5_000 })])).toBeNull();
        expect(validatePredicates([themeRank({ threshold: 3 }, "반도체")])).toBeNull();
    });

    it("모르는 술어는 막는다", () => {
        expect(validatePredicates([{ kind: "없는술어", params: {} }])).toContain("없는술어");
    });

    it("숫자가 아니면 막는다 — 빈 입력칸이 NaN 으로 들어온다", () => {
        expect(validatePredicates([price({ op: 0, value: Number.NaN })])).toContain("값을 입력하세요");
    });

    it("하한·상한을 벗어나면 막는다", () => {
        expect(validatePredicates([price({ op: 0, value: 0 })])).toContain("이상이어야");
        expect(validatePredicates([themeRank({ threshold: 0 }, "반도체")])).toContain("이상이어야");
    });

    it("문자열 파라미터가 비면 막는다 — 테마 미지정은 늘 불성립이라 조용히 안 울린다", () => {
        expect(validatePredicates([themeRank({}, "")])).toContain("지정하세요");
        expect(validatePredicates([themeRank({}, "   ")])).toContain("지정하세요"); // 공백만도 안 된다
        expect(validatePredicates([themeRank({})])).toContain("지정하세요");        // 아예 없어도
    });

    it("여러 개 중 하나만 틀려도 막는다 — 첫 실패를 말한다", () => {
        const msg = validatePredicates([price({ op: 0, value: 5_000 }), themeRank({ threshold: 0 }, "반도체")]);
        expect(msg).not.toBeNull();
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다. 검증을 술어별 if 문으로 다시 쓰면 여기서 죽는다 —
//   그때 새로 추가된 술어는 **검증 없이 저장되고**, 틀린 알람은 안 울리는 걸로만 드러난다.
describe("스펙 순회 — 술어가 늘어도 검증이 저절로 따라온다", () => {
    const defs = availablePredicates(LIVE_ALARM_FIELDS);

    it("알람에 쓸 수 있는 술어가 실제로 여럿이다 — 아래 순회가 헛돌지 않게", () => {
        expect(defs.length).toBeGreaterThan(3);
    });

    // 하한이 있는 것만 돈다 — 없는 술어까지 돌리면 단언을 안 하고 통과하는(헛도는) 케이스가 생긴다.
    const withMin = defs.filter((d) => d.params.some((s) => s.min != null));

    it("하한을 가진 술어가 실제로 여럿이다", () => {
        expect(withMin.length).toBeGreaterThan(3);
    });

    it.each(withMin.map((d) => [d.kind, d.title] as const))(
        "%s(%s) — 하한 미만 값은 반드시 걸린다",
        (kind) => {
            const def = boardPredicateDef(kind)!;
            const text = Object.fromEntries((def.textParams ?? []).map((t) => [t.key, "채움"]));
            for (const s of def.params.filter((x) => x.min != null)) {
                const params = { ...defaultParams(kind), [s.key]: s.min! - 1 };
                expect(validatePredicates([{ kind, params, textParams: text }]), `${kind}.${s.key}`).not.toBeNull();
            }
        },
    );

    it.each(defs.filter((d) => (d.textParams?.length ?? 0) > 0).map((d) => [d.kind] as const))(
        "%s — 문자열 파라미터가 비면 반드시 걸린다",
        (kind) => {
            const def = boardPredicateDef(kind)!;
            for (const t of def.textParams ?? []) {
                const params = defaultParams(kind);
                for (const s of def.params) if (s.min != null) params[s.key] = s.min;
                expect(validatePredicates([{ kind, params, textParams: { [t.key]: "" } }])).not.toBeNull();
            }
        },
    );
});
