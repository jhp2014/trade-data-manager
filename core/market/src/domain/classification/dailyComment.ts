// core/market/domain — 당일 종목 코멘트(편집 데이터). "이 날, 이 종목에 남긴 메모".
// 종목의 정적 테마(정체성)는 Google Sheet(종목 History)에 있고, 여긴 당일 종목별 자유 주석만 담는다.
// (date, stockCode) 자연키 = 종목당 당일 코멘트 1개. comment 가 키 밖이라 갱신 가능(편집은 upsert/remove).
// 영속 부기(created_at·updated_at)는 도메인 관심사 아님 → 여기 없다(어댑터 경계의 것).

/** 한 종목의 당일 코멘트. 종목당 당일 1개(자연키 (date, stockCode)). */
export interface DailyComment {
    date: string; // YYYY-MM-DD (거래일)
    stockCode: string;
    comment: string; // 당일 주석(빈 문자열이면 저장 안 함 = 삭제)
    author: string; // 입력자
}
