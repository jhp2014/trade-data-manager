import { Controller, Get, Post, Delete, Inject, Query, Body } from "@nestjs/common";
import type { ReviewPoint, ReviewPointListItem, ReviewPointReader, ReviewPointStore } from "@trade-data-manager/market";
import type { UpsertReviewPointInput } from "@trade-data-manager/wire";
import { REVIEW_POINT_REPO, MASTER_CACHE } from "../tokens.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 복기 타점 CRUD — 차트에서 스페이스바로 찍는 관찰 지점. 자연키 (stockCode, date, time) = caseId.
// price-line 과 달리 surrogate id 가 없어 삭제도 자연키(query)로 지목한다.
@Controller("review-points")
export class ReviewPointController {
    constructor(
        @Inject(REVIEW_POINT_REPO) private readonly repo: ReviewPointReader & ReviewPointStore,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
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
        const stockCode = assertStockCode(body?.stockCode, "stockCode");
        assertYmd(body.date);
        assertHms(body.time);
        const point: ReviewPoint = {
            stockCode,
            date: body.date,
            time: body.time,
            outcome: body.outcome,
            memo: body.memo,
        };
        await this.repo.upsert([point]);
        return point;
    }

    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        await this.repo.remove(assertStockCode(code), assertYmd(date), assertHms(time));
        return { ok: true };
    }
}
