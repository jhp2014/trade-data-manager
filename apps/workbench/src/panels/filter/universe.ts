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
import type { SetExpr } from "./expr.js";

/**
 * 우주 — **2치**다. 설계의 2×2 중 낟알(day/point)은 조건에서 파생하고(stage.ts 머리 주석의 규칙),
 * `day×하루`(그날 유니버스 270종목)는 선언만 두고 UI 를 숨긴다 — 켜는 날 `grain?` 을 additive 로
 * 더하면 되고, 그때까지 값을 늘리지 않는 편이 분기를 안 만든다.
 */
export type Universe = "longitudinal" | "daily";

export const UNIVERSES: readonly Universe[] = ["longitudinal", "daily"];

/**
 * 뱃지 문구 — 화면에서 우주를 말하는 유일한 어휘(패널마다 다른 말을 쓰지 않게).
 * 꼬리표(`· 좌표`/`· 셀`)는 2026-09-21 에 뗐다 — 모드 스위치가 상시라 낱말 하나면 읽힌다.
 */
export const UNIVERSE_LABEL: Record<Universe, string> = {
    longitudinal: "종단",
    daily: "하루",
};

/**
 * 고른 모드와 집합이 어긋났나 — 어긋났으면 사람이 읽을 한 줄, 아니면 null.
 *
 * 모드는 팔레트를 처음부터 가르므로 이 상태는 **드물다**(조건을 든 채 모드를 손으로 바꿀 때만).
 * 그래도 조용히 두면 "하루라고 적힌 머리글 아래 종단 결과"가 서므로 화면이 말해야 한다.
 */
export function modeMismatch(mode: Universe, derived: Universe | null): string | null {
    if (derived === null || derived === mode) return null;
    return derived === "daily"
        ? "이 집합은 **하루** 조건으로 이뤄져 있습니다 — 하루 모드에서 봐야 제 수가 나옵니다."
        : "이 집합은 **종단** 조건으로 이뤄져 있습니다 — 종단 모드에서 봐야 제 수가 나옵니다.";
}

/** 저장물 승계 — 부재·오염은 **종단**이다(우주 선언이 없던 시절 저장물의 행동 그대로). */
export const parseUniverse = (v: unknown): Universe => (v === "daily" ? "daily" : "longitudinal");

/**
 * 이 술어 종류가 **한 우주에만** 살 수 있나 — 그 우주를 돌려준다(둘 다 되면 null).
 * 우주 **파생**(2026-09-19 9단계)의 유일한 자다: 조건이 우주를 정하지, 사람이 토글로 정하지 않는다.
 */
export function committingUniverse(k: PredicateKind): Universe | null {
    const inLong = kindDeficiency(k, "longitudinal") === null;
    const inDay = kindDeficiency(k, "daily") === null;
    if (inLong === inDay) return null; // 둘 다 되거나(중립) 둘 다 안 되면(어디서도 결손) 우주를 못 정한다
    return inLong ? "longitudinal" : "daily";
}

/**
 * 이 조건들이 정하는 우주 — **null = 아직 안 정해짐**(중립 조건만 있거나 조건이 없다).
 *
 * ⚠ 선언이 아니라 파생인 이유: 우주가 정하던 셋(셀 수·결손 지도·날짜 변수)이 전부 조건에서 계산되기
 * 때문이다. 그래서 토글이 없고, **첫 한쪽-전용 조건이 우주를 정한 뒤로는 반대편이 팔레트에서
 * 회색(결손+이유)으로 선다** — 잠그는 것이 아니라 "여기선 평가할 수 없다"는 사실을 말하는 것이다.
 * 중립뿐이면 null 이고, 그때는 아무것도 회색이 아니다(아직 아무 쪽도 아니므로).
 */
export function universeOfStages(stages: readonly { predicates: readonly { kind: PredicateKind }[] }[]): Universe | null {
    for (const s of stages) {
        for (const p of s.predicates) {
            const u = committingUniverse(p.kind);
            if (u !== null) return u;
        }
    }
    return null;
}

/**
 * 식 하나가 정하는 우주 — 조건 잎뿐 아니라 **참조도 본다**.
 *
 * ⚠ 참조를 빼면 `A ∨ B`(둘 다 하루 집합)처럼 **조건 잎이 하나도 없는 조립**이 종단으로 파생돼,
 * 하루 패널이 제 집합을 못 찾는다. `universeOfRef` 는 저장물이 들고 있는 값을 그대로 돌려주면
 * 된다 — 저장 시점에 같은 규칙으로 파생해 굳혔으므로 재귀가 필요 없다(순환은 저장 때 거절된다).
 *
 * 먼저 만나는 **한쪽-전용**이 정한다(좌→우). 둘이 엇갈리는 식(하루 조건 ∧ 종단 참조)은 여기서
 * 막지 않는다 — 결손 지도가 그 자리를 회색으로 말하는 것이 이 설계의 규칙이다(대수는 한 벌).
 */
export function universeOfExpr(e: SetExpr, universeOfRef: (setId: string) => Universe | null): Universe | null {
    for (const t of e.of) {
        if (t.kind === "cond") {
            for (const p of t.stage.predicates) {
                const u = committingUniverse(p.kind);
                if (u !== null) return u;
            }
            continue;
        }
        const u = universeOfRef(t.setId);
        if (u !== null) return u;
    }
    return null;
}

/** 평가·표시가 쓰는 확정값 — 중립(null)은 **종단**으로 떨어진다(우주가 없던 시절의 행동 그대로). */
export const effectiveUniverse = (u: Universe | null): Universe => u ?? "longitudinal";

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
            case "breakout":
            case "candleShape":
                // 원리적 결손이 아니다 — 라벨 좌표도 그날 분봉 안에 있다. 종단 판정기를 안 물렸을 뿐(종단 보류).
                return "일별 타점[조건]의 조건 — 종단에는 아직 판정기가 안 물렸다";
            // ⚠ theme 는 **종류 층에서 중립**이다(decisions 2026-09-26) — 여기서 종단 결손으로 답하면
            //   committingUniverse 가 하루 전용으로 읽어, themeStrength → theme 이주 때 종단 저장 집합의
            //   우주 파생이 하루로 뒤집힌다(숨겨 둔 집합이 목록에 나타난다). 결손은 payload 층이 말한다.
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
        case "breakout":
        case "candleShape":
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
        case "outcomeRecovery":
            break;
        case "theme":
            // 종류 층은 중립(위 kindDeficiency 주석) — 종단 결손은 payload 층인 여기가 말한다.
            if (u === "longitudinal") out.push("테마 존 판정은 하루 분 단면 위에서만 돈다 — 종단에는 판정기가 없다");
            if (p.transition && u === "longitudinal") out.push("전이 수식어는 시계열 위에서만 뜻이 있다 — 종단 행에는 '직전 분'이 없다");
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
