import { Controller, Get, Post, Query, Inject, BadRequestException } from "@nestjs/common";
import { isCanonicalStockCode } from "@trade-data-manager/market";
import { LIVE_ENGINE } from "./tokens.js";
import type { LiveEngine } from "./engine/engine.js";

// 시트 테마 멤버십 온디맨드 재로드 — 워크벤치 배정(apps/api 경유) 또는 시트 직접편집 후
// 실시간 보드 분류·칩을 즉시 반영. live 는 시트 읽기전용(write 는 apps/api 경로)이라 read 캐시만 갱신.
//   POST /theme/refresh    엔진 멤버십 맵 재로드(시트 전체 재조회, 성공 시에만 원자 스왑)
//   GET  /theme/of?code=   그 종목의 테마들 — 테이프 패널의 칩(스냅샷 SSE 없이 포커스만으로).
@Controller("theme")
export class ThemeController {
    constructor(@Inject(LIVE_ENGINE) private readonly engine: LiveEngine) {}

    @Post("refresh")
    async refresh(): Promise<{ ok: true }> {
        await this.engine.reloadMembership();
        return { ok: true };
    }

    @Get("of")
    of(@Query("code") code?: string): { themes: string[] } {
        if (!code || !isCanonicalStockCode(code)) throw new BadRequestException("code 형식(6자리 영숫자)");
        return { themes: this.engine.themesOf(code) };
    }
}
