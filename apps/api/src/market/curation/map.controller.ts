import { Controller, Get, Post, Patch, Inject, Body, BadRequestException } from "@nestjs/common";
import type { MapReader, MapStore } from "@trade-data-manager/market";
import type { SimilarityMap, MapScope, CreateMapInput, RenameMapInput, RemoveMapInput } from "@trade-data-manager/wire";
import { MAP_REPO } from "../tokens.js";

// 유사도 맵 — 평면 자체만. 그 위의 점(=그룹)과 좌표는 /groups 가 낸다.
// 그룹 하나는 평면 하나에 살고 좌표·부모를 직접 들기 때문에, 여기엔 배치 엔드포인트가 없다.
//
// **지목은 이름으로, 이름은 바디에.** id 는 계약을 안 건넌다(로컬 미러와 Supabase 가 각자 발급 →
// 동기화를 건넌 참조가 다른 행을 가리킨다). 이름을 경로에 안 싣는 건 자유 텍스트라서다 —
// 그래서 삭제도 DELETE 가 아니라 POST /remove 다(앵커와 같은 규칙).
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

    @Patch("rename")
    async rename(@Body() body: RenameMapInput): Promise<{ ok: true }> {
        await this.repo.renameMap(assertName(body?.name), assertName(body?.newName, "newName"));
        return { ok: true };
    }

    /** 삭제 — 그 평면의 그룹은 지워지지 않고 **내려온다**(좌표·부모가 풀린다). 확인은 클라가 띄운다. */
    @Post("remove")
    async remove(@Body() body: RemoveMapInput): Promise<{ ok: true }> {
        await this.repo.removeMap(assertName(body?.name));
        return { ok: true };
    }
}

/** 앞뒤 공백은 유니크 제약을 우회하는 사고("일봉 "≠"일봉")라 여기서 깎는다. 이름이 키라 더 중요해졌다. */
function assertName(name: string | undefined, field = "name"): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException(`${field} 필수`);
    return n;
}

function assertScope(scope: string | undefined): MapScope {
    if (scope !== "day" && scope !== "point") throw new BadRequestException("scope 는 day|point");
    return scope;
}
