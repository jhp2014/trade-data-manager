import { Controller, Get, Post, Delete, Inject, Query, Body } from "@nestjs/common";
import type { ChartAnchorStore, ReviewPoint, ReviewPointListItem, ReviewPointReader, ReviewPointStore } from "@trade-data-manager/market";
import type { UpsertReviewPointInput } from "@trade-data-manager/wire";
import { REVIEW_POINT_REPO, CHART_ANCHOR_REPO, MASTER_CACHE } from "../tokens.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 복기 타점 CRUD — 차트에서 스페이스바로 찍는 관찰 지점. 자연키 (stockCode, date, time) = caseId.
// price-line 과 달리 surrogate id 가 없어 삭제도 자연키(query)로 지목한다.
@Controller("review-points")
export class ReviewPointController {
    constructor(
        @Inject(REVIEW_POINT_REPO) private readonly repo: ReviewPointReader & ReviewPointStore,
        @Inject(CHART_ANCHOR_REPO) private readonly anchors: ChartAnchorStore,
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

    // 타점 삭제 = 그 타점 **소유** 앵커(분봉 골격)도 함께 삭제. chart_anchors 는 FK 가 없으므로(선은 타점보다
    // 오래 살아야 해서 일부러 뺐다) DB 가 cascade 해주지 않는다 — 안 지우면 읽을 주인 없는 행이 조용히 쌓인다.
    // 차트 소유 앵커(선·무시 캔들·일봉 골격)는 trade_time 이 NULL 이라 안 건드려진다.
    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        const [stockCode, d, t] = [assertStockCode(code), assertYmd(date), assertHms(time)];
        await this.repo.remove(stockCode, d, t);
        await this.anchors.removeByPoint(stockCode, d, t);
        return { ok: true };
    }
}
