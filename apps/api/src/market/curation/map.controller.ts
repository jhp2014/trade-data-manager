import { Controller, Get, Post, Patch, Delete, Inject, Param, Body, BadRequestException } from "@nestjs/common";
import type { MapReader, MapStore } from "@trade-data-manager/market";
import type { SimilarityMap, MapScope, CreateMapInput, RenameMapInput } from "@trade-data-manager/wire";
import { MAP_REPO } from "../tokens.js";

// 유사도 맵 — 평면 자체만. 그 위의 점(=그룹)과 좌표는 /groups 가 낸다.
// 그룹 하나는 평면 하나에 살고 좌표·부모를 직접 들기 때문에, 여기엔 배치 엔드포인트가 없다.
@Controller("maps")
export class MapController {
    constructor(@Inject(MAP_REPO) private readonly repo: MapReader & MapStore) {}

    @Get()
    list(): Promise<SimilarityMap[]> {
        return this.repo.listMaps();
    }

    @Post()
    create(@Body() body: CreateMapInput): Promise<SimilarityMap> {
        return this.repo.createMap(assertName(body?.name), assertScope(body?.scope));
    }

    @Patch(":id")
    async rename(@Param("id") id: string, @Body() body: RenameMapInput): Promise<{ ok: true }> {
        await this.repo.renameMap(assertId(id), assertName(body?.name));
        return { ok: true };
    }

    /** 삭제 — 그 평면의 그룹은 지워지지 않고 **내려온다**(좌표·부모가 풀린다). 확인은 클라가 띄운다. */
    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.removeMap(assertId(id));
        return { ok: true };
    }
}

function assertId(id: string | undefined): string {
    if (!id || !/^\d+$/.test(id)) throw new BadRequestException("id 필수(숫자)");
    return id;
}

/** 앞뒤 공백은 유니크 제약을 우회하는 사고("일봉 "≠"일봉")라 여기서 깎는다. */
function assertName(name: string | undefined): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException("name 필수");
    return n;
}

function assertScope(scope: string | undefined): MapScope {
    if (scope !== "day" && scope !== "point") throw new BadRequestException("scope 는 day|point");
    return scope;
}
