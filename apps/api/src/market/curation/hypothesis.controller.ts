import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import type {
    Hypothesis as CoreHypothesis,
    HypothesisRelation as CoreHypothesisRelation,
    HypothesisReader,
    HypothesisStore,
} from "@trade-data-manager/market";
import type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/wire";
import { HYPOTHESIS_REPO } from "../tokens.js";
import { assertYmd, assertHms } from "../validation.js";

interface CreateHypothesisBody {
    text: string;
}

interface LinkBody {
    hypothesisId: string;
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
}

interface RelationBody {
    fromId: string;
    toId: string;
    relationType: string;
    note?: string;
}

// 저장된 가설/관계는 id 가 항상 존재(포트 타입은 미저장 대비 id?). 와이어 계약(id 필수)으로 경계에서 좁힌다.
const toWireHypothesis = (h: CoreHypothesis): Hypothesis => {
    if (h.id == null) throw new InternalServerErrorException("가설 id 누락 — repo 계약 위반");
    return { id: h.id, text: h.text };
};
const toWireRelation = (r: CoreHypothesisRelation): HypothesisRelation => {
    if (r.id == null) throw new InternalServerErrorException("가설 관계 id 누락 — repo 계약 위반");
    return { id: r.id, fromId: r.fromId, toId: r.toId, relationType: r.relationType, note: r.note };
};

// 가설 큐레이션 — 클라가 세 목록(가설·링크·관계)을 받아 인메모리로 조립·필터(옵션 A). 여기선 flat CRUD 만.
// 가설↔타점 연결은 자연키(code·date·time) = review point 삼중키. 관계 편집은 후속(Phase 3).
@Controller("hypotheses")
export class HypothesisController {
    constructor(@Inject(HYPOTHESIS_REPO) private readonly repo: HypothesisReader & HypothesisStore) {}

    @Get("links")
    listLinks(): Promise<HypothesisLink[]> {
        return this.repo.listLinks();
    }

    @Get("relations")
    async listRelations(): Promise<HypothesisRelation[]> {
        return (await this.repo.listRelations()).map(toWireRelation);
    }

    @Get()
    async list(): Promise<Hypothesis[]> {
        return (await this.repo.listHypotheses()).map(toWireHypothesis);
    }

    @Post()
    async create(@Body() body: CreateHypothesisBody): Promise<Hypothesis> {
        const text = body?.text?.trim();
        if (!text) throw new BadRequestException("text 필수");
        return toWireHypothesis(await this.repo.create(text));
    }

    @Post("links")
    async link(@Body() body: LinkBody): Promise<{ ok: true }> {
        await this.repo.link(assertLink(body));
        return { ok: true };
    }

    @Post("relations")
    async addRelation(@Body() body: RelationBody): Promise<HypothesisRelation> {
        if (!body?.fromId || !body?.toId) throw new BadRequestException("fromId·toId 필수");
        if (!body?.relationType) throw new BadRequestException("relationType 필수");
        if (body.fromId === body.toId) throw new BadRequestException("자기참조 불가");
        return toWireRelation(await this.repo.addRelation({ fromId: body.fromId, toId: body.toId, relationType: body.relationType, note: body.note }));
    }

    @Delete("links")
    async unlink(
        @Query("hypothesisId") hypothesisId?: string,
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        if (!hypothesisId || !code) throw new BadRequestException("hypothesisId·code 필수");
        await this.repo.unlink({ hypothesisId, stockCode: code, date: assertYmd(date), time: assertHms(time) });
        return { ok: true };
    }

    @Delete("relations/:id")
    async removeRelation(@Param("id") id: string): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        await this.repo.removeRelation(id);
        return { ok: true };
    }

    // 정적 경로(links·relations) 뒤에 선언 — Express 가 그것들을 :id 로 삼지 않게 순서 보장.
    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        await this.repo.remove(id);
        return { ok: true };
    }
}

/** 링크 바디 검증 — hypothesisId·stockCode 필수 + 날짜/시각 유효성. */
function assertLink(body: LinkBody): HypothesisLink {
    if (!body?.hypothesisId) throw new BadRequestException("hypothesisId 필수");
    if (!body?.stockCode) throw new BadRequestException("stockCode 필수");
    return {
        hypothesisId: body.hypothesisId,
        stockCode: body.stockCode,
        date: assertYmd(body.date),
        time: assertHms(body.time),
    };
}
