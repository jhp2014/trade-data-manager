// 테마 순위 탐색값 슬라이스 — 테마 순위 패널의 N/M·묶음 파라미터(영속).
//
// settingsSlice 가 아닌 이유: 저긴 "설정 모달이 편집하는 전역 설정"이고 이건 패널이 손으로 만지는
// 탐색값이다. panelUi 가 아닌 이유: 다음 단계에서 **집합 편성 보드가 라이브 미러로 읽어야** 하는데
// panelUi 는 panelId 키·unknown 값이라 경계가 안 선다 — 슬라이스 하나로 긋는다.
//
// ⚠ 존 N/M 은 **교집합**(등락 서수 ≤ N ∧ 대금 서수 ≤ M) — 복기 보드 replaySettings 의 N/M(합집합
// hot 유니버스)과 뜻이 정반대라 재사용·이름 공유 금지(themeStrength.ts 참고).
import type { StateCreator } from "zustand";
import { persistedField } from "./persist.js";
import { DEFAULT_THEME_STRENGTH, parseThemeStrengthParams, type ThemeStrengthParams } from "../lib/themeStrength.js";
import type { WorkbenchState } from "./workbench.js";

export interface ThemeRankSlice {
    themeRankParams: ThemeStrengthParams;
    setThemeRankParams: (patch: Partial<ThemeStrengthParams>) => void;
}

// 파서는 lib/themeStrength 한 벌 — 깔때기 술어(parsePredicate)와 같은 유효성 정의를 봐야 한다.
const THEME_RANK = persistedField<ThemeStrengthParams>("wb.themeRankParams", parseThemeStrengthParams, DEFAULT_THEME_STRENGTH);

export const createThemeRankSlice: StateCreator<WorkbenchState, [], [], ThemeRankSlice> = (set) => ({
    themeRankParams: THEME_RANK.load(),
    setThemeRankParams: (patch) =>
        set((s) => ({ themeRankParams: THEME_RANK.save({ ...s.themeRankParams, ...patch }) })),
});
