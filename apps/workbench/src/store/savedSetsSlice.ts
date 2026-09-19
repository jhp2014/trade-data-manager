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
import { exprOfStages, findNode, hasCycle, parseExpr, refNode, replaceNode, ROOT_ID, type SetExpr } from "../panels/filter/expr.js";
import { LEGACY_ASSEMBLIES_KEY, parseLegacyAssemblies } from "../panels/filter/legacyAssemblies.js";
import { parseUniverse, type Universe } from "../panels/filter/universe.js";
import { putExpr } from "./filterFunnelSlice.js";
import { parsePointDef } from "../lib/pointDef.js";
import { persistPointDef } from "./pointDefSlice.js";
import { backupRawOnce, loadJson, saveJson } from "./persist.js";

const LEGACY_SETS_KEY = "wb.filterFunnelSets"; // 옛 "저장한 깔때기" — 저장 집합(부위=생존자)으로 읽어 들인다
// v3 로 키를 올린 이유(2026-09-09): 허용 폭 T 가 정의에서 결과 술어로 내려가 옛 결과 술어에 t 가 없다 —
// 그 기준(옛 정의의 T1)은 복원할 수 없어 승계하지 않는다(사용자 확정 "기존 저장물은 버린다").
// (v2 는 2026-08-23 골격 은퇴 리셋이었다.)
const SAVED_SETS_KEY = "wb.savedSets.v4"; // v4: 조건이 리스트 → **식 트리**(2026-09-19)
const SAVED_SETS_V3_KEY = "wb.savedSets.v3"; // 옛 평평한 리스트 — 승계해서 읽는다(AND(잎…))

/**
 * 저장 집합 — **자립 저장물**(이름 + 조건 사본). 집합끼리 아무것도 공유하지 않는다: 같은 깔때기에서
 * 두 집합을 뽑아도 조건이 각자에게 복사되고, 하나를 덮어써도 다른 하나는 절대 안 바뀐다(사용자 확정).
 * 정의 저장이라 라이브다 — 멤버는 읽는 순간 재계산되고, 죽은 참조(지워진 그룹·축)는 3치가 받아낸다.
 */
export interface SavedSet {
    id: string;
    name: string;
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
    saveJson(SAVED_SETS_KEY, sets);
    return sets;
};

/**
 * 저장물 파싱 — **항목 단위로 건너뛴다**(집합 하나가 깨져도 나머지는 산다). 조건 배열 안쪽의
 * all-or-nothing 은 `parseStages` 의 규칙이고 여기선 그 결과가 null 이면 그 집합만 버린다.
 * 하위호환 골든(`filter/__tests__/legacyCompat.test.ts`)이 이 함수의 결과를 글자까지 고정한다.
 */
export function parseSavedSets(o: unknown): SavedSet[] | null {
    if (!Array.isArray(o)) return null;
    const out: SavedSet[] = [];
    for (const raw of o) {
        const f = raw as { id?: unknown; name?: unknown; stages?: unknown; expr?: unknown; part?: unknown; pointDef?: unknown; universe?: unknown };
        if (typeof f?.id !== "string" || typeof f?.name !== "string") continue;
        // 옛 부위(part) 승계 — **"짚은 칸"이던 집합은 이 항목만 버린다**(2026-09-19 사용자 확정).
        // 조용히 최종 생존으로 넓히지 않는 이유: 그 집합은 "단계 s1 의 fail 칸"을 뜻했고 생존자는
        // 보통 훨씬 크고 성격이 다르다 — 이름만 같은 다른 모수를, 고정 구독 중인 패널이 표식 없이
        // 그리게 된다. 옛 `cell` **바인딩**을 orphan 으로 큰 소리 내는 규칙(setRef.ts)과 같은 편이다.
        // 생존자 부위·부위 없음은 그대로 산다(부위라는 개념만 없어졌을 뿐 집합은 멀쩡하다).
        if (typeof f.part === "object" && f.part !== null && (f.part as { kind?: unknown }).kind === "cell") continue;
        // 새 모양(expr) 우선, 없으면 옛 리스트(stages)를 AND(잎…) 로 승계한다 — **잎 id 는 그대로**다
        // (시트 인스턴스 열·급타점 축·테마 연동이 그 id 를 주소로 쓴다).
        const expr = f.expr !== undefined
            ? parseExpr(f.expr, parseStages)
            : (() => { const st = parseStages(f.stages); return st === null ? null : exprOfStages(st); })();
        if (!expr) continue;
        const universe = parseUniverse(f.universe); // 부재·오염 = 종단(집합 폐기 사유가 아니다)
        // 정의는 additive — 없거나 오염이면 필드 생략(열 때 현재 정의 유지). 집합 통째 폐기 사유가 아니다.
        const pointDef = f.pointDef !== undefined ? (parsePointDef(f.pointDef) ?? undefined) : undefined;
        // 옛 저장물의 pointSource(출처 토글)는 조용히 버린다 — 출처가 하나가 됐다(2026-09-01).
        out.push({ id: f.id, name: f.name, expr, universe, ...(pointDef ? { pointDef } : {}) });
    }
    return out;
}

/** 새 키를 먼저 읽고, 없으면 옛 "저장한 깔때기"를 부위=생존자로 이관한다(id 유지 — 옛 필터 바인딩이
 *  같은 id 의 saved 참조로 무손실 전환되는 근거). 옛 키는 안 지운다 — 새 키가 생기면 자연히 안 읽힌다. */
/**
 * 옛 조립(∪) 승계 — 재워 둔 저장물(`legacyAssemblies`)을 **`OR(참조…)` 집합**으로 올린다.
 * 2026-09-08 조립의 뜻이 정확히 이것이었다: 부품 참조들의 평평한 합집합. 그래서 무손실이다.
 *
 * 규칙 셋:
 *  · **꺼둔 부품(enabled=false)은 안 싣는다** — 그때 화면이 내던 것이 곧 켠 부품들의 합집합이었다.
 *  · **죽은 부품(지워진 setId)도 싣는다** — 거르면 조용히 다른 집합이 된다. 참조가 깨진 채로 서고
 *    화면이 "(지워진 집합)" 으로 말한다(결손이지 거짓이 아니다).
 *  · **이름 충돌은 꼬리 숫자** — 같은 이름 덮어쓰기(saveSet 규칙)는 승계의 뜻이 아니다.
 *
 * 한 번 올리고 나면 새 키에 실려 다시 안 돈다(옛 키는 안 지운다 — 되돌림 경로).
 */
function migrateAssemblies(sets: SavedSet[], universe: Universe): SavedSet[] {
    const legacy = loadJson(LEGACY_ASSEMBLIES_KEY, parseLegacyAssemblies);
    if (!legacy || legacy.length === 0) return sets;
    const out = [...sets];
    for (const a of legacy) {
        const members = a.members.filter((m) => m.enabled);
        if (members.length === 0) continue;
        let name = `∪ ${a.name}`;
        for (let i = 2; out.some((x) => x.name === name); i++) name = `∪ ${a.name} ${i}`;
        out.push({
            id: a.id, // 옛 조립 id 를 그대로 — 그 조립을 가리키던 핀이 나중에 이어질 수 있는 유일한 끈이다
            name,
            expr: { kind: "or", id: ROOT_ID, of: members.map((m) => refNode(m.setId)) },
            universe,
        });
    }
    return out;
}

const loadSavedSets = (): SavedSet[] => {
    // 식 트리로 바뀌기 **전에** v3 원문을 한 번 뜬다(되돌림 경로 — 새 모양을 옛 코드가 읽으면 통째 폐기다).
    backupRawOnce(SAVED_SETS_V3_KEY, "pre-expr");
    const fresh = loadJson(SAVED_SETS_KEY, (o) => (Array.isArray(o) ? o : null));
    if (fresh) return parseSavedSets(fresh) ?? [];
    // v3(평평한 리스트)를 **승계해서 읽는다** — 같은 파서가 stages 갈래로 받아 AND(잎…) 로 올린다.
    // 옛 조립도 이때 함께 올라온다(OR(참조…)). 새 키에 실리는 순간 둘 다 다시 안 돈다.
    const v3 = loadJson(SAVED_SETS_V3_KEY, (o) => (Array.isArray(o) ? o : null));
    if (v3) return persistSavedSets(migrateAssemblies(parseSavedSets(v3) ?? [], "longitudinal"));
    const onlyAssemblies = migrateAssemblies([], "longitudinal");
    if (onlyAssemblies.length > 0) return persistSavedSets(onlyAssemblies);
    // v3 리셋 이전 키들(v2·wb.savedSets·LEGACY)은 읽지 않는다 — 옛 leaf·t 없는 결과 술어의 뒷문이 된다.
    void LEGACY_SETS_KEY;
    return [];
};

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
    /**
     * **다른 우주로 복제**(⧉) — 조건을 **그대로** 옮긴 새 집합을 만든다. 이 추상화가 값을 치르는 자리:
     * 종단에서 검증한 조건을 오늘 후보에 그대로 적용하는 경로다.
     * ⚠ 결손이 될 조건도 **버리지 않는다** — 결손은 사실이지 삭제 사유가 아니고, 재료가 생기면
     * 문법 변경 없이 켜진다는 약속이 여기서 지켜진다(경고는 화면이 먼저 보여준다).
     */
    cloneSetToUniverse: (id: string, universe: Universe) => void;
    /** 이름만 바꾼다(id·조건 유지 — 바인딩이 id 로 따라오므로 이름은 표시물일 뿐). 빈 이름·다른 집합과 같은 이름은 무시. */
    renameSet: (id: string, name: string) => void;
    deleteSet: (id: string) => void;
    /**
     * **이름 붙이기(승격)** — 작업 식의 묶음 하나를 집합으로 떼어내고, 그 자리엔 참조가 남는다.
     * 이게 중첩을 재사용 가능하게 만드는 유일한 손짓이다(익명 묶음 = 아직 이름값을 못 한 구조).
     * 빈 이름·중복 이름·없는 노드는 무시한다(saveSet 의 규칙과 같은 자).
     */
    promoteNodeToSet: (nodeId: string, name: string) => void;
    /** 마지막으로 연 집합 — 덮어쓰기 버튼의 대상. 그 집합이 지워지면 풀린다(세션 한정). */
    openedSetId: string | null;
}

export const createSavedSetsSlice: StateCreator<WorkbenchState, [], [], SavedSetsSlice> = (set) => ({
    savedSets: loadSavedSets(),
    openedSetId: null,

    // 같은 이름 = 같은 물건 — **엎어쓰기**(id 유지). 저장이 늘 새 항목이면 참조(패널 바인딩의 saved id)가
    // 옛 스냅샷에 묶여, "집합을 고쳐 저장했는데 바인딩은 옛것"이라는 조용한 갈림이 생긴다.
    saveSet: (name) => set((s) => {
        const n = name.trim();
        const expr = s.filterExpr;
        const universe = s.filterUniverse;
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
    promoteNodeToSet: (nodeId, name) => set((s) => {
        const n = name.trim();
        const node = findNode(s.filterExpr, nodeId);
        if (n === "" || node === null || s.savedSets.some((x) => x.name === n)) return {};
        const id = `fs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const saved: SavedSet = { id, name: n, expr: node, universe: s.filterUniverse, pointDef: s.pointDef };
        const sets = persistSavedSets([...s.savedSets, saved]);
        // 그 자리는 참조로 — **부정은 참조에 남긴다**(¬(a∧b) 를 승격했는데 부정이 사라지면 뜻이 갈린다).
        const neg = node.neg === true;
        const next = replaceNode(s.filterExpr, nodeId, () => (neg ? { ...refNode(id), neg: true } : refNode(id)));
        return { savedSets: sets, openedSetId: id, ...putExpr(next) };
    }),
    overwriteSet: (id) => set((s) => {
        if (!s.savedSets.some((x) => x.id === id)) return {};
        const exprOfSet = (sid: string): SetExpr | undefined => s.savedSets.find((x) => x.id === sid)?.expr;
        if (hasCycle(id, s.filterExpr, exprOfSet)) return {}; // 순환 거절(saveSet 과 같은 규칙)
        // 조건·정의만 바뀐다(이름 유지). 같은 조건에서 나온 형제 집합이 있어도 **이 하나만** — 느리지만 암묵이 없다.
        // 우주도 함께 굳힌다 — 덮어쓰기는 "지금 만지는 것"을 그 집합으로 밀어 넣는 손짓이라, 우주만
        // 옛것으로 남으면 조건과 우주가 갈린 집합이 생긴다(그 순간 결손 지도가 거짓말한다).
        const next = s.savedSets.map((x) => (x.id === id ? { ...x, expr: s.filterExpr, universe: s.filterUniverse, pointDef: s.pointDef } : x));
        saveJson(SAVED_SETS_KEY, next);
        return { savedSets: next };
    }),
    openSet: (id) => set((s) => {
        const f = s.savedSets.find((x) => x.id === id);
        if (!f) return {};
        // 사본이 작업 깔때기로(식 공유는 안전 — 편집 함수들이 늘 새 노드를 만든다).
        // 정의도 그 집합의 것으로 되돌린다(같은 영속 경로 persistPointDef) — 없는 옛 저장물은 현재 정의 유지.
        return {
            ...putExpr(f.expr, f.universe),
            openedSetId: id,
            ...(f.pointDef ? { pointDef: persistPointDef(f.pointDef) } : {}),
        };
    }),
    cloneSetToUniverse: (id, universe) => set((s) => {
        const src = s.savedSets.find((x) => x.id === id);
        if (!src || src.universe === universe) return {};
        const base = `${src.name} (${universe === "daily" ? "하루" : "종단"})`;
        // 이름 충돌은 꼬리 숫자로 — 같은 이름 덮어쓰기(saveSet 규칙)는 복제의 뜻이 아니다.
        let name = base;
        for (let i = 2; s.savedSets.some((x) => x.name === name); i++) name = `${base} ${i}`;
        const copy: SavedSet = {
            id: `fs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            name,
            expr: src.expr,
            universe,
            ...(src.pointDef ? { pointDef: src.pointDef } : {}),
        };
        return { savedSets: persistSavedSets([...s.savedSets, copy]) };
    }),
    renameSet: (id, name) => set((s) => {
        const n = name.trim();
        if (!n || s.savedSets.some((x) => x.id !== id && x.name === n) || !s.savedSets.some((x) => x.id === id)) return {};
        const next = s.savedSets.map((x) => (x.id === id ? { ...x, name: n } : x));
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
