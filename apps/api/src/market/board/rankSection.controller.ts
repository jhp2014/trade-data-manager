import { Controller, Get, Inject } from "@nestjs/common";
import type { RankSectionBundle } from "@trade-data-manager/wire";
import { RANK_SECTIONS } from "../tokens.js";
import { RankSections } from "./rankSections.js";

// 순위 단면 번들 — 파라미터 없음(타점 전체가 모수라 요청이 곧 "현재 상태 다오"다). 대사·캐시는 RankSections.
@Controller("rank-sections")
export class RankSectionController {
    constructor(@Inject(RANK_SECTIONS) private readonly sections: RankSections) {}

    @Get()
    bundle(): Promise<RankSectionBundle> {
        return this.sections.bundle();
    }
}
