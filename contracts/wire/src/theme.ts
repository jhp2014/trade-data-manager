// /theme 계약 — 시트 테마 멤버십(정적 정체성). 값타입 ThemeMember 는 core/market 재노출(단일 출처).
// 종목 우클릭 팝업: 그 종목의 현재 테마+편입이슈(current) 표시 + 전체 테마(allThemes) 자동완성, 그리고 새 배정.
import type { ThemeMember } from "@trade-data-manager/market";

export type { ThemeMember };

/** GET /theme/members?code= 응답 — 그 종목이 속한 모든 (theme,issue) 행 + 자동완성용 전체 테마명. */
export interface ThemeContext {
    /** 이 종목의 시트 행 전부(테마마다 편입이슈). 시트에 중복행이 있으면 그대로 노출(진실 반영). */
    current: ThemeMember[];
    /** 시트 전체 테마명(정렬) — 직접입력 자동완성/중복철자 차단용. */
    allThemes: string[];
}

/** POST /theme/members 요청 — 종목을 테마에 배정(시트에 1행 append). */
export interface AssignThemeInput {
    code: string;
    theme: string;
    name?: string; // 시트 가독용(있으면 기록)
    issue?: string; // 편입이슈 — 배정과 함께 append 행에 기록(선택). 새 배정에만 남는다(이미 그 테마면 skip).
}

/** POST /theme/members 응답 — assigned=false 는 이미 그 (theme,code) 라 skip 됨. */
export interface AssignThemeResult {
    assigned: boolean;
}
