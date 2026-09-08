// 열 프리셋(순수) — **보이는 열 스냅샷뿐**이다(순서·고정·폭·행 모드는 안 담는다 — 사용자 확정 "보기만").
// 적용 = hiddenCols 를 "전체 − cols" 로 교체 · 행 모드별 딴 주머니(wb.rankSheetPresets / .day).
// 프리셋의 `ax:` 키도 유령 청소에 합류한다(고정·숨김·폭·컷과 같은 사정 — 로딩 중 청소 금지 가드 동일).
import { pruneAxisKeys, pruneOutKeys } from "./sheetColumns.js";
import { OUTCOME_BASE_COL_IDS, SIM_COL_IDS } from "./outcomeColumns.js";

export interface SheetPreset {
    name: string;
    /** 보이는 열 키(colKey) 목록. 순서는 안 쓴다 — 열 순서의 소스는 축 서열·고정 배열 그대로다. */
    cols: string[];
}

/** 영속 복원 — 형태가 불량한 항목은 조용히 버린다(출처가 localStorage 라 깨진 값이 들어올 수 있다). */
export function parseSheetPresets(o: unknown): SheetPreset[] | null {
    if (!Array.isArray(o)) return null;
    const out: SheetPreset[] = [];
    for (const p of o) {
        if (!p || typeof p !== "object") continue;
        const { name, cols } = p as { name?: unknown; cols?: unknown };
        if (typeof name !== "string" || name.trim() === "" || !Array.isArray(cols)) continue;
        out.push({ name, cols: cols.filter((c): c is string => typeof c === "string") });
    }
    return out;
}

/**
 * 죽은 키 청소 — 각 프리셋의 cols 에 pruneAxisKeys(`ax:` 접두, 붙박이 `out:<id>` 무접촉) +
 * pruneOutKeys(지워진 부품의 3조각 `out:<setId>:<id>` — 나머지 주머니 넷과 같은 사정).
 * **바뀐 게 없으면 같은 배열 참조**를 돌려준다 — usePersistedState 의 저장 effect 가 헛돌지 않게(기존 넷의 규약).
 */
export function prunePresets(presets: SheetPreset[], liveAxisIds: string[], liveSetIds: readonly string[], liveStageIds: readonly string[] = []): SheetPreset[] {
    let changed = false;
    const next = presets.map((p) => {
        const cols = pruneOutKeys(pruneAxisKeys(p.cols, liveAxisIds), liveSetIds, liveStageIds);
        if (cols === p.cols) return p;
        changed = true;
        return { ...p, cols };
    });
    return changed ? next : presets;
}

/** 적용 계산 — 숨길 열 = 전체 − 프리셋 cols. 종목(name)은 붙박이라 애초에 못 숨긴다(layoutColumns 규칙). */
export const presetHidden = (allKeys: readonly string[], cols: readonly string[]): string[] => {
    const keep = new Set(cols);
    return allKeys.filter((k) => k !== "name" && !keep.has(k));
};

/**
 * 프리셋 cols 를 지금 열 구성에 맞춘다 — **결과 열 키는 부품 유무를 넘나들며 metric 으로 맞춘다**.
 * 조립 뷰의 결과 열은 3조각(`out:<setId>:<metric>`)이라 그대로 대조하면: 붙박이 "결과"(2조각)를
 * 조립 뷰에서 누르는 순간 부품 열이 전부 숨어 시트가 비고, 반대로 조립 뷰에서 저장한 프리셋을
 * 일반 뷰에서 누르면 공용 결과 열이 전부 숨는다. 프리셋의 뜻은 "이 **종류**의 결과 열을 본다"이지
 * 특정 부품 열이 아니므로 metric 매칭이 뜻에 맞다(축·기본 열은 정확 키 그대로).
 */
export function matchPresetCols(presetCols: readonly string[], allKeys: readonly string[]): string[] {
    const all = new Set(allKeys);
    const keep = new Set(presetCols);
    // **지금 열 구성에 없는** out: 키만 metric 으로 근사한다 — 있는 키는 정확 매칭. 안 그러면 같은 뷰에서
    // "fs1 열만 보기"로 저장한 프리셋이 fs2 의 같은 metric 열까지 되살려 저장→적용이 비멱등이 된다.
    const metrics = new Set(presetCols.filter((k) => k.startsWith("out:") && !all.has(k)).map((k) => k.split(":").pop()!));
    return allKeys.filter((k) => keep.has(k) || (k.startsWith("out:") && metrics.has(k.split(":").pop()!)));
}

/**
 * 붙박이 프리셋 — 상수 목록으로 두고 사용자 목록과 분리 렌더한다(영속에 씨앗을 심으면 "지웠는데
 * 되살아난다"가 된다). "결과" = 옛 결과 시트 패널(2026-09-04 폐지)의 열 구성 그대로(시뮬 4 무포함 —
 * 사용자 확정, 붙박이는 상수라 추가가 싸서 "시뮬"을 따로 세웠다).
 */
export const BUILTIN_POINT_PRESETS: readonly SheetPreset[] = [
    { name: "결과", cols: ["name", "date", "time", ...OUTCOME_BASE_COL_IDS.map((id) => `out:${id}`)] },
    { name: "시뮬", cols: ["name", "date", "time", ...SIM_COL_IDS.map((id) => `out:${id}`)] },
];
export const BUILTIN_DAY_PRESETS: readonly SheetPreset[] = [];
