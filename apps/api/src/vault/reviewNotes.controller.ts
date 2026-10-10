import { Controller, Get, Inject } from "@nestjs/common";
import type { ReviewNotesResponse } from "@trade-data-manager/wire";
import { VAULT_NOTES } from "./tokens.js";
import type { VaultNotes } from "./vaultNotes.js";

// GET /review-notes → 복기 노트 목록(200 + 상태 봉투 — unset/missing 을 HTTP 오류로 뭉개지 않는다).
// 파라미터 없음: 클라가 경로를 고르는 통로를 만들지 않는다(decisions 「복기 노트 [탐색]」).
@Controller("review-notes")
export class ReviewNotesController {
    constructor(@Inject(VAULT_NOTES) private readonly notes: VaultNotes) {}

    @Get()
    list(): Promise<ReviewNotesResponse> {
        return this.notes.list();
    }
}
