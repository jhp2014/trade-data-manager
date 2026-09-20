// 저장 집합 슬라이스 — 집합 편성 패널이 게시한 **이름 붙인 산출물**의 목록(영속).
//
// 작업 깔때기(filterFunnelSlice — 조건 한 벌·시선·선택 포인터)와 일부러 갈라져 있다: 저쪽은 "지금 만지는
// 조건", 여기는 "이름을 붙여 게시한 저장물"이라 수명이 다르다(깔때기는 편집마다 변하고, 저장물은
// 저장·덮어쓰기에만 변한다). 접점은 putStages 하나 — 열기(openSet)도 "깔때기에 조건을 쓰는 손"이라
// 같은 규칙(영속·포인터 정리)을 지난다.
import type { StateCreator } from "zustand";
import type { PointDefinition } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";
import { parseStages } from "../panels/filter/stage.js";
import { hasCycle, parseExpr, type SetExpr } from "../panels/filter/expr.js";
import { effectiveUniverse, universeOfExpr, parseUniverse, type Universe } from "../panels/filter/universe.js";
import { putExpr } from "./filterFunnelSlice.js";
import { parsePointDef } from "../lib/pointDef.js";
import { persistPointDef } from "./pointDefSlice.js";
import { loadJson, saveJson } from "./persist.js";


// v3 로 키를 올린 이유(2026-09-09): 허용 폭 T 가 정의에서 결과 술어로 내려가 옛 결과 술어에 t 가 없다 —
// 그 기준(옛 정의의 T1)은 복원할 수 없어 승계하지 않는다(사용자 확정 "기존 저장물은 버린다").
// (v2 는 2026-08-23 골격 은퇴 리셋이었다.)
/**
 * v5: **묶음이 곧 집합**(2026-09-20 — 식 1층화). 옛 키(v4·v3·그 이전)는 **안 읽는다**.
 *
 * ⚠ 승계를 안 만든 것은 사용자 확정이다("기존 저장물 제거해도 된다"). 그 대가로 집합·조건 id 가
 * 새로 생기므로 **그 id 를 주소로 쓰던 것들도 같이 리셋된다** — 패널 핀·테마 순위 판 연동·시트의
 * 결과 열/급타점 열 설정(폭·고정·숨김·프리셋). 옛 키는 **지우지 않는다**: 안 읽으면 자연히 죽고,
 * 되돌릴 자리를 남긴다(이 레포의 관례).
 */
const SAVED_SETS_KEY = "wb.savedSets.v5";

/**
 * 저장 집합 — **자립 저장물**(이름 + 조건 사본). 집합끼리 아무것도 공유하지 않는다: 같은 깔때기에서
 * 두 집합을 뽑아도 조건이 각자에게 복사되고, 하나를 덮어써도 다른 하나는 절대 안 바뀐다(사용자 확정).
 * 정의 저장이라 라이브다 — 멤버는 읽는 순간 재계산되고, 죽은 참조(지워진 그룹·축)는 3치가 받아낸다.
 */
export interface SavedSet {
    id: string;
    /**
     * **손으로 지은 이름**(2026-09-20 부터 옵셔널). 부재 = 자동 이름(`label.autoSetName`)으로 화면이
     * 채우고 칩이 **점선**으로 선다 — "아직 생각이 안 굳음 / 개념이 됨"을 화면이 계속 말한다.
     * 저장 시점에 자동 이름을 굽지 않는 이유는 `autoSetName` 머리 주석(재료가 그때 없다).
     * 이름 충돌 거절도 **손으로 지은 이름끼리만** 본다.
     */
    name?: string;
    /** 이 집합의 **식**(2026-09-19 부터 트리). 잎 목록이 필요하면 `leavesOf`. */
    expr: SetExpr;
    /** 자동 타점 정의 사본(집합 자립 — 게이트가 다르면 같은 조건도 다른 모수를 센다). 옛 저장물엔 없음 →
     *  열 때 현재 정의 유지(관대한 병합 — additive, 키 상향 금지 규칙). */
    pointDef?: PointDefinition;
    /**
     * 이 집합이 사는 **우주**(2026-09-18 단계 ②). 부재·오염 = `longitudinal` — 우주 선언이 없던 시절
     * 저장물의 행동 그대로다. **낟알(grain)은 저장하지 않는다**(조건에서 파생 — stage.ts 머리 주석의
     * 규칙을 깨지 않는다. `day×하루` 를 켜는 날 `grain?` 을 additive 로 더한다).
     *
     * ⚠ 이 필드 때문에 **저장 키를 올리지 않았다** — 전부 additive 라 옛 저장물의 파싱이 안 바뀐다.
     * 키를 올리면 사용자의 집합이 전멸하는데 얻는 게 없다(v3 상향은 "복원 불가능한 의미 변화"의 처방이었다).
     */
    universe: Universe;
}

/** 저장 집합 영속 — 슬라이스 밖(그룹 개명 승계)에서도 같은 키로 쓰기 위한 유일한 출구. */
export const persistSavedSets = (sets: SavedSet[]): SavedSet[] => {
    const next = reconcileUniverses(sets);
    saveJson(SAVED_SETS_KEY, next);
    return next;
};

/**
 * 참조가 바뀌면 **참조하는 쪽의 우주도 다시 굳힌다** — 쓰기 경로 하나(persistSavedSets)에서.
 *
 * ⚠ 없으면 갈린다: `A = OR(∈B)` 를 저장한 뒤 B 를 열어 하루 조건으로 덮어쓰면 B 만 daily 가 되고
 * A 는 옛 파생값(종단)으로 남는다. 그 순간 `refUniverse`("저장물 값을 그대로 믿는다")의 전제가 깨져
 * A 가 종단 기계로 풀리고 **조건이 있는데 아무것도 안 걸리는 빈 집합**이 조용히 나온다.
 *
 * ⚠ **파생이 null(중립 조건뿐·참조 못 품)이면 저장값을 그대로 둔다.** 우주 선언 시절의 저장물 중에는
 * "시각 조건 하나만 든 하루 집합"처럼 조건이 우주를 안 정하는 것이 있다 — 그걸 종단으로 밀면 승계가
 * 사용자의 집합을 조용히 다른 우주로 옮긴다. 모르면 마지막으로 알던 값이 최선이다.
 *
 * 되풀이는 집합 수만큼이면 충분하다(참조 그래프는 비순환 — 저장 때 거절한다).
 */
function reconcileUniverses(sets: SavedSet[]): SavedSet[] {
    let cur = sets;
    for (let pass = 0; pass <= sets.length; pass++) {
        const look = refUniverse(cur);
        let changed = false;
        const next = cur.map((x) => {
            const u = universeOfExpr(x.expr, look);
            if (u === null || u === x.universe) return x;
            changed = true;
            return { ...x, universe: u };
        });
        if (!changed) return cur;
        cur = next;
    }
    return cur;
}

/**
 * 저장물 파싱 — **항목 단위로 건너뛴다**(집합 하나가 깨져도 나머지는 산다). 조건 배열 안쪽의
 * all-or-nothing 은 `parseStages` 의 규칙이고 여기선 그 결과가 null 이면 그 집합만 버린다.
 * 하위호환 골든(`filter/__tests__/legacyCompat.test.ts`)이 이 함수의 결과를 글자까지 고정한다.
 */
export function parseSavedSets(o: unknown): SavedSet[] | null {
    if (!Array.isArray(o)) return null;
    const out: SavedSet[] = [];
    for (const raw of o) {
        const f = raw as { id?: unknown; name?: unknown; expr?: unknown; pointDef?: unknown; universe?: unknown };
        if (typeof f?.id !== "string") continue; // 이름은 옵셔널 — 부재 = 자동 이름(점선 칩)
        const expr = parseExpr(f.expr, parseStages);
        if (!expr) continue;
        const universe = parseUniverse(f.universe); // 부재·오염 = 종단(집합 폐기 사유가 아니다)
        // 정의는 additive — 없거나 오염이면 필드 생략(열 때 현재 정의 유지). 집합 통째 폐기 사유가 아니다.
        const pointDef = f.pointDef !== undefined ? (parsePointDef(f.pointDef) ?? undefined) : undefined;
        // 옛 저장물의 pointSource(출처 토글)는 조용히 버린다 — 출처가 하나가 됐다(2026-09-01).
        const name = typeof f.name === "string" && f.name.trim() !== "" ? f.name : undefined;
        out.push({ id: f.id, expr, universe, ...(name !== undefined ? { name } : {}), ...(pointDef ? { pointDef } : {}) });
    }
    return out;
}

/** 새 키를 먼저 읽고, 없으면 옛 "저장한 깔때기"를 부위=생존자로 이관한다(id 유지 — 옛 필터 바인딩이
 *  같은 id 의 saved 참조로 무손실 전환되는 근거). 옛 키는 안 지운다 — 새 키가 생기면 자연히 안 읽힌다. */
const loadSavedSets = (): SavedSet[] =>
    parseSavedSets(loadJson(SAVED_SETS_KEY, (o) => (Array.isArray(o) ? o : null))) ?? [];

export interface SavedSetsSlice {
    /** 저장 집합들(영속) — 집합 편성 패널이 만든 산출물. 집합 칩·연동 피커의 유일한 저장물 목록. */
    savedSets: SavedSet[];
    /** 지금 조건으로 집합 저장 — 같은 이름 = 같은 물건, 엎어쓰기(id 유지 — 그 집합을 고정 구독 중인 바인딩이 따라온다). */
    saveSet: (name: string) => void;
    /** 열어 둔 집합에 지금 조건을 덮어쓴다 — **그 집합 하나만** 바뀐다(이름 유지). */
    overwriteSet: (id: string) => void;
    /**
     * 집합을 깔때기로 연다 — 조건 **사본**이 작업 깔때기에 펼쳐진다. 이후 편집은 저장물을 안 흔들고,
     * 덮어쓰기를 눌러야 실제로 바뀐다(보드에서 만지는 동안 고정 구독 패널이 작업 중간 상태를 받지 않게).
     */
    openSet: (id: string) => void;
    /** 이름만 바꾼다(id·조건 유지 — 바인딩이 id 로 따라오므로 이름은 표시물일 뿐). 빈 이름·다른 집합과 같은 이름은 무시. */
    renameSet: (id: string, name: string) => void;
    deleteSet: (id: string) => void;
    /** 마지막으로 연 집합 — 덮어쓰기 버튼의 대상. 그 집합이 지워지면 풀린다(세션 한정). */
    openedSetId: string | null;
}

/**
 * 참조가 가리키는 집합의 우주 — 저장물이 **들고 있는 값을 그대로** 믿는다.
 * 그 값은 저장 시점에 같은 규칙(universeOfExpr)으로 파생해 굳힌 것이라 재귀가 필요 없고,
 * 순환은 saveSet/overwriteSet 이 미리 거절한다. 없는 집합(지워진 참조)은 null = 우주를 안 정한다.
 */
export const refUniverse = (sets: readonly SavedSet[]) => (id: string): Universe | null =>
    sets.find((x) => x.id === id)?.universe ?? null;

export const createSavedSetsSlice: StateCreator<WorkbenchState, [], [], SavedSetsSlice> = (set) => ({
    savedSets: loadSavedSets(),
    openedSetId: null,

    // 같은 이름 = 같은 물건 — **엎어쓰기**(id 유지). 저장이 늘 새 항목이면 참조(패널 바인딩의 saved id)가
    // 옛 스냅샷에 묶여, "집합을 고쳐 저장했는데 바인딩은 옛것"이라는 조용한 갈림이 생긴다.
    saveSet: (name) => set((s) => {
        const n = name.trim();
        const expr = s.filterExpr;
        const universe = effectiveUniverse(universeOfExpr(expr, refUniverse(s.savedSets)));
        const at = s.savedSets.findIndex((x) => x.name === n);
        // ⚠ **순환 참조 거절** — 자기를 (건너서라도) 참조하는 집합은 평가가 무한히 내려가고 드릴다운
        //   빵부스러기도 끝이 없다. 엎어쓰기일 때만 생길 수 있다(새 id 는 아직 아무도 안 가리킨다).
        const exprOfSet = (sid: string): SetExpr | undefined => s.savedSets.find((x) => x.id === sid)?.expr;
        if (at >= 0 && hasCycle(s.savedSets[at]!.id, expr, exprOfSet)) return {};
        // 정의도 사본으로 — 식과 같은 이유(자립). 저장 순간의 정의가 이 집합의 모수 정의다.
        const saved = at >= 0
            ? { ...s.savedSets[at]!, expr, universe, pointDef: s.pointDef }
            // id 에 난수 꼬리 — 시각만으로는 같은 ms 의 연속 저장이 같은 id 가 된다(newStageId 와 같은 규칙).
            : { id: `fs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, expr, universe, pointDef: s.pointDef };
        const next = at >= 0 ? s.savedSets.map((x, i) => (i === at ? saved : x)) : [...s.savedSets, saved];
        saveJson(SAVED_SETS_KEY, next);
        // 방금 저장한 집합이 곧 "열어 둔 집합" — 이어서 만지면 덮어쓰기가 그 집합을 가리킨다.
        return { savedSets: next, openedSetId: saved.id };
    }),
    overwriteSet: (id) => set((s) => {
        if (!s.savedSets.some((x) => x.id === id)) return {};
        const exprOfSet = (sid: string): SetExpr | undefined => s.savedSets.find((x) => x.id === sid)?.expr;
        if (hasCycle(id, s.filterExpr, exprOfSet)) return {}; // 순환 거절(saveSet 과 같은 규칙)
        // 조건·정의만 바뀐다(이름 유지). 같은 조건에서 나온 형제 집합이 있어도 **이 하나만** — 느리지만 암묵이 없다.
        // 우주도 함께 굳힌다 — 덮어쓰기는 "지금 만지는 것"을 그 집합으로 밀어 넣는 손짓이라, 우주만
        // 옛것으로 남으면 조건과 우주가 갈린 집합이 생긴다(그 순간 결손 지도가 거짓말한다).
        const next = s.savedSets.map((x) => (x.id === id ? { ...x, expr: s.filterExpr, universe: effectiveUniverse(universeOfExpr(s.filterExpr, refUniverse(s.savedSets))), pointDef: s.pointDef } : x));
        saveJson(SAVED_SETS_KEY, next);
        return { savedSets: next };
    }),
    openSet: (id) => set((s) => {
        const f = s.savedSets.find((x) => x.id === id);
        if (!f) return {};
        // 사본이 작업 깔때기로(식 공유는 안전 — 편집 함수들이 늘 새 노드를 만든다).
        // 정의도 그 집합의 것으로 되돌린다(같은 영속 경로 persistPointDef) — 없는 옛 저장물은 현재 정의 유지.
        return {
            ...putExpr(f.expr),
            openedSetId: id,
            ...(f.pointDef ? { pointDef: persistPointDef(f.pointDef) } : {}),
        };
    }),
    renameSet: (id, name) => set((s) => {
        const n = name.trim();
        // **빈 이름 = 자동 이름으로 되돌리기**(2026-09-20) — 손 이름을 떼면 점선 칩으로 돌아간다.
        //   막지 않는 이유: 쓰는 곳이 있어도 참조하는 쪽이 그 자동 이름을 보는 게 정직하다.
        // 충돌 거절은 **손으로 지은 이름끼리만** 본다(자동 이름은 `name` 부재라 비교에 안 걸린다).
        if (!s.savedSets.some((x) => x.id === id)) return {};
        if (n !== "" && s.savedSets.some((x) => x.id !== id && x.name === n)) return {};
        const next = s.savedSets.map((x) => {
            if (x.id !== id) return x;
            if (n === "") { const { name: _drop, ...rest } = x; return rest; }
            return { ...x, name: n };
        });
        saveJson(SAVED_SETS_KEY, next);
        return { savedSets: next };
    }),
    deleteSet: (id) => set((s) => {
        const next = s.savedSets.filter((x) => x.id !== id);
        saveJson(SAVED_SETS_KEY, next);
        const sel = s.selectedSetRef;
        return {
            savedSets: next,
            ...(s.openedSetId === id ? { openedSetId: null } : {}),
            // 선택 포인터도 그 집합이면 푼다(작업 깔때기 복귀) — 연동 패널 전부가 죽은 참조를 보게 두지 않는다.
            // 고정 바인딩은 일부러 안 푼다(깨진 참조 표시가 그쪽의 계약이다 — 패널마다 라벨과 전환 손잡이가 받는다).
            ...(sel?.kind === "saved" && sel.setId === id ? { selectedSetRef: null } : {}),
        };
    }),
});
