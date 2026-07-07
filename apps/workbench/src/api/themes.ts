// 시트 테마 멤버십 조회·배정 클라이언트. wire 타입(ThemeContext·AssignThemeInput·AssignThemeResult·ThemeMember)은 contracts/wire 공유.
// 배정은 서버가 곧장 멤버십 캐시를 무효화하므로, 클라는 성공 후 보드 react-query 만 invalidate 하면 된다(호출부 몫).
import type { ThemeContext, AssignThemeInput, AssignThemeResult } from "@trade-data-manager/wire";
import { apiGet, apiPost } from "./http.js";

export type { ThemeContext, AssignThemeInput, AssignThemeResult, ThemeMember } from "@trade-data-manager/wire";

/** 종목이 속한 (테마,편입이슈) 전부 + 자동완성용 전체 테마명. */
export const fetchThemeContext = (code: string, signal?: AbortSignal): Promise<ThemeContext> =>
    apiGet<ThemeContext>("theme/members", { code }, signal);

/** 종목을 테마에 배정(시트 append). assigned=false = 이미 그 테마라 skip. */
export const assignTheme = (input: AssignThemeInput): Promise<AssignThemeResult> =>
    apiPost<AssignThemeResult>("theme/members", input);
