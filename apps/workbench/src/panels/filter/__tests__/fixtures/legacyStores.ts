// 사용자 localStorage 에 **실제로 들어 있을 수 있는** 저장물 원문 픽스처.
//
// 존재 이유 하나: `parseStages` 는 "모양이 안 맞으면 저장본 **통째 폐기**"라, 술어 유니온을 넓히는
// 손이 미끄러지는 순간 사용자의 조건·집합이 **전멸**한다. 그 사고는 개발 인스턴스에서 재현되지
// 않는다 — 포트가 다르면 localStorage origin 이 갈려서(3110 vs 3100) 사용자의 실제 저장물은
// 브라우저 실측으로도 볼 수 없다. 그래서 방어선은 여기 픽스처 + 골든 테스트뿐이다.
//
// 넣는 것: 술어 **9종 전부** × 승계형(scope 없는 group · slotId 밴드 · t 없는 결과 · 오염 payload).
// 새 종류를 유니온에 더할 때 이 파일도 같이 늘린다 — 골든이 그때 새 값을 요구하므로 잊기 어렵다.

/** 옛 작업 깔때기(`wb.filterStages.v4`)의 원문 모양 — 술어 9종을 한 벌에 담았다. */
export const LEGACY_STAGES: unknown = [
    {
        id: "s1",
        name: "그룹·날짜",
        enabled: true,
        predicates: [
            // scope 없던 시절 — 부재는 "day" 로 승계된다(point 그룹도 ∃ 상향).
            { kind: "group", expr: { groups: [{ literals: [{ groupId: "형태: 돌파", neg: false }] }] } },
            { kind: "date", ranges: [{ from: "2026-07-01", to: "2026-07-31" }] },
        ],
    },
    {
        id: "s2",
        enabled: false,
        predicates: [
            // 옛 밴드 경계 = slotId 문자열 → migrateBand 가 열린 경계로 떨군다.
            { kind: "axisBand", axisId: "a1", band: { lo: "52", hi: "A|2026-07-24|09:31:00" } },
            { kind: "axisValue", axisId: "c:baselinePrevUn", ranges: [{ from: { kind: "value", value: 5 } }] },
        ],
    },
    {
        id: "s3",
        enabled: true,
        predicates: [
            { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
            // payload 오염(객체) — 관대한 병합이라 **기본값이 채운다**(통째 폐기가 아니다).
            { kind: "themeStrength", params: { 깨진: true } },
        ],
    },
    {
        id: "s5",
        enabled: true,
        // payload 가 **객체조차 아닌** 오염 — 이때만 조건-off 로 살아난다(지어낸 활성 조건보다 정직하다).
        predicates: [{ kind: "themeStrength", params: "nope" }],
    },
    {
        id: "s4",
        enabled: true,
        predicates: [
            { kind: "outcome", metric: "extHigh", t: 5, ranges: [{ from: { kind: "value", value: 3 } }] },
            { kind: "outcomeRecovery", recovered: true, t: 5 },
            { kind: "hotPoints", w: 30, r: 3, ranges: [{ from: { kind: "value", value: 2 } }] },
        ],
    },
];

/** 옛 저장 집합(`wb.savedSets.v3`) 원문 — 우주 선언이 없던 시절(부재 = 종단). */
export const LEGACY_SAVED_SETS: unknown = [
    {
        id: "set1",
        name: "돌파 · 7월",
        stages: LEGACY_STAGES,
        part: { kind: "survivors" },
        // pointDef 없던 시절의 집합 — 필드 생략(열 때 현재 정의 유지). 집합 폐기 사유가 아니다.
    },
    {
        id: "set2",
        name: "부위 지정",
        stages: [],
        part: { kind: "cell", stageId: "s1", cells: ["fail"] },
        pointDef: { baselineGateEok: 30, mergeRisePct: 1.5 },
    },
    {
        // 부위가 깨져 있던 집합 — 이제는 부위 자체가 없어 그냥 산다(2026-09-19 5칸 진단 은퇴).
        id: "set3",
        name: "부위 깨짐",
        stages: [],
        part: { kind: "cell", stageId: "s1" },
    },
];

/** 조립(`wb.setAssemblies.v1`) 원문 — 부품 참조만 든다. */
export const LEGACY_ASSEMBLIES: unknown = [
    { id: "asm1", name: "합집합", members: [{ setId: "set1", enabled: true }, { setId: "없는집합", enabled: true }] },
];
