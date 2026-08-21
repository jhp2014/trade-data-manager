import { Controller, Get, Post, Inject, Body } from "@nestjs/common";
import type { DailyCommentListItem, UpsertDailyCommentInput } from "@trade-data-manager/wire";
import { DAILY_COMMENTS } from "../tokens.js";
import type { DailyComments } from "./dailyComments.js";
import { assertYmd, assertStockCode } from "../validation.js";

// /comment — 당일 종목 코멘트(DB curation.daily_comments) 읽기·편집. (date, code) 자연키 = 종목당 당일 1개.
//   GET  /comment/all  전량 — 클라 큐레이션 복제본(작업셋 배지·존재 지도·팝업 프리필 전부 이 테이블의 셀렉터)
//   POST /comment      저장 — 빈 코멘트는 삭제로 해석하고 author 는 서버가 정한다(DailyComments 규약)
// 여긴 HTTP 경계만 본다: 파라미터 검증 → 위임 → wire 모양으로 변환. 규칙은 DailyComments 가 소유.
@Controller("comment")
export class CommentController {
    constructor(@Inject(DAILY_COMMENTS) private readonly comments: DailyComments) {}

    @Get("all")
    async listAll(): Promise<DailyCommentListItem[]> {
        return (await this.comments.listAll()).map((c) => ({ date: c.date, stockCode: c.stockCode, comment: c.comment, author: c.author }));
    }

    @Post()
    async upsert(@Body() body: UpsertDailyCommentInput): Promise<{ ok: true }> {
        await this.comments.save(assertYmd(body?.date), assertStockCode(body?.code), body.comment ?? "");
        return { ok: true };
    }
}
