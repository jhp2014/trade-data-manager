import { Controller, Get, Post, Delete, Inject, Query, Body, BadRequestException } from "@nestjs/common";
import type { ReviewPoint, ReviewPointListItem, ReviewPointRepository } from "@trade-data-manager/market";
import { REVIEW_POINT_REPO } from "../tokens.js";
import { assertYmd, assertHms } from "../validation.js";

interface UpsertReviewPointBody {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
    memo?: string;
}

// 복기 타점 CRUD — 차트에서 스페이스바로 찍는 관찰 지점. 자연키 (stockCode, date, time) = caseId.
// price-line 과 달리 surrogate id 가 없어 삭제도 자연키(query)로 지목한다.
@Controller("review-points")
export class ReviewPointController {
    constructor(@Inject(REVIEW_POINT_REPO) private readonly repo: ReviewPointRepository) {}

    // 작업셋 — 전체 타점 + 종목명(월 그룹은 클라). 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("all")
    listAll(): Promise<ReviewPointListItem[]> {
        return this.repo.listAllPoints();
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<ReviewPoint[]> {
        if (!code) throw new BadRequestException("code 필수");
        return this.repo.listByChart(code, assertYmd(date));
    }

    @Post()
    async upsert(@Body() body: UpsertReviewPointBody): Promise<ReviewPoint> {
        if (!body?.stockCode) throw new BadRequestException("stockCode 필수");
        assertYmd(body.date);
        assertHms(body.time);
        const point: ReviewPoint = { stockCode: body.stockCode, date: body.date, time: body.time, memo: body.memo };
        await this.repo.upsert([point]);
        return point;
    }

    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        if (!code) throw new BadRequestException("code 필수");
        await this.repo.remove(code, assertYmd(date), assertHms(time));
        return { ok: true };
    }
}
