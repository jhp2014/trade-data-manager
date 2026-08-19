import { Controller, Get, Post, Delete, Inject, Query, Body } from "@nestjs/common";
import type { ReviewPoint, ReviewPointListItem, ReviewPointReader, ReviewPointStore } from "@trade-data-manager/market";
import type { UpsertReviewPointInput } from "@trade-data-manager/wire";
import { REVIEW_POINT_REPO, CHART_ANCHORS, MASTER_CACHE, COMPUTED_AXES, SKELETON_SHAPES } from "../tokens.js";
import { ChartAnchors } from "./chartAnchors.js";
import { MasterCache } from "../board/masterCache.js";
import { ComputedAxes } from "../rank/computedAxes.js";
import { SkeletonShapes } from "../rank/skeletonShapes.js";
import { assertYmd, assertHms, assertStockCode, assertOptionalText } from "../validation.js";

// 자유 텍스트 상한 — 내용은 자유지만 폭주 페이로드(붙여넣기 사고·비정상 클라)가 DB 로 흐르는 건 경계에서 막는다.
const OUTCOME_MAX = 200;
const MEMO_MAX = 2000;

// 복기 타점 CRUD — 차트에서 스페이스바로 찍는 관찰 지점. 자연키 (stockCode, date, time) = caseId.
// price-line 과 달리 surrogate id 가 없어 삭제도 자연키(query)로 지목한다.
@Controller("review-points")
export class ReviewPointController {
    constructor(
        @Inject(REVIEW_POINT_REPO) private readonly repo: ReviewPointReader & ReviewPointStore,
        @Inject(CHART_ANCHORS) private readonly anchors: ChartAnchors,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
        @Inject(COMPUTED_AXES) private readonly computed: ComputedAxes,
        @Inject(SKELETON_SHAPES) private readonly skeletons: SkeletonShapes,
    ) {}

    // 작업셋 — 전체 타점 + 종목명(월 그룹은 클라). 종목명 조인은 MasterCache.attachNames(앱레이어 조인).
    // 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("all")
    async listAll(): Promise<ReviewPointListItem[]> {
        return this.master.attachNames(await this.repo.listAllPoints());
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<ReviewPoint[]> {
        return this.repo.listByChart(assertStockCode(code), assertYmd(date));
    }

    @Post()
    async upsert(@Body() body: UpsertReviewPointInput): Promise<ReviewPoint> {
        const point: ReviewPoint = {
            stockCode: assertStockCode(body?.stockCode, "stockCode"),
            date: assertYmd(body?.date),
            time: assertHms(body?.time),
            outcome: assertOptionalText(body?.outcome, "outcome", OUTCOME_MAX),
            memo: assertOptionalText(body?.memo, "memo", MEMO_MAX),
        };
        await this.repo.upsert([point]);
        this.invalidateReadModels(); // 타점 집합이 바뀌면 형제 결합(pointCoupled)·골격 모집단이 흔들린다
        return point;
    }

    // 타점 삭제 = 소유 앵커(분봉 골격) 동반 삭제 — 순서·불변식은 유스케이스(ChartAnchors.removePoint)가 소유.
    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        await this.anchors.removePoint(assertStockCode(code), assertYmd(date), assertHms(time));
        this.invalidateReadModels();
        return { ok: true };
    }

    /** 변경 직후 굽기 세대 상향 — 변경 **전에** 시작된 in-flight 빌드에 이후 refetch 가 합류하지 않게. */
    private invalidateReadModels(): void {
        this.computed.invalidate();
        this.skeletons.invalidate();
    }
}
