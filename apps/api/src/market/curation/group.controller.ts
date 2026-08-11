import { Controller, Get, Post, Patch, Put, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { GroupReader, GroupStore } from "@trade-data-manager/market";
import type {
    Group,
    GroupItemRef,
    GroupMembership,
    GroupMove,
    GroupScope,
    CreateGroupInput,
    RenameGroupInput,
    AttachGroupInput,
    PlaceGroupInput,
    MoveGroupsInput,
    SetGroupParentInput,
} from "@trade-data-manager/wire";
import { GROUP_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 그룹 큐레이션 — 이름 붙인 집합 + 관계(중첩)·위치. 옛 태그 컨트롤러를 흡수했다.
// 사전과 멤버십이 한 컨트롤러: 팔레트도 맵도 늘 둘을 같이 읽는다.
// 겹침(징검다리)은 내려보내지 않는다 — 멤버십에서 계산되는 값이라 화면이 필요한 규칙으로 접는다.
@Controller("groups")
export class GroupController {
    constructor(@Inject(GROUP_REPO) private readonly repo: GroupReader & GroupStore) {}

    @Get()
    list(): Promise<Group[]> {
        return this.repo.listGroups();
    }

    @Post()
    create(@Body() body: CreateGroupInput): Promise<Group> {
        return this.repo.createGroup(assertName(body?.name), assertScope(body?.scope));
    }

    // ── 고정 경로를 bare :id 앞에 — Express 가 "members"·"placements" 를 :id 로 삼지 않게(rank·tag 선례).
    /** 전 항목의 멤버십 한 번에. 하루 소속과 타점 소속이 한 피드에 온다(시각 유무로 갈린다). */
    @Get("members")
    members(): Promise<GroupMembership[]> {
        return this.repo.listAllMemberships();
    }

    /** 좌표 이동 — 여럿 한 번에. 낱개로 쪼개면 여럿을 끌 때 부분 실패가 생긴다. */
    @Patch("placements")
    async move(@Body() body: MoveGroupsInput): Promise<{ ok: true }> {
        const moves = body?.moves;
        if (!Array.isArray(moves) || moves.length === 0) throw new BadRequestException("moves 필수(빈 배열 불가)");
        await this.repo.moveGroups(moves.map(assertMove));
        return { ok: true };
    }

    @Post(":id/members")
    async attach(@Param("id") id: string, @Body() body: AttachGroupInput): Promise<{ ok: true }> {
        await this.repo.attach(assertId(id), assertItem(body));
        return { ok: true };
    }

    @Delete(":id/members")
    async detach(
        @Param("id") id: string,
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        await this.repo.detach(assertId(id), assertItem({ stockCode: code, date, ...(time === undefined ? {} : { time }) } as GroupItemRef));
        return { ok: true };
    }

    /** 평면에 올리기(좌표 포함). 맵 scope 와 그룹 scope 가 다르면 저장 경로가 거절한다. */
    @Put(":id/placement")
    async place(@Param("id") id: string, @Body() body: PlaceGroupInput): Promise<{ ok: true }> {
        await this.repo.setPlacement(assertId(id), {
            mapId: assertId(body?.mapId, "mapId"),
            x: assertCoord(body?.x, "x"),
            y: assertCoord(body?.y, "y"),
        });
        return { ok: true };
    }

    /** 평면에서 내리기 — 그룹은 남고 좌표·부모만 풀린다(자식들도 함께 내려온다). */
    @Delete(":id/placement")
    async unplace(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.setPlacement(assertId(id), null);
        return { ok: true };
    }

    /** 그룹 안 그룹. 같은 평면이 아니거나 순환이면 저장 경로가 거절한다. */
    @Put(":id/parent")
    async setParent(@Param("id") id: string, @Body() body: SetGroupParentInput): Promise<{ ok: true }> {
        const parentId = body?.parentId;
        await this.repo.setParent(assertId(id), parentId === null || parentId === undefined ? null : assertId(parentId, "parentId"));
        return { ok: true };
    }

    @Patch(":id")
    async rename(@Param("id") id: string, @Body() body: RenameGroupInput): Promise<{ ok: true }> {
        await this.repo.renameGroup(assertId(id), assertName(body?.name));
        return { ok: true };
    }

    /** 삭제 — 멤버십도 함께 사라지고(cascade) 자식 그룹은 부모만 풀린다. 사용 건수 확인은 클라가 띄운다. */
    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.removeGroup(assertId(id));
        return { ok: true };
    }
}

function assertId(id: string | undefined, field = "id"): string {
    if (!id || !/^\d+$/.test(id)) throw new BadRequestException(`${field} 필수(숫자)`);
    return id;
}

/** 앞뒤 공백은 유니크 제약을 우회하는 사고("돌파 "≠"돌파")라 여기서 깎는다. */
function assertName(name: string | undefined): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException("name 필수");
    return n;
}

function assertScope(scope: string | undefined): GroupScope {
    if (scope !== "day" && scope !== "point") throw new BadRequestException("scope 는 day|point");
    return scope;
}

/** 항목 키 — time 은 **있으면** 검증한다. 있고 없고가 그룹 scope 와 맞는지는 저장 경로가 본다. */
function assertItem(item: Partial<GroupItemRef> | undefined): GroupItemRef {
    const stockCode = assertStockCode(item?.stockCode, "stockCode");
    const date = assertYmd(item?.date, "date");
    return item?.time === undefined ? { stockCode, date } : { stockCode, date, time: assertHms(item.time, "time") };
}

function assertMove(m: GroupMove | undefined): GroupMove {
    return { id: assertId(m?.id, "moves[].id"), x: assertCoord(m?.x, "x"), y: assertCoord(m?.y, "y") };
}

/** 좌표는 유한 실수만 — NaN/Infinity 가 들어가면 그 점은 화면에서 영영 사라지고 원인이 안 남는다. */
function assertCoord(v: number | undefined, field: string): number {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequestException(`${field} 필수(유한 숫자)`);
    return v;
}
