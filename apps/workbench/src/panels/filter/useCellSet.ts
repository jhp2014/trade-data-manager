// 하루·셀 우주의 **평가 소유자** — 조건(FilterStage[]) × 하루 재료 → 걸린 셀.
// 규칙 전문은 .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 왜 컨텍스트가 아니라 훅인가
// `FunnelProvider` 같은 전역 한 벌로 만들면 둘이 깨진다:
//  ① **성능** — 존 순위 칸 하나가 5.7초다(실측: 분 단면이 분당 캐시라 지배 비용이 분 수 ~390).
//     전역이면 그 5.7초가 앱 전체의 편집마다 돈다.
//  ② **날짜가 하나**라는 가정이 굳는다 — 패널마다 다른 날짜를 고정(pin)하는 ③ 과 "종단 시트 ∥ 오늘
//     후보"를 나란히 보는 ④ 가 원천봉쇄된다.
// 대신 **모듈 메모**로 같은 (조건, 날짜, 재료)의 중복 평가를 접는다 — 두 패널이 같은 집합을 봐도 한 벌.
//
// ## 결손 칸은 조용히 빠지지 않는다
// 종단 술어(축·결과·그룹…)가 든 칸은 이 우주에서 평가할 수 없다. 그 칸을 그냥 통과시키면 조건이
// 무제한이 되고, 그냥 탈락시키면 모수가 통째로 죽는다 — 둘 다 거짓말이다. **평가에서 빼고 그 사실을
// 함께 낸다**(칸 상태 `deficient` + 이유). 화면이 그걸 말할 책임을 진다.
import { useMemo } from "react";
import {
    evaluateCellsExpr,
    minuteToHms,
    type CellEvalOptions,
    type CellEvalResult,
    type CellExpr,
    type CellHit,
    type CellPredicate,
    type FunnelItem,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useAutoPoints } from "../../lib/PointGridsContext.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { useThemeKnobParams } from "./themeLink.js";
import { cellMaterialsOf } from "./cellMaterials.js";
import { isPredicateEmpty, type FilterStage } from "./stage.js";
import { leavesOf, type SetExpr } from "./expr.js";
import { stageDeficiency } from "./universe.js";

/**
 * 하루 집합의 평가 옵션 — **소비자가 전부 이 상수를 쓴다**(목록·차트).
 * opts 는 메모 키에 실리므로 한 소비자만 다르게 주면 같은 (날짜, 조건)이 두 벌로 갈려 5.7초가 두 번
 * 돌고, 잘린 날엔 목록(종목째 컷)과 차트(앞에서 컷)가 **다른 셀**을 그린다(리뷰가 잡은 자리).
 */
export const DAY_SET_OPTS: CellEvalOptions = { limitBy: "stockGroup" };

/** 칸 하나의 상태 — 평가에 들었나, 아니면 이 우주에서 결손인가(이유와 함께). */
export interface CellStageStatus {
    stageId: string;
    counted: boolean;
    /** counted=false 일 때의 이유(결손 지도의 문장 그대로). */
    reasons: string[];
    /** 이 칸이 걸린 셀 수(counted 일 때만 뜻이 있다). */
    hits: number;
}

export interface CellSetView {
    /** 정렬·상한이 적용된 목록 — **순회도 렌더도 이 배열 하나만 본다**. */
    hits: readonly CellHit[];
    /** 같은 것을 깔때기 항목으로 — ③(순회 목록)·④(시트 바인딩)가 이 모양 위에 얹힌다. */
    items: readonly FunnelItem[];
    matched: number;
    limit: number;
    truncated: boolean;
    tooWide: boolean;
    stages: readonly CellStageStatus[];
    byCode: ReadonlyMap<string, ReplayStock>;
    isLoading: boolean;
    error: Error | null;
    /** 존 순위 재료 준비 여부 — 멤버십 로딩 중엔 그 칸이 조용히 비므로 화면이 모름을 말할 재료. */
    themesReady: boolean;
}

/**
 * 식(종단 어휘) → 셀 식(core 어휘). **결손 잎은 제 묶음을 통째로 빼낸다** — 그 사실은 status 가 말한다.
 * 순수 함수라 dom 없이 잠근다(이 변환이 틀리면 화면이 조용히 다른 모수를 센다).
 *
 * ## 결손이 AND 를 오염시키는 이유
 * 결손 잎 하나만 빼면 그 AND 는 **느슨해진다**(조건 하나가 사라진 채 계속 걸린다) — 사용자가 건 적
 * 없는 더 넓은 집합을 조용히 보여주는 셈이다. 그래서 그 묶음을 통째로 뺀다: 옛 평평한 시절의
 * "결손 술어가 든 **칸**을 통째로 뺀다"와 정확히 같은 규칙이고, OR 가지 하나가 빠지는 건
 * 나머지 가지가 그대로 서므로 안전하다.
 */
export function toCellExpr(expr: SetExpr): { expr: CellExpr | null; stages: CellStageStatus[] } {
    const status: CellStageStatus[] = [];
    /** 이 가지가 빠질 때, 그 안의 멀쩡한 잎들에게 이유를 달아 준다(조용히 사라지지 않게). */
    const poison = (e: SetExpr, why: string): void => {
        for (const s of leavesOf(e)) {
            const at = status.find((x) => x.stageId === s.id);
            if (at && at.counted) { at.counted = false; at.reasons = [why]; }
        }
    };
    const walk = (e: SetExpr): CellExpr | null => {
        if (e.kind === "cond") {
            const s = e.stage;
            if (!s.enabled || !s.predicates.some((p) => !isPredicateEmpty(p))) return null; // 꺼짐·빈 술어 = 부재
            const reasons = stageDeficiency(s, "daily");
            if (reasons.length > 0) {
                status.push({ stageId: s.id, counted: false, reasons, hits: 0 });
                return null;
            }
            status.push({ stageId: s.id, counted: true, reasons: [], hits: 0 });
            // 결손 0 = 전부 셀 술어(위 게이트가 보장). 조건 하나가 술어 **여럿**을 들 수 있으므로
            // 그때는 AND 묶음으로 세운다 — 첫 술어만 싣던 옛 실수가 여기서 재발하지 않게.
            const preds = s.predicates as CellPredicate[];
            const neg = e.neg === true ? { neg: true as const } : {};
            const one = preds.length === 1;
            const node: CellExpr = one
                ? { kind: "pred", id: s.id, pred: withTransition(preds[0]!, s.transition), ...neg }
                : {
                    kind: "and",
                    id: s.id,
                    of: preds.map((pred, i): CellExpr => ({ kind: "pred", id: `${s.id}#${i}`, pred })),
                    // ⚠ **칸 전이를 반드시 싣는다** — 술어가 여럿일 때 전이의 자리는 묶음이다.
                    ...(s.transition !== undefined ? { transition: s.transition } : {}),
                    ...neg,
                };
            return node;
        }
        const of: CellExpr[] = [];
        for (const c of e.of) {
            const r = walk(c);
            if (r === null) {
                if (e.kind === "and") {
                    // AND 는 오염된다 — 결손 형제 하나가 이 묶음 전체를 빼낸다(위 주석).
                    poison(e, "같은 묶음에 이 우주에서 평가할 수 없는 조건이 있어 묶음째 빠졌습니다");
                    return null;
                }
                continue; // OR 은 그 가지만 빠진다
            }
            of.push(r);
        }
        if (of.length === 0) return null;
        return e.kind === "and"
            ? { kind: "and", id: e.id, of, ...(e.neg === true ? { neg: true as const } : {}) }
            : { kind: "or", id: e.id, of, ...(e.neg === true ? { neg: true as const } : {}) };
    };
    const out = walk(expr);
    return { expr: out, stages: status };
}

/**
 * 잎 하나짜리 칸의 **전이 수식어**는 술어에 싣는다 — 술어 하나짜리 칸에서 "칸 전이"와 "술어 전이"가
 * 동치라는 core 의 계약(applyTransition 주석)을 그대로 쓴다. 안 실으면 "하루 처음"이 조용히 사라져
 * 매 분 재발화한다(후보 수가 소리 없이 는다).
 */
const withTransition = (p: CellPredicate, t: FilterStage["transition"]): CellPredicate =>
    (t === undefined || p.transition !== undefined ? p : { ...p, transition: t });

// ── 모듈 메모 — 소비자가 셋이 된다(순회 목록 · 차트 ◇ · 날짜 경계 판정). 같은 (하루 재료, 조건, 노브)
//    조합을 두 번 평가하면 존 순위 조건에서 5.7초가 그대로 두 번 든다.
//    키의 바깥 축은 **격자 파생 배열 참조**(WeakMap) — 그게 갈리면 재료가 갈린 것이라 캐시도 같이
//    죽는 게 맞다(`themeRank/sectionSeries` 의 분 단면 WeakMap 과 같은 수법·같은 이유).
//    안쪽 키에 날짜·조건·노브·상한을 싣는다.
const MEMO = new WeakMap<object, Map<string, CellEvalResult>>();
/**
 * 한 재료(하루 스냅샷)당 살려 두는 조합 수. 산수는 **동시에 서 있는 서로 다른 조건 벌**이다:
 * 핀 둘(시트·결과) + 작업 깔때기(작업 대상) + 차트 = 4 가 현실적 상한이고, 조건을 만지는 동안
 * 직전 것도 살아 있어야 편집이 매끄럽다(단계 ④ 에서 3 → 6). 넘치면 LRU 스래싱으로 **매 렌더
 * 재평가**가 나는데 그 대가가 5.7초다. 담는 것은 결과 배열이라 힙 부담은 작다.
 */
const MEMO_CAP = 6;

/**
 * 참조 → 세대 번호. **키에 못 싣는 객체 참조**(격자 파생·테마 투영)를 문자열 키에 태우는 자다.
 * 안 태우면 그 재료만 갈렸을 때 캐시가 조용히 낡은 결과를 돌려준다 — 테마 멤버십을 고쳐도
 * `zoneRank` 조건이 옛 소속으로 계산된 채 남는 식(리뷰가 잡은 자리).
 */
const GEN = new WeakMap<object, number>();
let genSeq = 0;
const genOf = (o: object): number => {
    const v = GEN.get(o);
    if (v !== undefined) return v;
    GEN.set(o, ++genSeq);
    return genSeq;
};

function evaluateMemo(gen: object, key: string, run: () => CellEvalResult): CellEvalResult {
    let per = MEMO.get(gen);
    if (!per) MEMO.set(gen, (per = new Map()));
    const hit = per.get(key);
    if (hit) {
        // LRU — 다시 꽂아 최신으로(Map 은 삽입 순서를 지킨다).
        per.delete(key);
        per.set(key, hit);
        return hit;
    }
    const made = run();
    per.set(key, made);
    while (per.size > MEMO_CAP) per.delete(per.keys().next().value as string);
    return made;
}

const EMPTY_HITS: CellHit[] = [];
const EMPTY_ITEMS: FunnelItem[] = [];
const EMPTY_MAP = new Map<string, ReplayStock>();

/** 셀 → 깔때기 항목. 시각 포맷이 타점 자연키와 **같은 자**여야 ③·④ 가 그대로 얹힌다. */
export const cellHitToItem = (h: CellHit, date: string): FunnelItem => ({
    stockCode: h.code,
    date,
    time: minuteToHms(h.min),
});

export function useCellSet(expr: SetExpr | null, date: string, opts?: CellEvalOptions): CellSetView {
    const narrowedEarly = useMemo(
        () => (expr === null ? { expr: null, stages: [] as CellStageStatus[] } : toCellExpr(expr)),
        [expr],
    );
    // 평가할 조건이 없으면 **하루 재료를 안 당긴다** — /day-replay 는 한 날 ~15MB 다.
    // (라벨 층은 이 재료가 없어도 선다 — 멤버십에서 오므로. 조건 없음 = 안 보여줌 규칙과 같은 결.)
    const snapQ = useDaySnapshot(narrowedEarly.expr !== null ? date : null);
    const stocks = snapQ.data?.stocks;
    const auto = useAutoPoints();
    const themes = useThemeProjection();
    // 존 정의(N·M·창·기준)는 공용 사다리 — 타점 정보 패널과 같은 숫자를 낸다(두 화면 두 숫자 금지).
    const zoneParams = useThemeKnobParams();

    const narrowed = narrowedEarly;
    // ⚠ **트리를 걸어야 한다** — 평평한 2중 루프로 재면 묶음 안의 격자·존순위 술어를 못 보고,
    //   그 조건은 화면에 오류 없이 **조용히 아무것도 안 건다**(재료를 안 당기므로).
    const needsGrid = useMemo(() => usesCellPred(narrowed.expr, (p) => p.kind === "gridPoint"), [narrowed]);
    const needsZone = useMemo(
        () => usesCellPred(narrowed.expr, (p) => p.kind === "cellValue" && p.field === "zoneRank"),
        [narrowed],
    );
    const limit = opts?.limit;
    const hardCap = opts?.hardCap;
    const limitBy = opts?.limitBy;

    const result = useMemo(() => {
        if (!stocks || snapQ.data?.date !== date) return null;
        // 메모 키 — 조건·노브·**재료 세대를 전부** 싣는다. 하나라도 빠지면 조용히 낡은 목록을 돌려준다.
        //  · 바깥 축(WeakMap) = `stocks` 배열 참조 = 하루 재료의 세대. 오늘 날짜는 60초마다 재조회되므로
        //    이걸 안 가르면 새로 채워진 분의 후보가 세션 내내 안 뜬다.
        //  · 격자(`auto.points`)·테마 투영(`themes.proj`)은 참조를 키에 못 실으니 **세대 번호**로 태운다.
        const key = JSON.stringify([
            date, narrowed.expr, zoneParams, limit ?? null, hardCap ?? null, limitBy ?? null,
            genOf(auto.points), genOf(themes.proj),
        ]);
        return evaluateMemo(stocks, key, () => {
            const mat = cellMaterialsOf(stocks, date, auto, themes.proj, zoneParams);
            return evaluateCellsExpr(stocks, mat, narrowed.expr, {
                ...(limit !== undefined ? { limit } : {}),
                ...(hardCap !== undefined ? { hardCap } : {}),
                ...(limitBy !== undefined ? { limitBy } : {}),
            });
        });
    }, [stocks, snapQ.data?.date, date, auto, themes.proj, zoneParams, narrowed, limit, hardCap, limitBy]);

    const items = useMemo<readonly FunnelItem[]>(
        () => (result ? result.hits.map((h) => cellHitToItem(h, date)) : EMPTY_ITEMS),
        [result, date],
    );

    const byCode = useMemo<ReadonlyMap<string, ReplayStock>>(
        () => (stocks ? new Map(stocks.map((s) => [s.code, s])) : EMPTY_MAP),
        [stocks],
    );

    const stageStatus = useMemo<CellStageStatus[]>(
        () => narrowed.stages.map((st) => ({ ...st, hits: result?.byCondition.get(st.stageId) ?? 0 })),
        [narrowed, result],
    );

    return {
        hits: result?.hits ?? EMPTY_HITS,
        items,
        matched: result?.matched ?? 0,
        limit: result?.limit ?? 0,
        truncated: result?.truncated ?? false,
        tooWide: result?.tooWide ?? false,
        stages: stageStatus,
        byCode,
        // 재료 게이트는 **그 재료를 쓰는 조건이 있을 때만** 선다 — 칸을 지웠는데 격자 실패가 화면을
        // 죽이면 "지웠다"가 거짓말이 된다.
        isLoading: snapQ.isLoading || (needsGrid && auto.isLoading),
        error: (snapQ.error as Error | null) ?? (needsGrid ? auto.error : null),
        themesReady: !needsZone || themes.ready,
    };
}

/** 이 셀 식이 그 술어를 쓰나 — 재료 게이트(격자·분 단면)의 자. 트리를 끝까지 건다. */
function usesCellPred(e: CellExpr | null, hit: (p: CellPredicate) => boolean): boolean {
    if (e === null) return false;
    if (e.kind === "pred") return hit(e.pred);
    return e.of.some((c) => usesCellPred(c, hit));
}
