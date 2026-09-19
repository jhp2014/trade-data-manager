// 하위호환 골든 — ② (술어 어휘 물리 합류)의 **유일한 방어선**.
//
// `parseStages` 는 모양이 안 맞으면 저장본을 통째로 버린다. 유니온에 종류를 더하는 손이 미끄러지면
// 사용자의 조건·집합이 전멸하는데, 그 사고는 개발 인스턴스에서 재현되지 않는다(localStorage origin 이
// 포트별로 갈린다 — 3110 ≠ 3100). 그래서 여기 셋이 기계가 지키는 전부다:
//   ① 골든  — 옛 저장물의 파싱 **결과 자체**를 고정한다(어떤 편집도 이 값을 못 바꾼다).
//   ② 왕복  — 저장→로드 왕복에서 필드가 증발하지 않는다(새 옵셔널 필드가 왕복에서 떨어지면 걸린다).
//   ③ 전멸  — 어떤 픽스처도 null 이 아니다(= 통째 폐기 0건).
import { describe, it, expect } from "vitest";
import { parseStages } from "../stage.js";
import { parseSavedSets } from "../../../store/savedSetsSlice.js";
import { parseLegacyAssemblies } from "../legacyAssemblies.js";
import { LEGACY_ASSEMBLIES, LEGACY_SAVED_SETS, LEGACY_STAGES } from "./fixtures/legacyStores.js";

const roundTrip = <T,>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe("옛 작업 깔때기 저장물", () => {
    it("③ 전멸 감지 — 통째 폐기가 한 건도 없다", () => {
        expect(parseStages(LEGACY_STAGES)).not.toBeNull();
    });

    it("① 골든 — 파싱 결과가 글자까지 고정이다(승계 규칙 전부 포함)", () => {
        expect(parseStages(LEGACY_STAGES)).toEqual([
            {
                id: "s1",
                name: "그룹·날짜",
                enabled: true,
                predicates: [
                    // scope 부재 = day 승계(point 그룹도 ∃ 상향으로 읽히던 그 행동)
                    { kind: "group", expr: { groups: [{ literals: [{ groupId: "형태: 돌파", neg: false }] }] }, scope: "day" },
                    { kind: "date", ranges: [{ from: "2026-07-01", to: "2026-07-31" }] },
                ],
            },
            {
                id: "s2",
                name: undefined,
                enabled: false,
                predicates: [
                    // slotId 경계는 떨구고 타점 앵커만 남긴다(migrateBand)
                    { kind: "axisBand", axisId: "a1", band: { hi: "A|2026-07-24|09:31:00" } },
                    { kind: "axisValue", axisId: "c:baselinePrevUn", ranges: [{ from: { kind: "value", value: 5 } }] },
                ],
            },
            {
                id: "s3",
                name: undefined,
                enabled: true,
                predicates: [
                    { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
                    // 오염 payload(객체) = **기본값 병합**으로 살아난다(통째 폐기보다 정직하고 덜 파괴적)
                    { kind: "themeStrength", params: expect.objectContaining({ countOn: true, basis: "rate" }) },
                ],
            },
            {
                id: "s5",
                name: undefined,
                enabled: true,
                // 객체조차 아닌 오염은 **조건-off** — 지어낸 활성 조건으로 모수를 좁히지 않는다
                predicates: [{ kind: "themeStrength", params: expect.objectContaining({ countOn: false, baseRankOn: false, zoneRankOn: false }) }],
            },
            {
                id: "s4",
                name: undefined,
                enabled: true,
                predicates: [
                    { kind: "outcome", metric: "extHigh", t: 5, ranges: [{ from: { kind: "value", value: 3 } }] },
                    { kind: "outcomeRecovery", recovered: true, t: 5 },
                    { kind: "hotPoints", w: 30, r: 3, ranges: [{ from: { kind: "value", value: 2 } }] },
                ],
            },
        ]);
    });

    it("② 왕복 항등 — 저장→로드에서 필드가 증발하지 않는다", () => {
        const once = parseStages(LEGACY_STAGES);
        expect(parseStages(roundTrip(once))).toEqual(once);
    });
});

describe("옛 저장 집합", () => {
    it("③ 전멸 감지 + 옛 '짚은 칸' 부위 집합만 버린다(2026-09-19 5칸 은퇴)", () => {
        const sets = parseSavedSets(LEGACY_SAVED_SETS);
        expect(sets).not.toBeNull();
        // set2·set3(부위=칸)만 버려진다 — 목록 통째 폐기가 아니다. 조용히 생존자로 넓히지 않는 이유는
        // savedSetsSlice.parseSavedSets 주석 참조(이름만 같은 다른 모수가 된다).
        expect(sets!.map((s) => s.id)).toEqual(["set1"]);
        for (const s of sets!) expect(s).not.toHaveProperty("part");
    });

    it("우주 선언이 없던 저장물은 **종단**으로 승계된다(부재 = longitudinal)", () => {
        const sets = parseSavedSets(LEGACY_SAVED_SETS)!;
        for (const s of sets) expect(s.universe, s.name).toBe("longitudinal");
    });

    it("② 왕복 항등 — 집합도 저장→로드에서 그대로다", () => {
        const once = parseSavedSets(LEGACY_SAVED_SETS);
        expect(parseSavedSets(roundTrip(once))).toEqual(once);
    });
});

// 조립층은 2026-09-19 에 철거됐지만 **저장물은 재워 뒀다** — 5단계 식 트리가 `OR(참조…)` 로 승계할
// 재료다. 그 파서(legacyAssemblies)는 소비자가 0이라 아무도 안 보는 채로 썩을 수 있으므로, 승계가
// 실제로 읽게 될 모양을 여기서 못 박는다. **죽은 부품(지워진 setId)도 거르지 않는다** — 승계가
// "그때 그 사용자가 실제로 보던 것"을 읽어야 하고, 무엇이 죽었는지는 승계 시점에 판단할 일이다.
describe("옛 조립(재워 둔 저장물 — 5단계 승계의 입력)", () => {
    it("① 골든 — 파싱 결과가 글자까지 고정이다", () => {
        expect(parseLegacyAssemblies(LEGACY_ASSEMBLIES)).toEqual([
            { id: "asm1", name: "합집합", members: [{ setId: "set1", enabled: true }, { setId: "없는집합", enabled: true }] },
        ]);
    });

    it("② 왕복 항등", () => {
        const once = parseLegacyAssemblies(LEGACY_ASSEMBLIES);
        expect(parseLegacyAssemblies(roundTrip(once))).toEqual(once);
    });

    it("③ 전멸 감지 — 통째 폐기가 없다", () => {
        expect(parseLegacyAssemblies(LEGACY_ASSEMBLIES)).not.toBeNull();
    });
});
