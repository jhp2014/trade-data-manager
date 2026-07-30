import { Controller, Get, Post, Patch, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { TagReader, TagStore } from "@trade-data-manager/market";
import type { Tag, TagAttachment, CreateTagInput, RenameTagInput, AttachTagInput } from "@trade-data-manager/wire";
import { TAG_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 타점 태그 큐레이션 — 순서 없는 명목형 분류(축=순서 있는 차원과 대비). 한 타점에 여러 개.
// 사전(/tags)과 부착(/tags/:id/attachments)이 한 컨트롤러: 팔레트가 늘 둘을 같이 읽는다.
@Controller("tags")
export class TagController {
    constructor(@Inject(TAG_REPO) private readonly repo: TagReader & TagStore) {}

    @Get()
    list(): Promise<Tag[]> {
        return this.repo.listTags();
    }

    @Post()
    create(@Body() body: CreateTagInput): Promise<Tag> {
        return this.repo.createTag(assertTagName(body?.name));
    }

    // ── 부착 경로를 bare :id 앞에 선언 — Express 가 "attachments" 를 :id 로 삼지 않게 순서 보장(rank 선례).
    /** 전 타점의 부착 한 번에 — 소비자(차트·시트·배치·필터)가 모두 전체를 보므로 타점 단건 조회는 두지 않는다. */
    @Get("attachments")
    attachments(): Promise<TagAttachment[]> {
        return this.repo.listAllAttachments();
    }

    @Post(":id/attachments")
    async attach(@Param("id") id: string, @Body() body: AttachTagInput): Promise<{ ok: true }> {
        await this.repo.attach(assertId(id), {
            stockCode: assertStockCode(body?.stockCode, "stockCode"),
            date: assertYmd(body?.date),
            time: assertHms(body?.time),
        });
        return { ok: true };
    }

    @Delete(":id/attachments")
    async detach(
        @Param("id") id: string,
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
    ): Promise<{ ok: true }> {
        await this.repo.detach(assertId(id), { stockCode: assertStockCode(code), date: assertYmd(date), time: assertHms(time) });
        return { ok: true };
    }

    @Patch(":id")
    async rename(@Param("id") id: string, @Body() body: RenameTagInput): Promise<{ ok: true }> {
        await this.repo.renameTag(assertId(id), assertTagName(body?.name));
        return { ok: true };
    }

    /** 태그 삭제 — 부착도 함께 사라진다(cascade). 사용 건수 확인은 클라가 부착 피드로 세어 띄운다. */
    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.removeTag(assertId(id));
        return { ok: true };
    }
}

function assertId(id: string | undefined): string {
    if (!id) throw new BadRequestException("id 필수");
    return id;
}

/** 태그 이름 — 앞뒤 공백은 사전 오염의 주범이라 여기서 깎는다("돌파 " 와 "돌파" 가 다른 태그가 되는 사고). */
function assertTagName(name: string | undefined): string {
    const n = name?.trim();
    if (!n) throw new BadRequestException("name 필수");
    return n;
}
