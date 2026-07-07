import { Controller, Get, Post, Inject, Query, Body, BadRequestException } from "@nestjs/common";
import { kstToday, type ThemeMembershipStore } from "@trade-data-manager/market";
import { toCanonical } from "@trade-data-manager/broker";
import type { ThemeContext, AssignThemeInput, AssignThemeResult } from "@trade-data-manager/wire";
import { MASTER_CACHE, MEMBERSHIP_CACHE, THEME_MEMBERSHIP_STORE } from "../tokens.js";
import type { MasterCache } from "./masterCache.js";
import type { CachedMembership } from "./cachedMembership.js";

// /theme — 시트 테마 인덱스(정적 정체성) 조회·편집·캐시무효화.
//   GET  /theme/members?code=  종목 우클릭 팝업용 — 그 종목의 (테마,편입이슈) 전부 + 자동완성용 전체 테마
//   POST /theme/members        우클릭 배정 — 새 (theme,code) 시트 append(중복 skip) 후 멤버십 캐시 무효화
//   POST /theme/refresh        시트 수동편집·신규상장 후 날짜무관 캐시(Membership·Master) 무효화
@Controller("theme")
export class ThemeController {
    constructor(
        @Inject(MEMBERSHIP_CACHE) private readonly membership: CachedMembership,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
        @Inject(THEME_MEMBERSHIP_STORE) private readonly store: ThemeMembershipStore,
    ) {}

    @Get("members")
    async members(@Query("code") code?: string): Promise<ThemeContext> {
        if (!code) throw new BadRequestException("code 필수");
        const canon = toCanonical(code);
        const all = await this.membership.load();
        const current = all.filter((m) => m.code === canon); // 결정(a): 중복행도 그대로 노출(시트 진실)
        const allThemes = [...new Set(all.map((m) => m.theme))].sort((a, b) => a.localeCompare(b, "ko"));
        return { current, allThemes };
    }

    @Post("members")
    async assign(@Body() body: AssignThemeInput): Promise<AssignThemeResult> {
        const theme = body?.theme?.trim();
        if (!body?.code) throw new BadRequestException("code 필수");
        if (!theme) throw new BadRequestException("theme 필수");
        const code = toCanonical(body.code);
        const all = await this.membership.load();
        if (all.some((m) => m.code === code && m.theme === theme)) return { assigned: false }; // 이미 그 테마 → 시트 중복행 방지
        await this.store.addMember({ theme, code, name: body.name, date: kstToday() });
        this.membership.refresh(); // 인덱스 캐시 무효화 — 다음 보드 조회부터 새 멤버 반영(master 는 무관)
        return { assigned: true };
    }

    // 시트(테마 인덱스) 편집·신규상장 후 메모리 캐시 무효화(수동 트리거). 날짜별 불변 파일 캐시는 무관.
    @Post("refresh")
    refresh(): { ok: true } {
        this.membership.refresh();
        this.master.refresh();
        return { ok: true };
    }
}
