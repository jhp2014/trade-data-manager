// 필터 단계 모델(순수) — 깔때기가 세는 **조건의 모양**. 판정도 정산도 여기 없다.
//   · 정산(상류 AND·5칸·한계 기여도) = core/market 의 funnel — 술어를 모른다.
//   · 판정(이 항목이 이 조건에 맞나) = 종류별 평가기 — 재료(멤버십·배치줄·날짜)를 안다.
//   · 모양(무슨 조건이 몇 단계로 놓였나) = 여기.
//
// **조건은 패널의 소유물이 아니다.** "그룹 A 소속"이 술어 객체가 되는 순간 그 조건은 배치 보드도 시트도
// 아닌 한 곳에 모여 순서 변경·on/off·저장이 된다. 옛 모양(rankFilterSlice)은 차원별로 자리가 정해진
// **평평한 가방**이라 순서라는 개념 자체가 없었다 — 깔때기가 요구하는 건 순서 있는 단계 리스트다.
//
// ⚠ 알갱이(grain)는 **저장하지 않고 파생한다.** 저장하면 진실이 둘이 된다 — 저장된 알갱이와 실제 사전.
// 어긋나는 순간 어느 쪽이 맞는지 판단할 근거가 없다(그룹·축의 scope 는 만들 때 정해지고 바뀌지 않지만,
// **지워지기는 한다** — 단계는 로컬이고 축은 DB라 죽은 참조가 남는다. 계산 축에 day 알갱이가 들어오면
// 저장본은 옛 값을 든 채 남는다). 파생하면 사전 하나뿐이라 어긋날 수가 없다.
//
// ⚠ 알갱이는 **3치**다: day · point · undefined(모름). "모른다"를 "하루다"로 뭉개면 사전이 로딩 중일 때도
// 확답을 주게 되어, 사전이 도착하는 순간 해상도가 튀고 결과 목록이 통째로 다시 그려진다. 이 앱이 이미
// 쓰는 규칙과 같다(evalPredicate·and3) — "아니다"와 "모른다"는 섞지 않는다. 모름을 어떻게 다룰지는
// **사전 로드 여부를 아는 소비자**의 몫이다(로딩 중 = 보류 / 로드 끝났는데 없음 = 죽은 참조).
import type { Grain } from "@trade-data-manager/market/domain";
import type { GroupExpr } from "../rank/groupFilter.js";
import { isGroupExprEmpty, noneScope, parseGroupExpr } from "../rank/groupFilter.js";
import { DEFAULT_THEME_STRENGTH, anyConditionOn, parseThemeStrengthParams, type ThemeStrengthParams } from "../../lib/themeStrength.js";

// 판정 알갱이 — 도메인 공용 어휘(그룹 scope·축 scope·깔때기 Grain 이 전부 같은 타입). 여기서 재수출해
// 필터 모듈들은 stage 만 본다(도메인 경로가 바뀌어도 한 줄).
export type { Grain };

// ── 필터 차원의 모양 — 옛 rankFilterSlice 에서 이사 왔다(전역 필터 store 는 철거, 조건은 단계 안에만 산다).
/**
 * 배치 축 밴드 — 양 경계를 **타점 앵커**(pointKey 문자열)로 든다. 계산 축 경계(AxisBound)와 같은 규칙:
 * 자리(orderKey)는 reindex·재계산이 다시 쓰는 값이라 들고 있으면 뜻이 조용히 바뀌고, slotId 는 그 자리가
 * 비면 GC 되어 경계가 끊긴다. 타점은 (종목·날짜·시각) 자연키라 둘 다 안 겪는다.
 */
export interface RankBand {
    lo?: string; // 이상 경계(작은 orderKey 쪽)에 선 타점의 pointKey
    hi?: string; // 이하 경계(큰 orderKey 쪽)에 선 타점의 pointKey
}
export interface DateRange { from: string; to: string } // YYYY-MM-DD (양끝 포함)
export interface TimeRange { from: string; to: string } // HH:MM (양끝 포함)

/**
 * 계산 축 경계 — **타점 앵커가 기본**이고 값 직접 지정이 보조다.
 * 왜 앵커인가: 계산 축의 자리는 수식이 정한다. 수식을 고치면 모든 값이 움직이는데, 경계만 숫자로 굳어
 * 있으면 "이 타점보다 위"라는 원래 판단이 조용히 다른 뜻이 된다. 앵커로 두면 경계가 타점을 따라 움직인다.
 */
export type AxisBound = { kind: "point"; point: string } | { kind: "value"; value: number };
/** 한 구간. 한쪽이 없으면 반열림(그 방향 무제한) — "이 값 이상"이 자연스러운 조작이라. */
export interface AxisValueRange { from?: AxisBound; to?: AxisBound }

/**
 * 술어 하나. payload 는 기존 차원 타입을 **그대로 재사용**한다(밴드·값구간·날짜·시간·DNF) — 조건의
 * 뜻이 달라진 게 아니라 놓이는 자리가 달라진 것뿐이라, 여기서 새 표현을 발명하면 편집 UI 를 통째로 다시 짜야 한다.
 */
export type FilterPredicate =
    | { kind: "group"; expr: GroupExpr }
    | { kind: "axisBand"; axisId: string; band: RankBand }
    | { kind: "axisValue"; axisId: string; ranges: AxisValueRange[] }
    | { kind: "date"; ranges: DateRange[] }
    | { kind: "time"; ranges: TimeRange[] }
    // 테마 강도 묶음 — **파라미터가 payload 안에 산다**(SavedSet 이 stages 를 통째 복사하므로
    // 외부 참조로 두면 집합의 자립이 깨진다). 전 파라미터는 보드 행(레일·칩)에서 직접 편집한다.
    | { kind: "themeStrength"; params: ThemeStrengthParams };

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
        case "themeStrength": return !anyConditionOn(p.params); // 활성 하위 조건 0 = 무제한 통과
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
 * 여러 알갱이를 하나로 — **가장 가는 것**. point 를 만나면 즉시 확정된다(모름이 더 가늘게 만들 수는 없다).
 * point 가 없는데 모름이 섞였으면 모름 — 그 모름이 실은 point 였을 수 있어 day 라고 말할 수 없다.
 */
function finest(grains: Iterable<Grain | undefined>): Grain | undefined {
    let unknown = false;
    for (const g of grains) {
        if (g === "point") return "point";
        if (g === undefined) unknown = true;
    }
    return unknown ? undefined : "day";
}

/**
 * 이 술어를 판정하려면 어느 알갱이까지 내려가야 하나. **모르면 모른다고 한다**(undefined).
 *   · 날짜 = 하루 · 시간 = 타점(시각 없이는 판정 자체가 불가)
 *   · 축 = 그 축의 scope. 사전에 없으면 모름 — 로딩 중인지 지워진 건지는 여기서 알 수 없다.
 *   · 그룹 = 리터럴 중 가장 가는 것. "…그룹 없음"도 **제 층위를 말한다**(리터럴에 실려 있다) —
 *     한때 층위 없는 `@none` 하나뿐이라 "없음"만 든 필터가 늘 하루로 접혔고, 타점 칸에서 만들어도
 *     다시 열면 하루 칸에 서 있었다. 층위를 실으면서 그 자리도 같이 닫혔다.
 */
export function predicateGrain(p: FilterPredicate, look: GrainLookup): Grain | undefined {
    switch (p.kind) {
        case "date": return "day";
        case "time": return "point";
        case "axisBand":
        case "axisValue": return look.axisScope(p.axisId);
        case "group": return finest(literalIds(p.expr).map((id) => literalScope(id, look)));
        case "themeStrength": return "point"; // 단면 조회에 시각이 필수 — 행 정체성은 타점(보드 테마 칸은 UI 그룹핑)
    }
}

/** 식 안의 리터럴 id 전부(없음 리터럴 포함 — 그것도 층위를 말한다). */
const literalIds = (expr: GroupExpr): string[] =>
    expr.groups.flatMap((g) => g.literals.map((l) => l.groupId));

/** 리터럴 하나의 층위 — "없음"은 제가 들고 있고, 실제 그룹은 사전이 답한다(없는 id = 지워진 그룹). */
const literalScope = (groupId: string, look: GrainLookup): Grain | undefined =>
    noneScope(groupId) ?? look.groupScope(groupId);

/** 사전이 로드된 뒤에도 알갱이를 모르는 술어 = **죽은 참조**(지워진 그룹·축). 화면이 이걸 표시해야 한다. */
export function isPredicateDead(p: FilterPredicate, look: GrainLookup): boolean {
    return !isPredicateEmpty(p) && predicateGrain(p, look) === undefined;
}

/** 단계의 알갱이 = 그 술어들 중 가장 가는 것. 빈 술어는 알갱이를 안 정한다. */
export function stageGrain(s: FilterStage, look: GrainLookup): Grain | undefined {
    return finest(s.predicates.filter((p) => !isPredicateEmpty(p)).map((p) => predicateGrain(p, look)));
}

/**
 * 결과 해상도(자동) — 걸린 단계 중 가장 가는 알갱이. 아무것도 안 걸렸으면 하루.
 * 아무 조건도 구분하지 못하는 타점 5개를 5행으로 펼치면 조건 열이 전부 같은 행 다섯이 되어
 * **없는 구조를 눈이 만든다**(가짜 정밀도). 그래서 자동이고 토글이 아니다.
 *
 * ⚠ `undefined` = 아직 못 정함. 소비자가 갈라야 한다 — 사전 로딩 중이면 **보류**(직전 해상도 유지),
 * 로드가 끝났는데도 모르면 그 술어는 죽은 참조이니 알갱이 계산에서 빼고 하루로 간다(`resolveAutoGrain`).
 */
export function autoGrain(stages: readonly FilterStage[], look: GrainLookup): Grain | undefined {
    return finest(activeStages(stages).map((s) => stageGrain(s, look)));
}

/**
 * 사전이 **로드된 뒤**의 자동 해상도 — 남은 모름은 전부 죽은 참조라 하루로 접는다.
 * 죽은 조건 하나가 화면 전체를 타점으로 끌어내리면 아무것도 구분 못 하는 행들이 펼쳐진다(가짜 정밀도).
 * 로딩 중에는 이걸 부르면 안 된다 — 그때의 모름은 "곧 올 것"이지 "없는 것"이 아니다.
 */
export const resolveAutoGrain = (stages: readonly FilterStage[], look: GrainLookup): Grain =>
    autoGrain(stages, look) ?? "day";

/** 층위가 접힌 단계 하나 — 표시·정산이 같은 순서를 봐야 해서 접기(모름→하루)도 한 곳에서 한다. */
export interface OrderedStage {
    stage: FilterStage;
    grain: Grain;
}

/**
 * 깔때기의 **표시이자 평가 순서** — 하루 단계가 타점 단계보다 앞, 같은 층위 안에서는 저장 순서.
 *
 * 순서는 결과(생존 집합)를 안 바꾼다 — 바꾸는 건 "어느 단계가 무엇을 죽였나"라는 서술이고,
 * 하루→타점으로 흐르게 고정해야 `새로 죽임`이 넓은 조건부터 세어져 이야기가 읽힌다.
 * 층위 모름(죽은 참조·로딩 중)은 하루 취급 — resolveAutoGrain 의 접기와 같은 방향.
 */
export function funnelOrder(stages: readonly FilterStage[], look: GrainLookup): OrderedStage[] {
    const entries = stages.map((stage) => ({ stage, grain: (stageGrain(stage, look) ?? "day") as Grain }));
    return [...entries.filter((e) => e.grain === "day"), ...entries.filter((e) => e.grain === "point")];
}

// 표시 해상도는 **자동 하나**다(resolveAutoGrain — 걸린 조건 중 가장 가는 층위).
// 한때 "타점으로 펼치기" 손잡이가 있었지만 걷어냈다: 결과 목록이 사라진 뒤 그 토글의 남은 효과는
// 탤리 숫자의 단위뿐이었고(구독 패널은 viewOf 계약이 이미 하루→타점 전개를 한다), 같은 조건의
// 같은 화면이 손잡이 하나로 다른 수를 보이는 대가만 남았다.
// ⚠ 반대 방향(타점 → 하루)은 애초에 없었다 — 롤업 규칙("타점 3 통과·2 탈락인 하루는?")에 정답이 없고,
// 어떻게 정하든 그 임의의 규칙이 5칸 숫자에 조용히 섞인다.

// ── 단계 구성 제약 — 한 단계는 **한 종류·한 층위** ──────────────────────────
//
// 정확성 요건이 아니다. `돌파(하루) AND 재돌파(타점)` 를 한 단계에 섞어도 판정 자체는 된다(타점으로
// 내려가 하루 조건은 그 타점의 날짜에 적용). 그런데도 막는 이유:
//   · **쪼개도 결과가 같다** — 단계 사이가 AND 라 섞인 단계를 둘로 나눠도 생존 집합이 동일하다. 대가가 0.
//   · **쪼개면 진단이 더 나온다** — 섞인 단계는 "새로 죽인 8건"이 하루 조건 탓인지 타점 조건 탓인지
//     안 보인다. 나누면 한계 기여도가 따로 나와 어느 쪽이 장식인지 드러난다.
//   · **"하루 단계가 타점 단계보다 앞" 규칙이 비로소 성립한다** — 단계마다 층위가 하나여야 순서를 매긴다.
// ⚠ 모름(죽은 참조·로딩 중)은 **막지 않는다**. 알 수 없는 것을 근거로 손을 막으면 사전이 늦게 왔을 때
// 멀쩡한 편집이 거부된다.

/** 이 단계가 이미 정한 종류(빈 단계 = 아직 없음). 빈 술어도 종류는 말한다 — 편집 중인 자리라서. */
export function stageKind(s: FilterStage): PredicateKind | undefined {
    return s.predicates[0]?.kind;
}

/**
 * 이 술어를 이 단계에 넣어도 되나 — 같은 종류이고, 알갱이가 충돌하지 않아야 한다.
 * 축은 종류가 둘(밴드·값구간)이지만 같은 축 도구라 서로 섞일 수 있다.
 *
 * ⚠ **"아직 층위를 안 정함"과 "하루로 정함"은 다르다.** 비어 있는 집합의 알갱이는 표시 기본값으로는
 * 하루지만(autoGrain), 제약 검사에서는 아직 아무 층위도 없는 것이다 — 그걸 하루로 읽으면 빈 단계가
 * 타점 조건을 거부한다. 그래서 알갱이를 묻기 전에 **층위를 정하는 게 하나라도 있는지** 먼저 본다.
 */
export function canAddPredicate(s: FilterStage, p: FilterPredicate, look: GrainLookup): boolean {
    const kind = stageKind(s);
    if (kind !== undefined && !sameFamily(kind, p.kind)) return false;
    if (s.predicates.every(isPredicateEmpty)) return true; // 아직 층위 없음
    const mine = stageGrain(s, look);
    const theirs = predicateGrain(p, look);
    return mine === undefined || theirs === undefined || mine === theirs;
}

/** 축 밴드와 축 값구간은 같은 도구의 두 손잡이다 — 한 단계에 같이 놓는 게 자연스럽다. */
const sameFamily = (a: PredicateKind, b: PredicateKind): boolean =>
    a === b || (isAxisKind(a) && isAxisKind(b));

const isAxisKind = (k: PredicateKind): boolean => k === "axisBand" || k === "axisValue";

/**
 * 이 리터럴을 그룹 술어에 더해도 되나 — 식 안 리터럴들과 **같은 층위** 여야 한다.
 * "…그룹 없음"도 층위를 말하므로 같은 규칙을 받는다(하루 없음과 타점 그룹을 한 필터에 섞지 않는다).
 */
export function canAddGroupLiteral(expr: GroupExpr, groupId: string, look: GrainLookup): boolean {
    const theirs = literalScope(groupId, look);
    if (theirs === undefined) return true; // 모름은 막지 않는다
    if (literalIds(expr).length === 0) return true; // 빈 식 — 아직 층위 없음
    const mine = predicateGrain({ kind: "group", expr }, look);
    return mine === undefined || mine === theirs;
}

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

/**
 * 밴드 경계 이관 — 옛 저장본은 경계를 **slotId**(DB bigserial 문자열, 예 "52")로 들고 있다.
 * 지금은 **타점 앵커**(pointKey "코드|날짜|시각")라 옛 값은 영영 안 풀린다. 그냥 두면 그 조건이
 * 계속 "판단 불가"로 남아 화면에 이유 없이 아무것도 안 걸리는 상태가 되므로, 여기서 **열린 경계로 떨군다**.
 * 구분은 모양으로 한다 — 타점 키에는 구분자가 둘 있고 slotId 에는 없다.
 */
const isPointAnchor = (v: unknown): v is string => typeof v === "string" && v.split("|").length === 3;

function migrateBand(band: RankBand): RankBand {
    const out: RankBand = {};
    if (isPointAnchor(band.lo)) out.lo = band.lo;
    if (isPointAnchor(band.hi)) out.hi = band.hi;
    return out;
}

// ── 술어 payload 검증 — 겉껍데기(kind)만 보고 속을 캐스팅하면, 깨진 저장본이 화면에 멀쩡히 뜬 채
// 평가기에서 터진다(expr:{} 가 groups.flatMap 에서 크래시). 속까지 모양을 확인하고, 안 맞으면 null
// (= 그 저장본 통째 폐기 — 위 parseStages 원칙 그대로).

const isBound = (o: unknown): o is AxisBound => {
    if (typeof o !== "object" || o === null) return false;
    const b = o as { kind?: unknown; point?: unknown; value?: unknown };
    return (b.kind === "point" && typeof b.point === "string")
        || (b.kind === "value" && typeof b.value === "number" && Number.isFinite(b.value));
};

const isAxisValueRange = (o: unknown): o is AxisValueRange => {
    if (typeof o !== "object" || o === null) return false;
    const r = o as { from?: unknown; to?: unknown };
    return (r.from === undefined || isBound(r.from)) && (r.to === undefined || isBound(r.to));
};

/** 날짜·시간 구간 — 양끝 필수 문자열(반열림은 이 두 종류엔 없다). */
const isFromToRange = (o: unknown): o is { from: string; to: string } => {
    if (typeof o !== "object" || o === null) return false;
    const r = o as { from?: unknown; to?: unknown };
    return typeof r.from === "string" && typeof r.to === "string";
};

function parsePredicate(o: unknown): FilterPredicate | null {
    const p = o as { kind?: unknown; axisId?: unknown; ranges?: unknown; band?: unknown; expr?: unknown; params?: unknown };
    switch (p?.kind) {
        case "themeStrength": {
            // 관대한 병합 — 필드가 늘어도 옛 저장물이 통째 안 죽는다. payload 자체가 누락·오염이어도
            // **조건-off 로 살린다**: 이 파서의 null 은 저장본 한 벌 통째 폐기라, 지어낸 활성 조건(기본값)보다
            // "조건 없음"으로 보이는 빈 술어가 정직하고 덜 파괴적이다.
            const params = parseThemeStrengthParams(p.params)
                ?? { ...DEFAULT_THEME_STRENGTH, countOn: false, baseRankOn: false, zoneRankOn: false };
            return { kind: "themeStrength", params };
        }
        case "group": {
            const expr = parseGroupExpr(p.expr); // 팔레트 저장본과 같은 검증 한 벌 — 여기만 느슨하면 안 된다
            return expr ? { kind: "group", expr } : null;
        }
        case "axisBand":
            return typeof p.axisId === "string" && p.band && typeof p.band === "object"
                ? { kind: "axisBand", axisId: p.axisId, band: migrateBand(p.band as RankBand) } : null;
        case "axisValue":
            return typeof p.axisId === "string" && Array.isArray(p.ranges) && p.ranges.every(isAxisValueRange)
                ? { kind: "axisValue", axisId: p.axisId, ranges: p.ranges } : null;
        case "date":
            return Array.isArray(p.ranges) && p.ranges.every(isFromToRange)
                ? { kind: "date", ranges: p.ranges } : null;
        case "time":
            return Array.isArray(p.ranges) && p.ranges.every(isFromToRange)
                ? { kind: "time", ranges: p.ranges } : null;
        default:
            return null;
    }
}
