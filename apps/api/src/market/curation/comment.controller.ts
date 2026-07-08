import { Controller, Get, Post, Inject, Query, Body, BadRequestException } from "@nestjs/common";
import type { DailyComment, DailyCommentReader, DailyCommentStore } from "@trade-data-manager/market";
import { toCanonical } from "@trade-data-manager/broker";
import type { DailyCommentDto, UpsertDailyCommentInput } from "@trade-data-manager/wire";
import { DAILY_COMMENT_REPO } from "../tokens.js";
import { assertYmd } from "../validation.js";

// /comment — 당일 종목 코멘트(DB curation.daily_comments) 읽기·편집. (date, code) 자연키 = 종목당 당일 1개.
//   GET  /comment?date=&code=  종목 우클릭 팝업 프리필 — 그 (날짜,종목)의 코멘트(없으면 null)
//   POST /comment              upsert — comment 가 비면 삭제. author 는 서버(env)가 정한다(단일 사용자).
// 정적 테마(시트)와 달리 자유 주석이라 DB. author 는 클라가 못 정하게 서버 고정(위변조·오타 방지).
const AUTHOR = process.env.CURATION_AUTHOR ?? "jonghun";

@Controller("comment")
export class CommentController {
    constructor(@Inject(DAILY_COMMENT_REPO) private readonly repo: DailyCommentReader & DailyCommentStore) {}

    @Get()
    async get(@Query("date") date?: string, @Query("code") code?: string): Promise<DailyCommentDto | null> {
        if (!code) throw new BadRequestException("code 필수");
        const canon = toCanonical(code);
        const rows = await this.repo.getByDate(assertYmd(date));
        const hit = rows.find((r) => r.stockCode === canon);
        return hit ? { comment: hit.comment, author: hit.author } : null;
    }

    @Post()
    async upsert(@Body() body: UpsertDailyCommentInput): Promise<{ ok: true }> {
        if (!body?.code) throw new BadRequestException("code 필수");
        const date = assertYmd(body.date);
        const code = toCanonical(body.code);
        const comment = (body.comment ?? "").trim();
        if (comment === "") {
            await this.repo.remove(date, code); // 빈 코멘트 = 삭제(도메인 규약)
        } else {
            const entry: DailyComment = { date, stockCode: code, comment, author: AUTHOR };
            await this.repo.upsert(entry);
        }
        return { ok: true };
    }
}
