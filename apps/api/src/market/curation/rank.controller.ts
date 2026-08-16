import { Controller, Get, Post, Patch, Inject, Body, BadRequestException } from "@nestjs/common";
import type { RankReader, RankStore, RankTarget, RankPoint } from "@trade-data-manager/market";
import type {
    RankAxis,
    AxisLine,
    ComputedAxisFeed,
    CreateAxisInput,
    RenameAxisInput,
    RemoveAxisInput,
    PlaceInput,
    UnplaceInput,
} from "@trade-data-manager/wire";
import type { ComputedAxes } from "../rank/computedAxes.js";
import { RANK_REPO, COMPUTED_AXES } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 순위 배치 큐레이션 — 축별 상대순위 줄에 복기 타점 배치. 조립(줄 렌더)은 클라 인메모리(옵션 A).
// 배치 대상 타점은 자연키(code·date·time) = review point 삼중키. 검색·확률은 후속 슬라이스.
//
// **축은 이름으로, 자리는 타점으로 지목한다.** id 는 계약을 안 건넌다(로컬 미러와 Supabase 가 각자
// 발급 → 동기화를 건넌 참조가 다른 행을 가리킨다). slot 은 이름이 없고 order_key 는 reindex 가 다시
// 쓰는 값이라, 자리를 가리키는 유일하게 안정된 손잡이가 "그 자리에 있는 타점"이다.
// 이름·타점 모두 바디로 — 축 이름은 자유 텍스트라 경로에 실으면 인코딩 사고가 난다.
@Controller("rank-axes")
export class RankController {
    constructor(
        @Inject(RANK_REPO) private readonly repo: RankReader & RankStore,
        @Inject(COMPUTED_AXES) private readonly computed: ComputedAxes,
    ) {}

    @Get()
    list(): Promise<RankAxis[]> {
        return this.repo.listAxes();
    }

    /** 전 축의 줄 한 번에 — 소비자(배치·시트·분석·작업셋·차트)가 모두 전축을 보므로 축 단건 조회는 두지 않는다. */
    @Get("placements")
    lines(): Promise<AxisLine[]> {
        return this.repo.listAllLines();
    }

    /**
     * 계산 축 피드 — 수식으로 나오는 축의 `타점 → 수치`. 배치(자리·orderKey)는 만들지 않는다:
     * 값이 있으면 순서는 정렬로 나오고, 순위·백분위는 모집단(필터 결과)에 따라 달라져 클라가 질의 시점에 낸다.
     */
    @Get("computed")
    computedAxes(): Promise<ComputedAxisFeed[]> {
        return this.computed.feeds();
    }

    @Post()
    async create(@Body() body: CreateAxisInput): Promise<RankAxis> {
        const scope = body?.scope ?? "point";
        if (scope !== "point" && scope !== "day") throw new BadRequestException('scope 는 "point" | "day"');
        return this.repo.createAxis(assertName(body?.name), scope);
    }

    @Patch("rename")
    async rename(@Body() body: RenameAxisInput): Promise<{ ok: true }> {
        await this.repo.renameAxis(assertName(body?.name), assertName(body?.newName, "newName"));
        return { ok: true };
    }

    @Post("remove")
    async remove(@Body() body: RemoveAxisInput): Promise<{ ok: true }> {
        await this.repo.removeAxis(assertName(body?.name));
        return { ok: true };
    }

    @Post("placements")
    place(@Body() body: PlaceInput): Promise<{ orderKey: number }> {
        return this.repo.place(assertName(body?.axis, "axis"), assertPoint(body?.point), assertTarget(body?.target));
    }

    @Post("placements/remove")
    async unplace(@Body() body: UnplaceInput): Promise<{ ok: true }> {
        await this.repo.unplace(assertName(body?.axis, "axis"), assertPoint(body?.point));
        return { ok: true };
    }
}

function assertName(name: string | undefined, field = "name"): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException(`${field} 필수`);
    return n;
}

/** 타점 자연키 — 배치 대상이자 **자리를 가리키는 손잡이**라 두 쓰임이 같은 검증을 탄다. */
function assertPoint(p: Partial<RankPoint> | undefined, field = "point"): RankPoint {
    return {
        stockCode: assertStockCode(p?.stockCode, `${field}.stockCode`),
        date: assertYmd(p?.date, `${field}.date`),
        time: assertHms(p?.time, `${field}.time`),
    };
}

/** 드롭 목표 검증 — slot(그 타점이 있는 자리에 합류) | between(두 타점의 자리 사이, 양끝 생략 = 줄 끝). */
function assertTarget(t: RankTarget | undefined): RankTarget {
    if (t?.kind === "slot") return { kind: "slot", point: assertPoint(t.point, "target.point") };
    if (t?.kind === "between") {
        return {
            kind: "between",
            ...(t.after === undefined ? {} : { after: assertPoint(t.after, "target.after") }),
            ...(t.before === undefined ? {} : { before: assertPoint(t.before, "target.before") }),
        };
    }
    throw new BadRequestException('target.kind 는 "slot" | "between"');
}
