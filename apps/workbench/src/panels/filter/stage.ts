// 필터 단계 모델(순수) — 깔때기가 세는 **조건의 모양**. 판정도 정산도 여기 없다.
//   · 정산(상류 AND·5칸·한계 기여도) = core/market 의 funnel — 술어를 모른다.
//   · 판정(이 항목이 이 조건에 맞나) = 종류별 평가기 — 재료(멤버십·배치줄·날짜)를 안다.
//   · 모양(무슨 조건이 몇 단계로 놓였나) = 여기.
//
// **조건은 패널의 소유물이 아니다.** "그룹 A 소속"이 술어 객체가 되는 순간 그 조건은 배치 보드도 시트도
// 아닌 한 곳에 모여 순서 변경·on/off·저장이 된다. 옛 모양(rankFilterSlice)은 차원별로 자리가 정해진
// **평평한 가방**이라 순서라는 개념 자체가 없었다 — 깔때기가 요구하는 건 순서 있는 단계 리스트다.
//
// ⚠ 알갱이(grain)는 **저장하지 않고 파생한다.** 그룹의 scope 는 사전에, 축의 scope 는 축 목록에 있고
// 그것들은 나중에 바뀔 수 있다. 저장해 두면 조용히 스테일이 되고, 스테일 알갱이는 결과 해상도를 틀리게
// 만드는데 화면에서는 그게 안 보인다.
import type { GroupExpr } from "../rank/groupFilter.js";
import { NO_TAGS, isGroupExprEmpty } from "../rank/groupFilter.js";
import type { AxisValueRange, DateRange, RankBand, TimeRange } from "../../store/rankFilterSlice.js";

/** 판정 알갱이 — 그룹 scope·축 scope 와 같은 어휘("day" | "point"). core/funnel 의 Grain 과 같은 값. */
export type Grain = "day" | "point";

/**
 * 술어 하나. payload 는 기존 차원 타입을 **그대로 재사용**한다(밴드·값구간·날짜·시간·DNF) — 조건의
 * 뜻이 달라진 게 아니라 놓이는 자리가 달라진 것뿐이라, 여기서 새 표현을 발명하면 편집 UI 를 통째로 다시 짜야 한다.
 */
export type FilterPredicate =
    | { kind: "group"; expr: GroupExpr }
    | { kind: "axisBand"; axisId: string; band: RankBand }
    | { kind: "axisValue"; axisId: string; ranges: AxisValueRange[] }
    | { kind: "date"; ranges: DateRange[] }
    | { kind: "time"; ranges: TimeRange[] };

export type PredicateKind = FilterPredicate["kind"];

/** 단계 하나 — 술어들의 AND. 단계끼리도 AND 지만, 나뉘어 있어야 "어느 단계가 무엇을 죽였나"를 물을 수 있다. */
export interface FilterStage {
    id: string;
    /** 손으로 준 이름. 없으면 조건에서 자동 라벨. */
    name?: string;
    /** 끈 단계는 평가에서 통째로 빠진다 — 지우지 않고 잠깐 빼보는 게 한계 기여도를 눈으로 확인하는 손짓이다. */
    enabled: boolean;
    predicates: FilterPredicate[];
}

/** 조건이 하나도 없는 술어(빈 식·빈 배열·빈 밴드) — 평가에서 빼야 "무제한"이 "전부 미배치"로 안 뒤집힌다. */
export function isPredicateEmpty(p: FilterPredicate): boolean {
    switch (p.kind) {
        case "group": return isGroupExprEmpty(p.expr);
        case "axisBand": return !p.band.lo && !p.band.hi;
        case "axisValue": return p.ranges.length === 0;
        case "date": return p.ranges.length === 0;
        case "time": return p.ranges.length === 0;
    }
}

/** 실제로 평가에 들어가는 단계 — 켜져 있고 빈 술어가 아닌 게 하나라도 있는 것. */
export function activeStages(stages: readonly FilterStage[]): FilterStage[] {
    return stages.filter((s) => s.enabled && s.predicates.some((p) => !isPredicateEmpty(p)));
}

/** 알갱이 판정에 필요한 바깥 지식 — 사전이 답한다(없는 id = 지워진 그룹·축). */
export interface GrainLookup {
    groupScope: (groupId: string) => Grain | undefined;
    axisScope: (axisId: string) => Grain | undefined;
}

/**
 * 이 술어를 판정하려면 어느 알갱이까지 내려가야 하나.
 *   · 날짜 = 하루 · 시간 = 타점(시각 없이는 판정 자체가 불가)
 *   · 그룹 = 참조 그룹 중 하나라도 타점 scope 면 타점. "그룹 없음"(NO_TAGS)은 알갱이를 안 정한다 —
 *     그것만 있으면 하루로 남고, 옆의 다른 리터럴이 알갱이를 말하게 둔다.
 *   · 축 = 그 축의 scope. **모르는 축은 하루**로 본다 — 지워진 축 참조 하나가 화면 전체를 타점으로
 *     끌어내리면, 죽은 조건 때문에 멀쩡한 결과가 가짜 정밀도로 펼쳐진다.
 */
export function predicateGrain(p: FilterPredicate, look: GrainLookup): Grain {
    switch (p.kind) {
        case "date": return "day";
        case "time": return "point";
        case "axisBand":
        case "axisValue": return look.axisScope(p.axisId) ?? "day";
        case "group": {
            for (const g of p.expr.groups) {
                for (const l of g.literals) {
                    if (l.groupId === NO_TAGS) continue;
                    if (look.groupScope(l.groupId) === "point") return "point";
                }
            }
            return "day";
        }
    }
}

/** 단계의 알갱이 = 그 술어들 중 가장 가는 것. */
export function stageGrain(s: FilterStage, look: GrainLookup): Grain {
    for (const p of s.predicates) {
        if (isPredicateEmpty(p)) continue;
        if (predicateGrain(p, look) === "point") return "point";
    }
    return "day";
}

/**
 * 결과 해상도(자동) — 걸린 단계 중 가장 가는 알갱이. 아무것도 안 걸렸으면 하루.
 * 아무 조건도 구분하지 못하는 타점 5개를 5행으로 펼치면 조건 열이 전부 같은 행 다섯이 되어
 * **없는 구조를 눈이 만든다**(가짜 정밀도). 그래서 자동이고 토글이 아니다.
 */
export function autoGrain(stages: readonly FilterStage[], look: GrainLookup): Grain {
    for (const s of activeStages(stages)) if (stageGrain(s, look) === "point") return "point";
    return "day";
}

/**
 * 표시 해상도 — 자동 위치에서 **아래로만** 내려갈 수 있다(하루 → 타점).
 *
 * ⚠ 위로(타점 → 하루)는 막는다. 올리려면 "타점 3개는 통과, 2개는 탈락인 하루는 통과인가"라는 롤업
 * 규칙이 필요한데 정답이 없고, 어떻게 정하든 그 임의의 규칙이 5칸 숫자에 조용히 섞인다.
 * 아래로는 안전하다 — 하루 조건을 타점에 주면 그 하루의 모든 타점이 같은 값을 받고, 실제로 같은 값이라
 * 정직한 반복이다. 그래서 사다리는 사실상 토글 하나("타점으로 펼치기")로 줄어든다.
 */
export function displayGrain(auto: Grain, expandToPoints: boolean): Grain {
    return auto === "point" ? "point" : expandToPoints ? "point" : "day";
}

/** 내리기 손잡이를 줄 수 있나 — 이미 타점이면 더 내려갈 데가 없다. */
export const canExpand = (auto: Grain): boolean => auto === "day";

// ── 편집 연산(전부 불변) ────────────────────────────────────────────────────

export const newStageId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addStage(stages: readonly FilterStage[], predicates: FilterPredicate[] = []): FilterStage[] {
    return [...stages, { id: newStageId(), enabled: true, predicates }];
}

export function removeStage(stages: readonly FilterStage[], id: string): FilterStage[] {
    return stages.filter((s) => s.id !== id);
}

export function toggleStage(stages: readonly FilterStage[], id: string): FilterStage[] {
    return stages.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
}

/** 단계 순서 바꾸기 — 결과는 안 변하고 **이야기만** 바뀐다(어느 단계가 무엇을 죽였나). */
export function moveStage(stages: readonly FilterStage[], from: number, to: number): FilterStage[] {
    if (from === to || from < 0 || from >= stages.length || to < 0 || to >= stages.length) return [...stages];
    const next = [...stages];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m!);
    return next;
}

export function setStagePredicates(stages: readonly FilterStage[], id: string, predicates: FilterPredicate[]): FilterStage[] {
    return stages.map((s) => (s.id === id ? { ...s, predicates } : s));
}

export function renameStage(stages: readonly FilterStage[], id: string, name: string): FilterStage[] {
    const trimmed = name.trim();
    return stages.map((s) => (s.id === id ? { ...s, name: trimmed === "" ? undefined : trimmed } : s));
}

// ── 영속 검증 ──────────────────────────────────────────────────────────────

/**
 * 저장본 파싱 — 형태가 안 맞는 항목은 **통째로 버린다**(부분 복구 안 함). 반쯤 살아난 조건은
 * 화면에 멀쩡히 뜨면서 다른 걸 세기 때문에, 없는 편이 낫다.
 */
export function parseStages(o: unknown): FilterStage[] | null {
    if (!Array.isArray(o)) return null;
    const out: FilterStage[] = [];
    for (const raw of o) {
        const s = raw as { id?: unknown; name?: unknown; enabled?: unknown; predicates?: unknown };
        if (typeof s?.id !== "string" || !Array.isArray(s.predicates)) return null;
        const predicates: FilterPredicate[] = [];
        for (const p of s.predicates) {
            const parsed = parsePredicate(p);
            if (!parsed) return null;
            predicates.push(parsed);
        }
        out.push({
            id: s.id,
            name: typeof s.name === "string" ? s.name : undefined,
            enabled: s.enabled !== false,
            predicates,
        });
    }
    return out;
}

function parsePredicate(o: unknown): FilterPredicate | null {
    const p = o as { kind?: unknown; axisId?: unknown; ranges?: unknown; band?: unknown; expr?: unknown };
    switch (p?.kind) {
        case "group":
            return p.expr && typeof p.expr === "object" ? { kind: "group", expr: p.expr as GroupExpr } : null;
        case "axisBand":
            return typeof p.axisId === "string" && p.band && typeof p.band === "object"
                ? { kind: "axisBand", axisId: p.axisId, band: p.band as RankBand } : null;
        case "axisValue":
            return typeof p.axisId === "string" && Array.isArray(p.ranges)
                ? { kind: "axisValue", axisId: p.axisId, ranges: p.ranges as AxisValueRange[] } : null;
        case "date":
            return Array.isArray(p.ranges) ? { kind: "date", ranges: p.ranges as DateRange[] } : null;
        case "time":
            return Array.isArray(p.ranges) ? { kind: "time", ranges: p.ranges as TimeRange[] } : null;
        default:
            return null;
    }
}
