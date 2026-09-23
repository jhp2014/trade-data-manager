// 하루·셀 우주의 **평가 소유자** — 조건(FilterStage[]) × 하루 재료 → 걸린 셀.
// 규칙 전문은 .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 왜 컨텍스트가 아니라 훅인가
// `FunnelProvider` 같은 전역 한 벌로 만들면 둘이 깨진다:
//  ① **성능** — 한 번이 0.25~0.47초다(2026-09-22 실측, 날짜 3개 · Node/브라우저 양쪽). 지배 비용은
//     **분 단면 굽기**(720개 ~250ms)이고 셀 수가 아니다. 전역이면 그게 앱 전체의 편집마다 돈다.
//     ⚠ 옛 주석의 「5.7초」는 **재현되지 않았다** — 귀속(분 단면)은 맞았고 크기만 28배 틀렸다.
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
import { useAutoPoints, usePointGrids } from "../../lib/PointGridsContext.js";
import { useDayGrid } from "../../lib/useDayGrid.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { useThemeKnobParams } from "./themeLink.js";
import { cellMaterialsOf } from "./cellMaterials.js";
import type { FilterStage } from "./stage.js";
import { activeExpr, foldExpr, isFoldedNode, type FoldedNode, type SetExpr, type SetTerm } from "./expr.js";
import { stageDeficiency, type Universe } from "./universe.js";

/**
 * 하루 집합의 평가 옵션 — **소비자가 전부 이 상수를 쓴다**(목록·차트).
 * opts 는 메모 키에 실리므로 한 소비자만 다르게 주면 같은 (날짜, 조건)이 두 벌로 갈려 평가가 두 번
 * 돌고, 잘린 날엔 목록(종목째 컷)과 차트(앞에서 컷)가 **다른 셀**을 그린다(리뷰가 잡은 자리).
 *
 * ## 상한 300 — 값을 치르는 곳은 **하류**다 (2026-09-20 사용자 확정)
 * 조건이 느슨하면 한 종목의 거의 모든 분이 걸려 산출물이 수만 개가 된다(실측: 하루 41,890 셀).
 * 그 목록이 그대로 시트 행·결과 걷기·시뮬로 흘러 **패널마다 그 수만큼** 일한다 — 메인 스레드가
 * 30초 잡히던 실측의 주범이다. 하루에 진짜로 볼 후보가 300을 넘을 일은 없다는 판단(사용자).
 *
 * ⚠ **엔진 스캔은 이 값으로 안 줄어든다** — `limit` 은 정렬 뒤 앞에서 자르는 **산출물** 상한이고,
 * 스캔을 멈추는 건 그물(`hardCap` 50,000 셀)이다. 그러니 이건 "평가를 싸게" 만드는 게 아니라
 * "평가 결과가 하류를 덜 때리게" 만드는 것이다. 잘린 사실은 머리글이 `상한 N 초과 — 잘림` 으로 말한다.
 */
export const DAY_SET_OPTS: CellEvalOptions = { limitBy: "stockGroup", limit: 300 };

/** 칸 하나의 상태 — 평가에 들었나, 아니면 이 우주에서 결손인가(이유와 함께). */
export interface CellStageStatus {
    stageId: string;
    counted: boolean;
    /** counted=false 일 때의 이유(결손 지도의 문장 그대로). */
    reasons: string[];
}
// ⚠ 옛 `hits`(칸별 발화 수)는 **지웠다**(2026-09-19 리뷰) — 엔진의 `byCondition` 키가 칸 id 가 아니라
//   **루트의 직속 가지 id** 라(5칸 은퇴 이후) 루트가 AND 면 모든 칸이 0 이었다. 소비자가 없는 채로
//   "0 건"이라는 그럴듯한 거짓을 들고 있던 필드다. 칸별 수가 다시 필요하면 그건 **부분식 단독 평가**라
//   decisions 의 "노드 건수" 규칙(하루는 루트만)을 먼저 지나야 한다.

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
    /**
     * 이 우주에서 **평가할 조건이 하나라도 있나**. false = 조건 0개이거나 전부 결손 —
     * 「조건 없음 = 안 보여줌」 규칙이 걸리는 자리라, 빈 결과를 "다 걸렀다"로 읽으면 안 된다.
     */
    evaluable: boolean;
    /**
     * **산출물이 실제로 나왔나** — `hits`/`matched` 를 믿어도 되는 유일한 비트.
     * ⚠ `isLoading`·`error` 는 **대리 신호**다: react-query `paused`(오프라인)처럼 둘 다 거짓인데
     * 재료가 없는 상태가 있어서, 그 틈으로 "제한 있음 + 0건"이 샌다. 여기는 그 틈이 없다.
     */
    ready: boolean;
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
/**
 * 참조가 가리키는 집합 — 하루 우주 전개의 재료. `SavedSet` 을 구조적으로 만족하는 좁은 모양이라
 * 이 파일이 스토어 타입을 안 물어도 된다(순수부는 순수부끼리).
 */
export type DaySetLookup = (setId: string) => { expr: SetExpr; universe: Universe } | undefined;

export function toCellExpr(
    input: SetExpr,
    /**
     * 참조 해결 — **하루 집합만** 그 자리에 펼친다(종단 집합은 키가 아예 달라 여전히 결손).
     * 안 주면 참조는 전부 결손이다(순수 함수의 기본값 — 테스트가 옛 동작을 그대로 잰다).
     */
    setOf: DaySetLookup = () => undefined,
): { expr: CellExpr | null; stages: CellStageStatus[] } {
    const status: CellStageStatus[] = [];
    /** 전개 중인 참조들 — 순환(A→B→A)을 결손으로 끊는다(resolveSet.resolving 과 같은 수법). */
    const visiting = new Set<string>();
    /** 이 가지가 빠질 때, 그 안의 멀쩡한 조건들에게 이유를 달아 준다(조용히 사라지지 않게). */
    const poison = (ids: readonly string[], why: string): void => {
        for (const id of ids) {
            const at = status.find((x) => x.stageId === id);
            if (at && at.counted) { at.counted = false; at.reasons = [why]; }
        }
    };

    /**
     * 번역 결과 세 값 —
     *  · `CellExpr` : 이 항이 내는 셀 술어
     *  · `null`     : **결손**(이 우주에서 평가할 수 없다) — AND 를 오염시킨다
     *  · `ABSENT`   : **부재**(제한이 없다) — 빈 집합 참조가 여기다. 오염시키지 않는다.
     *
     * ⚠ 셋을 둘로 합치면 안 된다. 종단에서 **빈 집합 참조는 공허참(= 제한 없음)** 이라(`and3([])`),
     * 여기서 결손으로 접으면 같은 식이 두 우주에서 다른 답을 낸다 — `＋ 묶음` 으로 갓 만든 빈 집합이
     * 부모 하루 집합을 **이유 없이 0건**으로 만들던 자리다(2026-09-20 리뷰).
     */
    const ABSENT = Symbol("absent");
    type Out = CellExpr | null | typeof ABSENT;

    /** 조건 항 하나 → 셀 술어(들). 결손이면 null 이고 이유가 status 에 실린다. */
    const condOf = (t: Extract<SetTerm, { kind: "cond" }>, mine: string[]): CellExpr | null => {
        const s = t.stage;
        mine.push(s.id);
        const reasons = stageDeficiency(s, "daily");
        // 같은 집합을 두 번 참조하면 같은 조건이 두 번 지난다 — 줄은 하나이므로 status 도 하나다.
        if (!status.some((x) => x.stageId === s.id)) {
            status.push(reasons.length > 0
                ? { stageId: s.id, counted: false, reasons }
                : { stageId: s.id, counted: true, reasons: [] });
        }
        if (reasons.length > 0) return null;
        // 결손 0 = 전부 셀 술어(위 게이트가 보장). 조건 하나가 술어 **여럿**을 들 수 있으므로
        // 그때는 AND 묶음으로 세운다 — 첫 술어만 싣던 옛 실수가 여기서 재발하지 않게.
        const preds = s.predicates as CellPredicate[];
        const neg = t.neg === true ? { neg: true as const } : {};
        if (preds.length === 1) return { kind: "pred", id: s.id, pred: withTransition(preds[0]!, s.transition), ...neg };
        return {
            kind: "and",
            id: s.id,
            of: preds.map((pred, i): CellExpr => ({ kind: "pred", id: `${s.id}#${i}`, pred })),
            // ⚠ **칸 전이를 반드시 싣는다** — 술어가 여럿일 때 전이의 자리는 묶음이다.
            ...(s.transition !== undefined ? { transition: s.transition } : {}),
            ...neg,
        };
    };

    /**
     * 참조 항 하나 → 그 집합의 식을 **그 자리에 펼친 것**(2026-09-20). 평가가 아니라 번역이라
     * 비용이 없고, 안 펼치면 「결손은 AND 를 오염시킨다」 규칙이 묶음 하나를 **집합 전체의 0건**으로
     * 키운다 — 중첩이 전부 참조가 된 모델에서는 그게 상시 경로다.
     */
    const refOf = (t: Extract<SetTerm, { kind: "ref" }>, mine: string[]): Out => {
        const target = setOf(t.setId);
        if (target === undefined || visiting.has(t.setId)) return null; // 지워진 집합 · 순환 = 결손
        // ⚠ **빈 집합은 우주를 안 묻고 부재로 통과시킨다.** 조건이 없으면 우주가 미정이라 저장값이
        //   `longitudinal` 인데(갓 만든 묶음이 그렇다), 우주로 먼저 거르면 그 묶음이 결손이 되어
        //   부모를 통째로 0건으로 만든다. 빈 집합은 어느 우주에서도 "제한 없음"이다.
        if (activeExpr(target.expr).of.length === 0) return ABSENT;
        if (target.universe !== "daily") return null; // 종단 집합 — 멤버십을 물을 키가 아예 다르다
        visiting.add(t.setId);
        const inner: string[] = [];
        try {
            const node = walk(target.expr, inner);
            if (node === null || node === ABSENT) return node;
            // ⚠ **id 를 이 항의 것으로 갈아 준다** — 모든 집합의 루트 id 가 `"root"` 라, 그대로 두면
            //   루트 OR 의 가지 둘이 인라인 참조일 때 엔진의 `byCondition`/`tags` 키가 겹쳐 두 가지가
            //   한 칸으로 합쳐진다(차트 hover 라벨이 조용히 틀린다).
            const named: CellExpr = node.kind === "pred" ? node : { ...node, id: t.id };
            // 부정은 **감싸서** 싣는다 — 안쪽 노드의 neg 를 뒤집으면 이중 부정이 뜻을 잃는다.
            return t.neg === true ? { kind: "and", id: t.id, of: [named], neg: true } : named;
        } finally {
            visiting.delete(t.setId);
            mine.push(...inner);
        }
    };

    /**
     * 접힌 묶음 하나 → 셀 식. `mine` 은 **이 묶음이 기여한 조건 id 들**이다 — 오염 대상을
     * 여기서 모은다(참조 안쪽까지 포함해야 묶음이 빠졌을 때 그 조건들도 이유를 받는다).
     */
    const walkNode = (n: FoldedNode, mine: string[]): Out => {
        const of: CellExpr[] = [];
        const here: string[] = [];
        let poisoned = false;
        let absent = false;
        for (const x of n.of) {
            // 괄호는 **한 층 더인 묶음**일 뿐이라 같은 3치 규칙이 그대로 내려간다
            // (결손은 제 AND 를 오염시키고, 부재는 그냥 빠지며 OR 에선 묶음째 제한 없음).
            const r = isFoldedNode(x) ? walkNode(x, here) : (x.kind === "cond" ? condOf(x, here) : refOf(x, here));
            // ⚠ AND 가 오염돼도 **항을 끝까지 걷는다** — 여기서 바로 빠져나오면 뒤쪽 항이 walk 를
            //   안 지나 `status` 에 아예 안 실리고, 화면의 결손 수가 그만큼 덜 세어진다("결손은 조용히
            //   사라지지 않는다"가 제 구현에서 새던 자리). 걷는 값은 싸다 — 평가가 아니라 번역이다.
            if (r === null) { if (n.kind === "and") poisoned = true; continue; } // OR 은 그 항만 빠진다
            // 부재(제한 없음) — AND 에선 그냥 빠지고, **OR 에선 묶음 전체가 제한 없음**이 된다
            //   (참인 항이 하나라도 있으면 OR 은 늘 참이다).
            if (r === ABSENT) { absent = true; continue; }
            of.push(r);
        }
        mine.push(...here);
        if (poisoned) {
            poison(here, "같은 묶음에 이 우주에서 평가할 수 없는 조건이 있어 묶음째 빠졌습니다");
            return null;
        }
        if (absent && n.kind === "or") return ABSENT;
        if (of.length === 0) return absent ? ABSENT : null;
        // 괄호의 NOT — **감싸지 않고 그 묶음에 싣는다**(core CellExpr 의 묶음도 neg 를 든다).
        return { kind: n.kind, id: n.id, of, ...(n.neg === true ? { neg: true as const } : {}) };
    };

    /**
     * 집합 하나(= 식 한 벌) → 셀 식. **부재를 먼저 걷고**(activeExpr) **접는다**(foldExpr).
     *
     * ⚠ **부재를 먼저 걷는다** — 꺼진 조건·빈 술어는 결손이 아니라 **없는 것**이다. 둘을 한 null 로
     *   합류시키면 AND 오염 규칙이 부재까지 먹어 조건 하나를 끄면 집합이 통째로 사라진다(종단
     *   경로는 늘 걷어내므로 멀쩡해, 같은 식이 두 우주에서 다른 답을 내던 자리다).
     *
     * ⚠ 접기는 **평가·표시와 같은 `foldExpr`** 을 지난다 — 여기서 따로 접으면 같은 식이 화면과
     *   평가에서 다른 뜻이 된다.
     */
    const walk = (raw: SetExpr, mine: string[]): Out => walkNode(foldExpr(activeExpr(raw)), mine);

    const out = walk(input, []);
    // 루트가 부재(= 제한 없음)면 "조건 없음"과 같다 — 재료를 안 당기는 그 상태(null).
    return { expr: out === ABSENT ? null : out, stages: status };
}

/**
 * 잎 하나짜리 칸의 **전이 수식어**는 술어에 싣는다 — 술어 하나짜리 칸에서 "칸 전이"와 "술어 전이"가
 * 동치라는 core 의 계약(applyTransition 주석)을 그대로 쓴다. 안 실으면 "하루 처음"이 조용히 사라져
 * 매 분 재발화한다(후보 수가 소리 없이 는다).
 */
const withTransition = (p: CellPredicate, t: FilterStage["transition"]): CellPredicate =>
    (t === undefined || p.transition !== undefined ? p : { ...p, transition: t });

// ── 모듈 메모 — 소비자가 셋이 된다(순회 목록 · 차트 ◇ · 날짜 경계 판정). 같은 (하루 재료, 조건, 노브)
//    조합을 두 번 평가하면 그 비용(0.25~0.47초)이 그대로 두 번 든다.
//    키의 바깥 축은 **격자 파생 배열 참조**(WeakMap) — 그게 갈리면 재료가 갈린 것이라 캐시도 같이
//    죽는 게 맞다(`themeRank/sectionSeries` 의 분 단면 WeakMap 과 같은 수법·같은 이유).
//    안쪽 키에 날짜·조건·노브·상한을 싣는다.
const MEMO = new WeakMap<object, Map<string, CellEvalResult>>();
/**
 * 한 재료(하루 스냅샷)당 살려 두는 조합 수. 산수는 **동시에 서 있는 서로 다른 조건 벌**이다:
 * 구독 패널 셋(시트·결과·작업 대상) + 차트 = 4 가 현실적 상한이고, 조건을 만지는 동안
 * 직전 것도 살아 있어야 편집이 매끄럽다(단계 ④ 에서 3 → 6). 넘치면 LRU 스래싱으로 **매 렌더
 * 재평가**가 나는데 그 대가가 0.25~0.47초다. 담는 것은 결과 배열이라 힙 부담은 작다.
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

export function useCellSet(
    expr: SetExpr | null,
    /** 참조를 펼칠 저장물 — **식과 같은 박자**여야 한다(호출부가 `funnel.slowSets` 를 그대로 넘긴다). */
    savedSets: readonly { id: string; expr: SetExpr; universe: Universe }[],
    date: string,
    opts?: CellEvalOptions,
): CellSetView {
    // ⚠ 늦추는 일은 **호출부가 한다** — 2026-09-22 에 「계산」 관문이 걷히면서 박자의 주인이
    //   깔때기 한 곳(`slowExpr`/`slowSets`)으로 모였다. 여기서 또 늦추면 관문이 두 곳이 된다.
    const narrowedEarly = useMemo(
        () => (expr === null
            ? { expr: null, stages: [] as CellStageStatus[] }
            : toCellExpr(expr, (id) => savedSets.find((f) => f.id === id))),
        [expr, savedSets],
    );
    // 평가할 조건이 없으면 **하루 재료를 안 당긴다** — /day-replay 는 한 날 13MB 다(실측).
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
    // 하루 타점 — 날짜 격자(둘 다)와 기준선(① 만). 안 쓰면 재료를 안 당기고 게이트도 안 선다.
    const needsDayGrid = useMemo(
        () => usesCellPred(narrowed.expr, (p) => p.kind === "baselineBreak" || p.kind === "levelRebreak"),
        [narrowed],
    );
    const needsBaseline = useMemo(() => usesCellPred(narrowed.expr, (p) => p.kind === "baselineBreak"), [narrowed]);
    const dayGridQ = useDayGrid(needsDayGrid ? date : null);
    const pointGrids = usePointGrids();
    // 재료가 **그 날짜의 것**일 때만 — 날짜를 넘기는 순간 옛 날짜 격자로 새 날짜 셀을 평가하면 조용히 틀린다.
    const dayGrids = dayGridQ.data?.date === date ? dayGridQ.data.byCode : null;
    const limit = opts?.limit;
    const hardCap = opts?.hardCap;
    const limitBy = opts?.limitBy;

    const result = useMemo(() => {
        if (!stocks || snapQ.data?.date !== date) return null;
        // ⚠ 재료가 없는 동안은 **null**(값을 모른다)이지 빈 결과가 아니다 — 빈 결과는 "조건에 다 걸렸다"로
        //   읽힌다(useBoundSet 의 UNRESOLVED 규칙). 기준선 재료(/point-grids)도 같다.
        if (needsDayGrid && dayGrids === null) return null;
        if (needsBaseline && pointGrids.byDate === null) return null;
        // 메모 키 — 조건·노브·**재료 세대를 전부** 싣는다. 하나라도 빠지면 조용히 낡은 목록을 돌려준다.
        //  · 바깥 축(WeakMap) = `stocks` 배열 참조 = 하루 재료의 세대. 오늘 날짜는 60초마다 재조회되므로
        //    이걸 안 가르면 새로 채워진 분의 후보가 세션 내내 안 뜬다.
        //  · 격자(`auto.points`)·테마 투영(`themes.proj`)은 참조를 키에 못 실으니 **세대 번호**로 태운다.
        const key = JSON.stringify([
            date, narrowed.expr, zoneParams, limit ?? null, hardCap ?? null, limitBy ?? null,
            genOf(auto.points), genOf(themes.proj),
            dayGrids ? genOf(dayGrids) : 0, needsBaseline && pointGrids.byDate ? genOf(pointGrids.byDate) : 0,
        ]);
        return evaluateMemo(stocks, key, () => {
            const mat = cellMaterialsOf(stocks, date, auto, themes.proj, zoneParams, needsDayGrid
                ? { grids: dayGrids, baselineOf: (code) => pointGrids.gridOf(code, date)?.base ?? null }
                : undefined);
            return evaluateCellsExpr(stocks, mat, narrowed.expr, {
                ...(limit !== undefined ? { limit } : {}),
                ...(hardCap !== undefined ? { hardCap } : {}),
                ...(limitBy !== undefined ? { limitBy } : {}),
            });
        });
    }, [stocks, snapQ.data?.date, date, auto, themes.proj, zoneParams, narrowed, limit, hardCap, limitBy,
        needsDayGrid, needsBaseline, dayGrids, pointGrids]);

    const items = useMemo<readonly FunnelItem[]>(
        () => (result ? result.hits.map((h) => cellHitToItem(h, date)) : EMPTY_ITEMS),
        [result, date],
    );

    const byCode = useMemo<ReadonlyMap<string, ReplayStock>>(
        () => (stocks ? new Map(stocks.map((s) => [s.code, s])) : EMPTY_MAP),
        [stocks],
    );

    return {
        hits: result?.hits ?? EMPTY_HITS,
        items,
        matched: result?.matched ?? 0,
        limit: result?.limit ?? 0,
        truncated: result?.truncated ?? false,
        tooWide: result?.tooWide ?? false,
        stages: narrowed.stages,
        byCode,
        // 재료 게이트는 **그 재료를 쓰는 조건이 있을 때만** 선다 — 칸을 지웠는데 격자 실패가 화면을
        // 죽이면 "지웠다"가 거짓말이 된다.
        isLoading: snapQ.isLoading || (needsGrid && auto.isLoading)
            || (needsDayGrid && dayGridQ.isLoading) || (needsBaseline && pointGrids.isLoading),
        error: firstError([
            snapQ.error as Error | null,
            needsDayGrid ? (dayGridQ.error as Error | null) : null,
            needsBaseline ? pointGrids.error : null,
            needsGrid ? auto.error : null,
        ]),
        themesReady: !needsZone || themes.ready,
        evaluable: narrowed.expr !== null,
        ready: result !== null,
    };
}

/** 재료 오류 중 첫째 — 쓰는 재료만 넘긴다(안 쓰는 재료의 실패가 화면을 죽이지 않게). */
const firstError = (errs: readonly (Error | null | undefined)[]): Error | null => errs.find((e) => e != null) ?? null;

/** 이 셀 식이 그 술어를 쓰나 — 재료 게이트(격자·분 단면)의 자. 트리를 끝까지 건다. */
export function usesCellPred(e: CellExpr | null, hit: (p: CellPredicate) => boolean): boolean {
    if (e === null) return false;
    if (e.kind === "pred") return hit(e.pred);
    return e.of.some((c) => usesCellPred(c, hit));
}
