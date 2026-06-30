import type { DailyIssue } from "../../../../domain/index.js";

/**
 * 리뷰 한 행 — 그 날 universe 종목 1개의 검수 데이터(read-model, UI 조립용 DTO).
 * 도메인 엔티티가 아니라 여러 소스를 합친 뷰 투영이라 앱 레이어에 둔다(도메인은 깨끗하게).
 */
export interface ReviewRow {
    stockCode: string;
    /** 종목명. master 에 없으면(폐지·미수집) null. */
    name: string | null;
    /** 그 거래일 시총(원, 무손실 string). 미백필이면 null. */
    marketCap: string | null;
    /** 시트 멤버십 기반 후보 테마들. 빈 배열 = 미분류(시트에 없거나 그날 매칭 없음). */
    candidateThemes: string[];
    /** 그 날 이 종목에 이미 확정된 이슈 행들(없으면 빈 배열). */
    confirmedIssues: DailyIssue[];
}

/**
 * 당일 리뷰 리더(읽기 Query) — 날짜 하나로 그날 universe(분봉 있는 종목) 전체의 검수 데이터를 flat 으로.
 * **universe 주도**라 시트에 없는 종목도 행으로 나온다(candidateThemes=[], =미분류) — 누락 없음.
 * 뷰 셰이핑(테마별/이슈별 묶기·정렬·차트조회)은 클라이언트 몫 — 여긴 flat 데이터만 주는 시작점 서비스.
 */
export interface DailyReviewReader {
    reviewByDate(date: string): Promise<ReviewRow[]>;
}
