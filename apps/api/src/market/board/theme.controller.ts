import { Controller, Get, Post, Inject, Query, Body } from "@nestjs/common";
import type { ThemeContext, AssignThemeInput, AssignThemeResult } from "@trade-data-manager/wire";
import { assertStockCode, assertName, assertOptionalText } from "../validation.js";
import { THEME_ASSIGNMENT } from "../tokens.js";
import type { ThemeAssignment } from "./themeAssignment.js";

// /theme — 시트 테마 인덱스(정적 정체성) 조회·편집·캐시무효화.
//   GET  /theme/members?code=  종목 우클릭 팝업용 — 그 종목의 (테마,편입이슈) 전부 + 자동완성용 전체 테마
//   POST /theme/members        우클릭 배정 — 새 (theme,code) 시트 append(중복 skip) 후 멤버십 캐시 무효화
//   POST /theme/refresh        시트 수동편집·신규상장 후 날짜무관 캐시(Membership·Master) 무효화
// 여긴 HTTP 경계만 본다: 파라미터 검증 → 위임. 중복 skip·캐시 무효화 순서는 ThemeAssignment 가 소유.
@Controller("theme")
export class ThemeController {
    constructor(@Inject(THEME_ASSIGNMENT) private readonly themes: ThemeAssignment) {}

    @Get("members")
    members(@Query("code") code?: string): Promise<ThemeContext> {
        return this.themes.contextOf(assertStockCode(code));
    }

    @Post("members")
    assign(@Body() body: AssignThemeInput): Promise<AssignThemeResult> {
        // name/issue 는 시트에 그대로 적히는 자유 텍스트 — 타입 오염(객체·숫자)과 폭주 길이만 경계에서 자른다.
        return this.themes.assign({
            theme: assertName(body?.theme, "theme"),
            code: assertStockCode(body?.code),
            name: assertOptionalText(body?.name, "name", 100),
            issue: assertOptionalText(body?.issue, "issue", 500),
        });
    }

    @Post("refresh")
    refresh(): { ok: true } {
        this.themes.refreshCaches();
        return { ok: true };
    }
}
