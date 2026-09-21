// 저장 집합 — **묶음·집합·조건 모음이 한 물건**인 모델의 저장물(2026-09-20).
//
// 편집 대상은 여기 목록의 집합 하나(`editingSetId`, 영속)이고 조건 편집은 곧 그 집합의 갱신이다
// (`filterFunnelSlice.putExpr` 이 유일한 쓰기 손). 그래서 「저장」·「덮어쓰기」가 없다.
//
// 중첩은 식 안이 아니라 **참조**로 산다 — `addGroupTerm`(새로 만들어 붙이기)과 `addSetRef`(기존 것
// 붙이기) 둘이 그 손이고, 순환 거절은 후자 하나면 된다(전자는 갓 만든 집합이라 원리적으로 안 난다).
//
// ⚠ 집합은 **자립 저장물**이다 — 참조로 엮여도 내용은 각자의 것이고, 지워진 참조는 조용히 안 넓어지고
// "깨짐"으로 선다.

import type { StateCreator } from "zustand";
import type { PointDefinition } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";
import { parseStages } from "../panels/filter/stage.js";
import { appendTerm, emptyExpr, hasCycle, parseExpr, refNode, refsOf, type SetExpr } from "../panels/filter/expr.js";
import { universeOfExpr, parseUniverse, UNIVERSES, type Universe } from "../panels/filter/universe.js";
import { parsePointDef } from "../lib/pointDef.js";
import { persistPointDef } from "./pointDefSlice.js";
import { loadJson, saveJson } from "./persist.js";
import { loadFilterMode } from "./filterMode.js";


// v3 로 키를 올린 이유(2026-09-09): 허용 폭 T 가 정의에서 결과 술어로 내려가 옛 결과 술어에 t 가 없다 —
// 그 기준(옛 정의의 T1)은 복원할 수 없어 승계하지 않는다(사용자 확정 "기존 저장물은 버린다").
// (v2 는 2026-08-23 골격 은퇴 리셋이었다.)
/**
 * v5: **묶음이 곧 집합**(2026-09-20 — 식 1층화). 옛 키(v4·v3·그 이전)는 **안 읽는다**.
 *
 * ⚠ 승계를 안 만든 것은 사용자 확정이다("기존 저장물 제거해도 된다" — 2026-09-20, 식 모양이 다시
 * 바뀐 2026-09-21 에도 같은 확정). 그 대가로 집합·조건 id 가 새로 생기므로 **그 id 를 주소로 쓰던
 * 것들도 같이 리셋된다** — 패널 핀·테마 순위 판 연동·시트의 결과 열/급타점 열 설정(폭·고정·숨김·
 * 프리셋). 옛 키는 **지우지 않는다**: 안 읽으면 자연히 죽고, 되돌릴 자리를 남긴다(이 레포의 관례).
 *
 * ⚠ **v6 = 식에 `ops`·`groups` 가 생긴 판**(한 겹 괄호). v5 를 그대로 읽으면 `kind` 만 있고 `ops` 가
 * 없어 파서가 전부 `and` 로 채우는데, 그러면 옛 OR 집합이 **조용히 AND** 가 된다 — 키를 올려
 * 안 읽는 쪽이 정직하다.
 */
const SAVED_SETS_KEY = "wb.savedSets.v6";

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
 * 되풀이는 집합 수만큼이면 충분하다(참조 그래프는 비순환 — `addSetRef` 가 거절한다).
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

/** 새 집합 id — 시각 + 난수 꼬리(같은 ms 의 연속 생성이 같은 id 가 되지 않게). */
const newSetId = (): string => `fs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 빈 집합 하나 — 이름은 안 짓는다(자동 이름 = 점선 칩). **태어나는 모드가 곧 그 집합의 우주**다. */
const blankSet = (universe: Universe): SavedSet => ({ id: newSetId(), expr: emptyExpr(), universe });

/** 이 모드에 속한 집합들 — 목록·자리·폴백이 **같은 자**를 쓴다. */
export const setsOfMode = (sets: readonly SavedSet[], mode: Universe): SavedSet[] =>
    sets.filter((x) => x.universe === mode);

/**
 * 저장 집합 로드 — **지금 모드에 하나도 없으면 빈 집합 하나를 만든다.**
 * 잎이 최상위에 못 뜨는 모델이라(2026-09-20) 편집할 집합이 반드시 하나는 있어야 하고,
 * 모드가 장부를 가른 뒤로는(2026-09-22) 그 불변식이 **모드별**이다.
 * ⚠ **반대 모드의 빈 집합은 여기서 안 만든다** — 쓰지도 않은 모드에 빈 집합이 서 있게 된다.
 *   전환하는 순간(`switchSeat`) 만든다.
 */
const loadSavedSets = (mode: Universe): SavedSet[] => {
    const sets = parseSavedSets(loadJson(SAVED_SETS_KEY, (o) => (Array.isArray(o) ? o : null))) ?? [];
    return setsOfMode(sets, mode).length > 0 ? sets : persistSavedSets([...sets, blankSet(mode)]);
};

/**
 * **모드별 편집 자리**(영속 — 2026-09-22). `{ longitudinal: {id, path}, daily: {id, path} }`.
 *
 * 경로가 영속인 이유는 2026-09-21 그대로다: 경로의 **뿌리가 곧 관측 대상**이라, 새로고침에
 * `[편집 대상]` 으로 재구성되면 **내려가 있던 자식 집합이 뿌리가 되고** 그 집합이 비어 있으면
 * 필터 0(= 제한 없음)이 되어 전 모수가 하류로 쏟아진다.
 */
const EDIT_SEAT_KEY = "wb.editSeat.v1";
/** 승계 원본 — 모드가 하나였던 시절의 두 키. 한 번 읽고 나면 새 키가 진실이다(옛 키는 안 지운다). */
const OLD_EDITING_KEY = "wb.editingSetId.v1";
const OLD_EDIT_PATH_KEY = "wb.editPath.v1";

export interface EditSeat { id: string; path: string[] }
type SeatMap = Partial<Record<Universe, EditSeat>>;

const parseSeatMap = (o: unknown): SeatMap | null => {
    if (typeof o !== "object" || o === null) return null;
    const out: SeatMap = {};
    for (const u of UNIVERSES) {
        const raw = (o as Record<string, unknown>)[u];
        if (typeof raw !== "object" || raw === null) continue;
        const r = raw as { id?: unknown; path?: unknown };
        if (typeof r.id !== "string" || r.id === "") continue;
        const path = Array.isArray(r.path) && r.path.every((x) => typeof x === "string") ? (r.path as string[]) : [r.id];
        out[u] = { id: r.id, path };
    }
    return out;
};

/** 옛 두 키 → 그 집합의 **우주 칸**으로. 한 번뿐이다(새 키가 서면 안 읽힌다). */
const legacySeat = (sets: readonly SavedSet[]): SeatMap => {
    const id = loadJson(OLD_EDITING_KEY, (o) => (typeof o === "string" && o !== "" ? o : null));
    const set = id === null ? undefined : sets.find((x) => x.id === id);
    if (!set) return {};
    const raw = loadJson(OLD_EDIT_PATH_KEY, (o) => (Array.isArray(o) && o.every((x) => typeof x === "string") ? (o as string[]) : null)) ?? [];
    const path = raw.filter((p) => sets.some((x) => x.id === p));
    return { [set.universe]: { id: set.id, path: path.length > 0 && path[path.length - 1] === set.id ? path : [set.id] } };
};

const loadSeats = (sets: readonly SavedSet[]): SeatMap => {
    const stored = parseSeatMap(loadJson(EDIT_SEAT_KEY, (o) => o));
    return stored !== null && Object.keys(stored).length > 0 ? stored : legacySeat(sets);
};

const persistSeats = (seats: SeatMap): SeatMap => { saveJson(EDIT_SEAT_KEY, seats); return seats; };

/**
 * 그 모드의 자리를 고른다 — 저장된 자리가 살아 있으면 그것, 아니면 **그 모드의 첫 집합**.
 * 그 모드에 집합이 하나도 없으면 `null`(호출자가 빈 집합을 만든다).
 */
const seatIn = (sets: readonly SavedSet[], mode: Universe, seats: SeatMap): EditSeat | null => {
    const mine = setsOfMode(sets, mode);
    const saved = seats[mode];
    if (saved && mine.some((x) => x.id === saved.id)) {
        // 지워진 칸은 버린다 — 남은 게 없으면 편집 대상 하나짜리 경로.
        const path = saved.path.filter((id) => sets.some((x) => x.id === id));
        return { id: saved.id, path: path.length > 0 && path[path.length - 1] === saved.id ? path : [saved.id] };
    }
    const first = mine[0];
    return first ? { id: first.id, path: [first.id] } : null;
};

export interface SavedSetsSlice {
    /** 저장 집합들(영속) — 집합 편성 패널이 만든 산출물. 집합 칩·연동 피커의 유일한 저장물 목록. */
    savedSets: SavedSet[];
    /**
     * **지금 편집 중인 집합**(영속). 편집이 곧 저장이라 「작업 깔때기」라는 별도 자리가 없다 —
     * 조건을 만지는 손은 전부 이 집합의 식을 갈아 끼운다(`filterFunnelSlice.putExpr`).
     */
    editingSetId: string;
    /**
     * 루트부터 지금까지의 **드릴다운 경로**(영속) — 마지막 칸이 곧 `editingSetId` 다.
     * 뿌리가 곧 **관측 대상**이라 줄 쌓임이 그걸 그리고 구독 패널이 그걸 본다.
     * ⚠ 이 둘은 **지금 모드의 자리**다 — 저장은 모드별(`wb.editSeat.v1`)이고 `setFilterMode` 가 갈아 끼운다.
     */
    editPath: string[];
    /** 편집 대상 갈아타기 — 사본을 뜨지 않는다(사본이 있으면 "저장 안 한 변경"이 되살아난다). 경로는 새로 시작한다. */
    editSet: (id: string) => void;
    /** 참조를 따라 **한 층 내려간다** — 경로가 자란다(빵부스러기가 그걸 그린다). */
    drillInto: (setId: string) => void;
    /** 빵부스러기의 한 칸으로 **되돌아간다**(그 칸까지 경로를 자른다). */
    popTo: (index: number) => void;
    /** 빈 집합 하나를 만들고 **그걸 편집 대상으로** 둔다. */
    createSet: () => void;
    /**
     * **새 묶음** — 빈 집합을 만들어 지금 식에 참조로 붙이고, 그 집합으로 내려간다(드릴다운).
     * 옛 「승격」이 하던 일의 자리 — 중첩이 참조로 간 뒤로는 "먼저 만들고 채운다"가 자연스럽다.
     */
    addGroupTerm: () => void;
    /**
     * **기존 집합 붙이기** — 이미 있는 집합을 지금 식에 참조 한 항으로 넣는다(내려가지는 않는다).
     * 재사용의 유일한 손이다: 이게 없으면 「쓰는 곳」이 영원히 0~1 이고 `hasCycle` 도 죽은 코드가 된다.
     * ⚠ **순환은 여기서 거절한다** — 참조를 붙이는 손이 이것뿐이라 방어도 여기 하나면 된다.
     */
    addSetRef: (setId: string) => void;
    /** 이름만 바꾼다(id·조건 유지 — 바인딩이 id 로 따라오므로 이름은 표시물일 뿐). 빈 이름 = 자동 이름으로. */
    renameSet: (id: string, name: string) => void;
    deleteSet: (id: string) => void;
}

/**
 * 참조가 가리키는 집합의 우주 — 저장물이 **들고 있는 값을 그대로** 믿는다.
 * 그 값은 저장 시점에 같은 규칙(universeOfExpr)으로 파생해 굳힌 것이라 재귀가 필요 없고,
 * 순환은 `addSetRef` 가 미리 거절한다. 없는 집합(지워진 참조)은 null = 우주를 안 정한다.
 */
export const refUniverse = (sets: readonly SavedSet[]) => (id: string): Universe | null =>
    sets.find((x) => x.id === id)?.universe ?? null;

/**
 * 모드별 자리의 **현재 값**(모듈 상태) — 스토어 필드(`editingSetId`/`editPath`)는 "지금 모드의 자리"
 * 하나뿐이라, 반대 모드의 자리는 여기와 localStorage 에 산다. 쓰기는 전부 `putSeat` 하나를 지난다.
 */
let seats: SeatMap = {};

/** 자리 하나를 그 모드 칸에 적고 스토어 조각으로 낸다 — 영속과 상태가 **같은 손**에서 갈린다. */
const putSeat = (mode: Universe, id: string, path: string[]): { editingSetId: string; editPath: string[] } => {
    seats = persistSeats({ ...seats, [mode]: { id, path } });
    return { editingSetId: id, editPath: path };
};

/**
 * 모드를 갈아탄다 — 그 모드의 자리를 세우고, 그 모드에 집합이 하나도 없으면 **그때** 만든다.
 * ⚠ `filterFunnelSlice.setFilterMode` 가 유일한 호출자다(슬라이스 방향: funnel → savedSets).
 */
export const switchSeat = (
    s: { savedSets: SavedSet[] },
    mode: Universe,
): { savedSets: SavedSet[]; editingSetId: string; editPath: string[] } => {
    const hit = seatIn(s.savedSets, mode, seats);
    if (hit) return { savedSets: s.savedSets, ...putSeat(mode, hit.id, hit.path) };
    const made = blankSet(mode);
    const savedSets = persistSavedSets([...s.savedSets, made]);
    return { savedSets, ...putSeat(mode, made.id, [made.id]) };
};

export const createSavedSetsSlice: StateCreator<WorkbenchState, [], [], SavedSetsSlice> = (set) => {
    const mode = loadFilterMode();
    const sets = loadSavedSets(mode);
    seats = loadSeats(sets);
    // 부팅 자리 — 위 loadSavedSets 가 "이 모드에 집합이 하나는 있다"를 이미 보장한다.
    const seat = seatIn(sets, mode, seats)!;
    return {
    savedSets: sets,
    ...putSeat(mode, seat.id, seat.path),

    // 갈아타기만 한다 — **사본을 안 뜬다**(편집 = 저장이라 사본이 곧 "저장 안 한 변경"이다).
    // 정의(pointDef)는 그 집합의 것으로 되돌린다 — 없는 집합은 현재 정의 유지(관대 병합 규칙).
    editSet: (id) => set((s) => {
        const f = s.savedSets.find((x) => x.id === id);
        if (!f) return {};
        return {
            // 목록에서 고른 건 **새 뿌리**다 — 경로를 물려받지 않는다.
            ...putSeat(s.filterMode, id, [id]),
            ...(f.pointDef ? { pointDef: persistPointDef(f.pointDef) } : {}),
        };
    }),

    drillInto: (setId) => set((s) => {
        if (!s.savedSets.some((x) => x.id === setId)) return {}; // 깨진 참조로는 안 내려간다
        // 같은 집합이 경로에 또 나오면(다이아몬드) 거기서 잘라 붙인다 — 빵부스러기가 길어지지 않게.
        const at = s.editPath.indexOf(setId);
        const path = at >= 0 ? s.editPath.slice(0, at + 1) : [...s.editPath, setId];
        return putSeat(s.filterMode, setId, path);
    }),

    popTo: (index) => set((s) => {
        const path = s.editPath.slice(0, index + 1);
        const id = path[path.length - 1];
        if (id === undefined || id === s.editingSetId) return {};
        return putSeat(s.filterMode, id, path);
    }),

    createSet: () => set((s) => {
        const made = blankSet(s.filterMode); // 새 집합은 **지금 모드**로 태어난다
        return { savedSets: persistSavedSets([...s.savedSets, made]), ...putSeat(s.filterMode, made.id, [made.id]) };
    }),

    // 새 묶음 = 빈 집합 + 지금 식에 참조 한 항 + 그 집합으로 내려가기.
    // ⚠ 순환은 원리적으로 안 난다 — 갓 만든 집합은 아직 아무것도 안 가리킨다.
    addGroupTerm: () => set((s) => {
        const made = blankSet(s.filterMode); // 묶음도 **지금 모드**로 태어난다
        const withSet = [...s.savedSets, made];
        const next = withSet.map((x) => (x.id === s.editingSetId ? { ...x, expr: appendTerm(x.expr, refNode(made.id)) } : x));
        return { savedSets: persistSavedSets(next), ...putSeat(s.filterMode, made.id, [...s.editPath, made.id]) };
    }),

    addSetRef: (setId) => set((s) => {
        if (setId === s.editingSetId) return {}; // 자기 자신 — 순환
        const target = s.savedSets.find((x) => x.id === setId);
        const me = s.savedSets.find((x) => x.id === s.editingSetId);
        if (!target || !me) return {};
        if (refsOf(me.expr).includes(setId)) return {}; // 이미 붙어 있다(같은 항 둘은 뜻이 없다)
        // ⚠ **모드를 넘는 참조는 거절한다**(2026-09-22) — `universeOfExpr` 이 왼쪽에서 처음 만나는
        //   한쪽-전용 항으로 우주를 정하므로, 섞이면 **항 순서에 따라** 집합이 목록 사이를 옮겨 다닌다.
        //   화면(후보 목록)도 거르지만 문지기는 여기 하나여야 한다(순환 거절과 같은 자리·같은 이유).
        if (target.universe !== s.filterMode) return {};
        // ⚠ 순환 거절 — 저 집합이 (건너서라도) 나를 가리키면 평가가 무한히 내려가고 빵부스러기도 끝이 없다.
        const exprOfSet = (id: string): SetExpr | undefined => s.savedSets.find((x) => x.id === id)?.expr;
        if (hasCycle(s.editingSetId, target.expr, exprOfSet)) return {};
        const next = s.savedSets.map((x) => (x.id === s.editingSetId ? { ...x, expr: appendTerm(x.expr, refNode(setId)) } : x));
        return { savedSets: persistSavedSets(next) };
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
        return { savedSets: persistSavedSets(next) };
    }),
    deleteSet: (id) => set((s) => {
        // 하나도 안 남으면 빈 집합을 다시 세운다 — 편집할 집합이 반드시 하나는 있어야 한다.
        const rest = s.savedSets.filter((x) => x.id !== id);
        // 폴백은 **같은 모드 안에서** 찾는다 — 반대 모드 집합으로 내려앉으면 모드와 자리가 어긋난다.
        // ⚠ 빈 모드 판정은 **재조정(reconcileUniverses) 뒤**에 한다 — 마지막 남은 집합의 우주가
        //   파생으로 뒤집히면 재조정 전 배열로는 "있다"고 세어져 자리가 undefined 가 된다.
        const settled = persistSavedSets(rest);
        const next = setsOfMode(settled, s.filterMode).length > 0
            ? settled
            : persistSavedSets([...settled, blankSet(s.filterMode)]);
        const home = setsOfMode(next, s.filterMode)[0]!;
        return {
            savedSets: next,
            // 편집 중이던 집합이 지워지면 **첫 집합으로** 내려앉는다(빈 화면보다 낫다).
            // ⚠ 경로 **중간이나 뿌리**가 지워지면 남은 칸을 이어 붙이면 안 된다 — 부모-자식이 아닌
            //   배열이 남고, 뿌리가 바뀌면 **관측 대상이 말없이 갈려** 하류가 전 모수를 다시 센다.
            //   지워진 칸부터 잘라 낸다(그 아래는 더 이상 이 경로의 것이 아니다).
            ...(s.editingSetId === id
                ? putSeat(s.filterMode, home.id, [home.id])
                : (() => {
                    const cut = s.editPath.indexOf(id);
                    if (cut < 0) return { editPath: s.editPath };
                    const path = cut === 0 ? [home.id] : s.editPath.slice(0, cut);
                    return putSeat(s.filterMode, path[path.length - 1]!, path);
                })()),
            // ⚠ **이 집합을 참조하던 식은 안 고친다** — 깨진 참조가 표식을 달고 서는 게 규칙이다
            //   (조용히 넓어지지 않는다). 그 자리를 빼는 손은 편집면에 있다.
        };
    }),
    };
};
