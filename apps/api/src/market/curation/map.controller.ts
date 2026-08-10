import { Controller, Get, Post, Patch, Delete, Inject, Param, Body, BadRequestException } from "@nestjs/common";
import type { MapReader, MapStore } from "@trade-data-manager/market";
import type {
    MapCorpus,
    MapItemRef,
    MapPlacement,
    MapPlacementMove,
    MapScope,
    NewMapPlacement,
    SimilarityMap,
    CreateMapInput,
    RenameMapInput,
    AddPlacementsInput,
    MovePlacementsInput,
    RemovePlacementsInput,
} from "@trade-data-manager/wire";
import { MAP_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 유사도 맵 큐레이션 — 축 없는 평면. 읽기는 말뭉치 하나(GET /maps), 쓰기는 **자리 조작이 전부 배열**.
// 무리(group) 쓰기는 아직 없다: 게이트("손 배치가 견딜 만한가")에 무리가 필요 없어 다음 슬라이스로 미뤘다.
@Controller("maps")
export class MapController {
    constructor(@Inject(MAP_REPO) private readonly repo: MapReader & MapStore) {}

    /** 맵·무리·자리 전부 한 벌 — 단건 조회를 두지 않는 이유는 MapCorpus 주석(왕복 1회·캐시 1개). */
    @Get()
    corpus(): Promise<MapCorpus> {
        return this.repo.loadCorpus();
    }

    @Post()
    create(@Body() body: CreateMapInput): Promise<SimilarityMap> {
        return this.repo.createMap(assertName(body?.name), assertScope(body?.scope));
    }

    @Post(":id/placements")
    add(@Param("id") id: string, @Body() body: AddPlacementsInput): Promise<MapPlacement[]> {
        return this.repo.addPlacements(assertId(id), assertList(body?.placements, "placements").map(assertNewPlacement));
    }

    /** 좌표 이동 — 본문 없음(204). 좌표는 클라가 저자라 서버가 되돌려줄 게 없다. */
    @Patch(":id/placements")
    async move(@Param("id") id: string, @Body() body: MovePlacementsInput): Promise<{ ok: true }> {
        await this.repo.movePlacements(assertId(id), assertList(body?.moves, "moves").map(assertMove));
        return { ok: true };
    }

    /** 자리 제거 — 항목이 아니라 그 자리 하나(다른 무리의 형제 자리는 남는다). id 목록이 길어 본문으로 받는다. */
    @Delete(":id/placements")
    async remove(@Param("id") id: string, @Body() body: RemovePlacementsInput): Promise<{ ok: true }> {
        await this.repo.removePlacements(assertId(id), assertList(body?.ids, "ids").map((v) => assertId(v, "ids[]")));
        return { ok: true };
    }

    @Patch(":id")
    async rename(@Param("id") id: string, @Body() body: RenameMapInput): Promise<{ ok: true }> {
        await this.repo.renameMap(assertId(id), assertName(body?.name));
        return { ok: true };
    }

    /** 맵 삭제 — 무리·자리도 함께 사라진다(cascade). 되돌릴 수 없어 확인은 클라가 띄운다. */
    @Delete(":id")
    async removeMap(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.removeMap(assertId(id));
        return { ok: true };
    }
}

function assertId(id: string | undefined, field = "id"): string {
    if (!id || !/^\d+$/.test(id)) throw new BadRequestException(`${field} 필수(숫자)`);
    return id;
}

/** 맵 이름 — 앞뒤 공백은 유니크 제약을 우회하는 사고("일봉 "≠"일봉")라 여기서 깎는다(태그 선례). */
function assertName(name: string | undefined): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException("name 필수");
    return n;
}

function assertScope(scope: string | undefined): MapScope {
    if (scope !== "day" && scope !== "point") throw new BadRequestException("scope 는 day|point");
    return scope;
}

/** 배열 조작이 기본이라 비어 있지 않은 배열인지부터 본다(빈 배열은 조용한 no-op 이 되어 버그를 감춘다). */
function assertList<T>(list: T[] | undefined, field: string): T[] {
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException(`${field} 필수(빈 배열 불가)`);
    return list;
}

function assertNewPlacement(p: NewMapPlacement | undefined): NewMapPlacement {
    const item = assertItem(p?.item);
    return { item, x: assertCoord(p?.x, "x"), y: assertCoord(p?.y, "y"), ...(p?.groupId == null ? {} : { groupId: assertId(p.groupId, "groupId") }) };
}

/** 항목 키 — time 은 **있으면** 검증한다. 있고 없고가 맵 scope 와 맞는지는 저장 경로(리포지토리)가 본다. */
function assertItem(item: MapItemRef | undefined): MapItemRef {
    const stockCode = assertStockCode(item?.stockCode, "item.stockCode");
    const date = assertYmd(item?.date, "item.date");
    return item?.time === undefined ? { stockCode, date } : { stockCode, date, time: assertHms(item.time, "item.time") };
}

function assertMove(m: MapPlacementMove | undefined): MapPlacementMove {
    return { id: assertId(m?.id, "moves[].id"), x: assertCoord(m?.x, "x"), y: assertCoord(m?.y, "y") };
}

/** 좌표는 유한 실수만 — NaN/Infinity 가 들어가면 그 점은 화면에서 영영 사라지고 원인이 안 남는다. */
function assertCoord(v: number | undefined, field: string): number {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequestException(`${field} 필수(유한 숫자)`);
    return v;
}
