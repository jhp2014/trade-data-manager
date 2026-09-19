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
import { LEGACY_SAVED_SETS, LEGACY_STAGES } from "./fixtures/legacyStores.js";

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
    it("③ 전멸 감지 + 개수 보존 — 옛 부위(part)는 통째로 무시된다(2026-09-19 5칸 은퇴)", () => {
        const sets = parseSavedSets(LEGACY_SAVED_SETS);
        expect(sets).not.toBeNull();
        expect(sets).toHaveLength(3); // 옛 부위가 무엇이었든(깨진 것 포함) 집합은 전부 산다
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
