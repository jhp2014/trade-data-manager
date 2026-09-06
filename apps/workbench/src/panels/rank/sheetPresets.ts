// 열 프리셋(순수) — **보이는 열 스냅샷뿐**이다(순서·고정·폭·행 모드는 안 담는다 — 사용자 확정 "보기만").
// 적용 = hiddenCols 를 "전체 − cols" 로 교체 · 행 모드별 딴 주머니(wb.rankSheetPresets / .day).
// 프리셋의 `ax:` 키도 유령 청소에 합류한다(고정·숨김·폭·컷과 같은 사정 — 로딩 중 청소 금지 가드 동일).
import { pruneAxisKeys } from "./sheetColumns.js";
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
 * 죽은 축 키 청소 — 각 프리셋의 cols 에 pruneAxisKeys(같은 사망 판정: `ax:` 접두만, `out:` 무접촉).
 * **바뀐 게 없으면 같은 배열 참조**를 돌려준다 — usePersistedState 의 저장 effect 가 헛돌지 않게(기존 넷의 규약).
 */
export function prunePresets(presets: SheetPreset[], liveAxisIds: string[]): SheetPreset[] {
    let changed = false;
    const next = presets.map((p) => {
        const cols = pruneAxisKeys(p.cols, liveAxisIds);
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
 * 붙박이 프리셋 — 상수 목록으로 두고 사용자 목록과 분리 렌더한다(영속에 씨앗을 심으면 "지웠는데
 * 되살아난다"가 된다). "결과" = 옛 결과 시트 패널(2026-09-04 폐지)의 열 구성 그대로(시뮬 4 무포함 —
 * 사용자 확정, 붙박이는 상수라 추가가 싸서 "시뮬"을 따로 세웠다).
 */
export const BUILTIN_POINT_PRESETS: readonly SheetPreset[] = [
    { name: "결과", cols: ["name", "date", "time", ...OUTCOME_BASE_COL_IDS.map((id) => `out:${id}`)] },
    { name: "시뮬", cols: ["name", "date", "time", ...SIM_COL_IDS.map((id) => `out:${id}`)] },
];
export const BUILTIN_DAY_PRESETS: readonly SheetPreset[] = [];
