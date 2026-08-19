import { Controller, Get, Post, Patch, Put, Inject, Body, BadRequestException } from "@nestjs/common";
import { GroupInvariantError } from "@trade-data-manager/market";
import type { GroupReader, GroupStore } from "@trade-data-manager/market";
import type {
    Group,
    GroupItemRef,
    GroupMembership,
    GroupScope,
    CreateGroupInput,
    RenameGroupInput,
    RemoveGroupInput,
    AttachGroupInput,
    SetGroupParentInput,
} from "@trade-data-manager/wire";
import { GROUP_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode, assertName, rejectDuplicateName } from "../validation.js";

// 그룹 큐레이션 — 이름 붙인 집합 + 관계(중첩)·위치. 옛 태그 컨트롤러를 흡수했다.
// 사전과 멤버십이 한 컨트롤러: 팔레트도 맵도 늘 둘을 같이 읽는다.
// 겹침(징검다리)은 내려보내지 않는다 — 멤버십에서 계산되는 값이라 화면이 필요한 규칙으로 접는다.
//
// **지목은 이름으로, 이름은 바디에.** id 는 계약을 안 건넌다(로컬 미러와 Supabase 가 각자 발급 →
// 동기화를 건넌 참조가 조용히 다른 행을 가리킨다). 이름을 경로에 안 싣는 건 자유 텍스트여서다
// ("타입: 돌파" 처럼 공백·콜론, 슬래시까지 가능) — 그래서 삭제도 POST /remove 다(앵커와 같은 규칙).
@Controller("groups")
export class GroupController {
    constructor(@Inject(GROUP_REPO) private readonly repo: GroupReader & GroupStore) {}

    @Get()
    list(): Promise<Group[]> {
        return this.repo.listGroups();
    }

    /** 전 항목의 멤버십 한 번에. 하루 소속과 타점 소속이 한 피드에 온다(시각 유무로 갈린다). */
    @Get("members")
    members(): Promise<GroupMembership[]> {
        return this.repo.listAllMemberships();
    }

    @Post()
    create(@Body() body: CreateGroupInput): Promise<Group> {
        return this.repo.createGroup(assertName(body?.name), assertScope(body?.scope));
    }

    @Patch("rename")
    async rename(@Body() body: RenameGroupInput): Promise<{ ok: true }> {
        const newName = assertName(body?.newName, "newName");
        // 이름은 전역 유일(유니크 제약) — 이미 있는 이름으로 바꾸려는 건 호출자 잘못이라 500 이 아니라 400 이다.
        await rejectDuplicateName(() => this.repo.renameGroup(assertName(body?.name), newName), newName);
        return { ok: true };
    }

    /** 삭제 — 멤버십도 함께 사라지고(cascade) 자식 그룹은 부모만 풀린다. 사용 건수 확인은 클라가 띄운다. */
    @Post("remove")
    async remove(@Body() body: RemoveGroupInput): Promise<{ ok: true }> {
        await this.repo.removeGroup(assertName(body?.name));
        return { ok: true };
    }

    @Post("members")
    async attach(@Body() body: AttachGroupInput): Promise<{ ok: true }> {
        await guard(() => this.repo.attach(assertName(body?.group, "group"), assertItem(body?.item)));
        return { ok: true };
    }

    @Post("members/remove")
    async detach(@Body() body: AttachGroupInput): Promise<{ ok: true }> {
        await guard(() => this.repo.detach(assertName(body?.group, "group"), assertItem(body?.item)));
        return { ok: true };
    }

    /** 그룹 안 그룹. 부모 층위가 자식을 못 담거나(하루 ⊉ 타점) 순환이면 저장 경로가 거절한다. */
    @Put("parent")
    async setParent(@Body() body: SetGroupParentInput): Promise<{ ok: true }> {
        const parentName = body?.parentName;
        await guard(() =>
            this.repo.setParent(
                assertName(body?.name),
                parentName === null || parentName === undefined ? null : assertName(parentName, "parentName"),
            ),
        );
        return { ok: true };
    }
}

/**
 * 불변식 위반만 400 으로 바꾼다 — 층위 불일치·순환·다른 평면의 부모·**없는 이름**은 호출자의 잘못이고,
 * 화면이 이유를 보여줘야 한다(그냥 두면 500 "Internal server error" 만 뜬다).
 * 다른 예외는 그대로 500 으로 흘려보낸다 — DB 고장을 400 으로 감추면 안 된다.
 */
async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (e) {
        if (e instanceof GroupInvariantError) throw new BadRequestException(e.message);
        throw e;
    }
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
