import { Controller, Get, Post, Delete, Inject, Param, Body, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import type {
    HypothesisFilter as CoreHypothesisFilter,
    HypothesisFilterExpr,
    HypothesisFilterReader,
    HypothesisFilterStore,
} from "@trade-data-manager/market";
import type { HypothesisFilter } from "@trade-data-manager/wire";
import { HYPOTHESIS_FILTER_REPO } from "../tokens.js";

interface SaveFilterBody {
    name: string;
    expr: HypothesisFilterExpr;
}

// 저장본은 id·createdAt 항상 존재(포트 타입은 미저장 대비 옵셔널). 와이어 계약(필수)으로 경계에서 좁힌다.
const toWire = (f: CoreHypothesisFilter): HypothesisFilter => {
    if (f.id == null || f.createdAt == null) throw new InternalServerErrorException("필터 id/createdAt 누락 — repo 계약 위반");
    return { id: f.id, name: f.name, expr: f.expr, createdAt: f.createdAt };
};

// 가설 필터 저장/불러오기 — 이름+식(DNF jsonb). 패싯(outcome/type)은 임시라 저장 안 함. 평가·집계는 클라 인메모리.
@Controller("hypothesis-filters")
export class HypothesisFilterController {
    constructor(@Inject(HYPOTHESIS_FILTER_REPO) private readonly repo: HypothesisFilterReader & HypothesisFilterStore) {}

    @Get()
    async list(): Promise<HypothesisFilter[]> {
        return (await this.repo.listFilters()).map(toWire);
    }

    @Post()
    async save(@Body() body: SaveFilterBody): Promise<HypothesisFilter> {
        const name = body?.name?.trim();
        if (!name) throw new BadRequestException("name 필수");
        if (!body?.expr || !Array.isArray(body.expr.groups)) throw new BadRequestException("expr.groups 필수");
        return toWire(await this.repo.save(name, body.expr));
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        await this.repo.remove(id);
        return { ok: true };
    }
}
