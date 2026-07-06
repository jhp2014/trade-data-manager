import { Controller, Post, Inject } from "@nestjs/common";
import { MASTER_CACHE, MEMBERSHIP_CACHE } from "./tokens.js";
import type { MasterCache } from "./masterCache.js";
import type { CachedMembership } from "./cachedMembership.js";

// POST /theme/refresh — 시트(테마 인덱스) 편집·신규상장 후 메모리 캐시 무효화(수동 트리거).
// 날짜무관 캐시(Membership·Master)만 비운다 — 날짜별 불변 파일 캐시는 무관.
@Controller("theme")
export class ThemeController {
    constructor(
        @Inject(MEMBERSHIP_CACHE) private readonly membership: CachedMembership,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
    ) {}

    @Post("refresh")
    refresh(): { ok: true } {
        this.membership.refresh();
        this.master.refresh();
        return { ok: true };
    }
}
