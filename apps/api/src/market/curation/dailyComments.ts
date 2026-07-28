// 당일 코멘트 유스케이스 — (date, stockCode) 자연키 = 종목당 당일 1개.
//
// 규칙이 둘 있어서 컨트롤러(전송 어댑터)가 아니라 여기 산다:
//  ① **빈 코멘트 = 삭제** — "비우기"를 별도 엔드포인트로 두지 않고 저장 하나로 처리하는 도메인 규약.
//  ② **author 는 서버가 정한다** — 클라가 못 정하게(위변조·오타 방지). 단일 사용자라 설정값 하나.
// 컨트롤러는 HTTP 경계 검증(날짜·종목코드 형식)만 하고 여기로 넘긴다.
import type { DailyComment, DailyCommentReader, DailyCommentStore } from "@trade-data-manager/market";

export class DailyComments {
    constructor(
        private readonly repo: DailyCommentReader & DailyCommentStore,
        /** 입력자 — env(CURATION_AUTHOR)에서 배선. 주입이라 테스트가 프로세스 환경에 안 묶인다. */
        private readonly author: string,
    ) {}

    /** 그 (날짜, 종목)의 코멘트. 없으면 null — 팝업이 빈 칸으로 연다. */
    getOne(date: string, stockCode: string): Promise<DailyComment | null> {
        return this.repo.getOne(date, stockCode);
    }

    /** 저장. 공백만 남는 코멘트는 삭제로 해석한다(규칙 ①). 저장된 내용을 반환(삭제면 null). */
    async save(date: string, stockCode: string, comment: string): Promise<DailyComment | null> {
        const trimmed = comment.trim();
        if (trimmed === "") {
            await this.repo.remove(date, stockCode);
            return null;
        }
        const entry: DailyComment = { date, stockCode, comment: trimmed, author: this.author };
        await this.repo.upsert(entry);
        return entry;
    }
}
