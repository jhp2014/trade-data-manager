import { Controller, Get, Post, Patch, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { RankReader, RankStore, RankTarget } from "@trade-data-manager/market";
import type { RankAxis, PlacedPoint } from "@trade-data-manager/wire";
import { RANK_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

interface CreateAxisBody {
    name: string;
    scope?: string; // "point"(기본) | "day"
}

interface RenameAxisBody {
    name: string;
}

interface PlaceBody {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
    target: RankTarget;
}

// 순위 배치 큐레이션 — 축별 상대순위 줄에 복기 타점 배치. 조립(줄 렌더)은 클라 인메모리(옵션 A).
// 배치 대상 타점은 자연키(code·date·time) = review point 삼중키. 검색·확률은 후속 슬라이스.
@Controller("rank-axes")
export class RankController {
    constructor(@Inject(RANK_REPO) private readonly repo: RankReader & RankStore) {}

    @Get()
    list(): Promise<RankAxis[]> {
        return this.repo.listAxes();
    }

    @Post()
    async create(@Body() body: CreateAxisBody): Promise<RankAxis> {
        const name = body?.name?.trim();
        if (!name) throw new BadRequestException("name 필수");
        const scope = body?.scope ?? "point";
        if (scope !== "point" && scope !== "day") throw new BadRequestException('scope 는 "point" | "day"');
        return this.repo.createAxis(name, scope);
    }

    // ── 배치(:id/placements) 경로를 bare :id 앞에 선언 — Express 가 그것을 :id 로 삼지 않게 순서 보장.
    @Get(":id/placements")
    line(@Param("id") id: string): Promise<PlacedPoint[]> {
        if (!id) throw new BadRequestException("id 필수");
        return this.repo.listAxisLine(id);
    }

    @Post(":id/placements")
    place(@Param("id") id: string, @Body() body: PlaceBody): Promise<{ slotId: string; orderKey: number }> {
        if (!id) throw new BadRequestException("id 필수");
        const point = { stockCode: assertStockCode(body?.stockCode, "stockCode"), date: assertYmd(body?.date), time: assertHms(body?.time) };
        return this.repo.place(id, point, assertTarget(body?.target));
    }

    @Delete(":id/placements")
    async unplace(
        @Param("id") id: string,
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        await this.repo.unplace(id, { stockCode: assertStockCode(code), date: assertYmd(date), time: assertHms(time) });
        return { ok: true };
    }

    @Patch(":id")
    async rename(@Param("id") id: string, @Body() body: RenameAxisBody): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        const name = body?.name?.trim();
        if (!name) throw new BadRequestException("name 필수");
        await this.repo.renameAxis(id, name);
        return { ok: true };
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        if (!id) throw new BadRequestException("id 필수");
        await this.repo.removeAxis(id);
        return { ok: true };
    }
}

/** 드롭 목표 검증 — slot(합류) | between(두 이웃 사이). */
function assertTarget(t: RankTarget | undefined): RankTarget {
    if (t?.kind === "slot") {
        if (!t.slotId) throw new BadRequestException("target.slotId 필수");
        return { kind: "slot", slotId: String(t.slotId) };
    }
    if (t?.kind === "between") {
        return {
            kind: "between",
            prevSlotId: t.prevSlotId ? String(t.prevSlotId) : undefined,
            nextSlotId: t.nextSlotId ? String(t.nextSlotId) : undefined,
        };
    }
    throw new BadRequestException('target.kind 는 "slot" | "between"');
}
