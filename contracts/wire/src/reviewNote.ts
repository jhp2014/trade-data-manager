// GET /review-notes → 복기 vault(trading-review) 의 타점 노트 목록 — api 소유 읽기 모델(DB 무관, 파일 직독).
// 노트 = 차트 위 자리 하나(vault CLAUDE.md 「하루 기록」). 앱은 거울이라 후보를 다시 계산하지 않는다
// (decisions 「복기 노트 [탐색]」). ⚠ 앞머리 칸(종목코드·날짜·시간·상태·감·후보)은 두 저장소 사이 계약이다.

export type ReviewNoteState = "기록" | "아님";
export type ReviewNoteGam = "할 만함" | "애매" | "별로";
export type ReviewNoteCandidate = "본" | "경계" | "없음";

export interface ReviewNote {
    /** vault/타점 기준 상대 경로(`/` 구분) — 같은 자리 노트가 둘일 때 어느 파일인지 말하는 용도. */
    id: string;
    code: string;
    /** 앞머리 `종목`(없으면 파일명 꼬리). 화면은 종목 마스터 이름을 우선한다. */
    name: string | null;
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM:SS — 서버가 정규화한다(앱 focus·좌표 키와 같은 모양). */
    time: string;
    /** 빈칸(아직 안 봄)·모르는 값 = null. */
    state: ReviewNoteState | null;
    gam: ReviewNoteGam | null;
    /** vault 가 기록이 끝난 뒤 채운다 — 그 전엔 null(가림이 저절로 지켜진다). */
    candidate: ReviewNoteCandidate | null;
    hasMemo: boolean;
    /** 메모 앞부분(hover 용, 길이 상한). 메모가 없으면 부재. */
    memoHead?: string;
}

/** 읽다가 걸린 것 — 노트를 버렸거나(skip) 칸 하나를 못 읽었다(warn). 조용히 떨구지 않는다. */
export interface ReviewNoteIssue {
    file: string;
    why: string;
    /** true = 노트째 버림 · false = 노트는 살리고 칸만 비움. */
    skipped: boolean;
}

/**
 * 200 + 상태 봉투 — 미설정·경로 없음을 빈 목록이나 HTTP 오류로 뭉개지 않는다.
 * unset = api 에 VAULT_DIR 이 없다 · missing = 경로나 `vault/타점` 폴더가 없다.
 */
export type ReviewNotesResponse =
    | { vault: "ok"; root: string; notes: ReviewNote[]; issues: ReviewNoteIssue[] }
    | { vault: "unset" }
    | { vault: "missing"; root: string; why: string };
