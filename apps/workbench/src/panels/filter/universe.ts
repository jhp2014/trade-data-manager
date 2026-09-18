// 우주(universe)와 **결손 지도** — "이 술어를 이 우주에서 쓸 수 있나"의 단일 출처.
// 규칙 전문은 .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 대수는 한 벌이다 — 쓸 수 없는 술어는 "불가"가 아니라 **결손**이다
// 팔레트에서 숨기지 않고 **회색 + 이유**로 세운다. 그래야 (a) 같은 조건을 다른 우주로 옮겼을 때
// 왜 다르게 걸리는지 화면이 말할 수 있고, (b) 나중에 재료가 생기면 **문법 변경 없이** 켜진다.
// 숨기는 순간 "그 우주엔 그런 문법이 없다"가 되어, 재료가 생겨도 합치는 공사가 다시 필요해진다.
//
// ## 이유는 두 갈래다(문구로 구분한다)
//  · **원리적 결손** — 그 우주에 그 재료가 존재할 수 없다(종단 행에는 "직전 분"이 없다).
//  · **미구현 결손** — 재료는 있는데 아직 안 물렸다(하루 우주의 그룹 라벨 — ③ 에서 켜진다).
// 둘을 섞으면 "언젠가 켜질 것"과 "영원히 아닐 것"을 사용자가 구분할 수 없다.
//
// ⚠ 이 파일의 스위치에는 **자물쇠**(unknownPredicate)가 있다 — 새 술어 종류를 더하는 손이
//   결손 지도를 그냥 지나치면, 그 종류는 모든 우주에서 조용히 "가용"이 되어 엉뚱한 우주에서
//   영영 거짓으로 평가된다. 컴파일 에러로 여기를 만나게 하는 것이 자물쇠의 존재 이유 전부다.
import { unknownPredicate, type FilterPredicate, type FilterStage, type PredicateKind } from "./stage.js";

/**
 * 우주 — **2치**다. 설계의 2×2 중 낟알(day/point)은 조건에서 파생하고(stage.ts 머리 주석의 규칙),
 * `day×하루`(그날 유니버스 270종목)는 선언만 두고 UI 를 숨긴다 — 켜는 날 `grain?` 을 additive 로
 * 더하면 되고, 그때까지 값을 늘리지 않는 편이 분기를 안 만든다.
 */
export type Universe = "longitudinal" | "daily";

export const UNIVERSES: readonly Universe[] = ["longitudinal", "daily"];

/** 뱃지 문구 — 화면에서 우주를 말하는 유일한 어휘(패널마다 다른 말을 쓰지 않게). */
export const UNIVERSE_LABEL: Record<Universe, string> = {
    longitudinal: "종단 · 좌표",
    daily: "하루 · 셀",
};

/** 저장물 승계 — 부재·오염은 **종단**이다(우주 선언이 없던 시절 저장물의 행동 그대로). */
export const parseUniverse = (v: unknown): Universe => (v === "daily" ? "daily" : "longitudinal");

/**
 * 종류만 보고 답하는 결손(payload 무관) — 팔레트 회색의 재료.
 * null = 가용. 문자열 = 회색 + 그 이유(title).
 */
export function kindDeficiency(k: PredicateKind, u: Universe): string | null {
    if (u === "longitudinal") {
        switch (k) {
            case "cellValue":
                return "분봉 재료(등락률·누적대금·분봉고가)는 하루 단면에만 있다 — 종단 행은 좌표 하나다";
            case "priorHighBreak":
                return "직전 거래일 고가(trailingHighs)는 하루 재료다";
            case "gridPoint":
                return "종단 격자 번들은 있으나 이 우주의 판정기가 아직 없다";
            default:
                return null;
        }
    }
    switch (k) {
        case "axisBand":
            return "배치줄은 종단 축의 행 인덱스다 — 셀은 축의 행이 아니다";
        case "axisValue":
            return "계산 축 값의 행 키는 라벨 좌표다 — 셀에는 그 키가 없다";
        case "date":
            return "하루 우주는 날짜가 정의가 아니라 변수다(전역 시선이 값을 준다)";
        case "outcome":
        case "outcomeRecovery":
            return "결과 걷기의 앵커는 라벨 좌표다";
        case "hotPoints":
            return "격자 파생 축(좌표 축)이라 셀에는 값이 없다";
        case "group":
            return "좌표 라벨 재료는 있으나 하루 엔진에 아직 안 물렸다(라벨 층에서 켜진다)";
        case "themeStrength":
            return "분 단면 재료는 있다 — 지금은 '존순위' 셀 값 술어가 같은 일을 한다";
        default:
            return null;
    }
}

/**
 * payload 까지 보는 결손 — 빈 배열이면 가용. 종류 결손에 **payload 결손**이 더해진다:
 *  · 전이 수식어는 종단에서 결손(종단 행에는 "직전 분"이 없다).
 *  · 타점 앵커 경계(`kind:"point"`)는 하루에서 결손(앵커 사전이 없다 — core 파서가 이미 "받아들이되 평가에서 결손").
 */
export function predicateDeficiency(p: FilterPredicate, u: Universe): string[] {
    const out: string[] = [];
    const byKind = kindDeficiency(p.kind, u);
    if (byKind) out.push(byKind);

    switch (p.kind) {
        case "time":
        case "cellValue":
        case "priorHighBreak":
        case "gridPoint":
            if (p.transition && u === "longitudinal") out.push("전이 수식어는 시계열 위에서만 뜻이 있다 — 종단 행에는 '직전 분'이 없다");
            break;
        case "axisValue":
        case "outcome":
        case "hotPoints":
            if (u === "daily" && p.ranges.some((r) => r.from?.kind === "point" || r.to?.kind === "point")) {
                out.push("타점 앵커 경계는 하루 우주에서 풀 수 없다(앵커 사전이 없다)");
            }
            break;
        case "group":
        case "axisBand":
        case "date":
        case "themeStrength":
        case "outcomeRecovery":
            break;
        default:
            return unknownPredicate(p); // 자물쇠 — 새 종류는 반드시 여기를 지난다
    }
    // cellValue 의 경계는 core 가 value 만 받으므로 별도 검사가 없다(payload 상 point 가 못 들어온다).
    return out;
}

/** 칸 하나의 결손 — 술어들의 이유를 모은다(중복 제거). 빈 배열 = 이 우주에서 온전히 평가된다. */
export function stageDeficiency(s: FilterStage, u: Universe): string[] {
    const out = new Set<string>();
    for (const p of s.predicates) for (const r of predicateDeficiency(p, u)) out.add(r);
    return [...out];
}

/** 복제 경고 — 이 조건들을 저 우주로 옮기면 무엇이 결손이 되나(칸 단위로 묶어 사람이 읽게). */
export function cloneDeficiencies(
    stages: readonly FilterStage[],
    to: Universe,
): { stageId: string; reasons: string[] }[] {
    const out: { stageId: string; reasons: string[] }[] = [];
    for (const s of stages) {
        const reasons = stageDeficiency(s, to);
        if (reasons.length > 0) out.push({ stageId: s.id, reasons });
    }
    return out;
}
