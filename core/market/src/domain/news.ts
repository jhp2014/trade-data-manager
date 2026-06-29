// core/market/domain — 뉴스 헤드라인(본질만). KIS 종합 시황/공시(제목) 한 건.
// 본문은 보관하지 않는다(헤드라인 + 시각 + 출처 + 태깅 종목이 시그널). 파생/정규화(출처코드↔이름,
// 카테고리 의미)는 읽기 표현계층의 관심사. 한 헤드라인이 여러 종목을 태깅할 수 있다(iscd1~10).
//
// 식별: srno(cntt_usiq_srno) 는 KIS 내부 "내용 조회용 일련번호"이자 시각(YYYYMMDDHHMMSS+seq) 내장
//   전역 유니크 키 → dedup 의 자연키. 무손실 string 유지(저장 경계에서만 BigInt 변환).

/**
 * 한 건의 시황/공시 헤드라인. stockCodes 는 비어있을 수 있다(매크로·지수·해외 등 종목 미태깅).
 * date/time 은 작성시각(Asia/Seoul 벽시계) — 연속 워크 재앵커 + 월파티션 키로 쓰인다.
 */
export interface NewsHeadline {
    srno: string; // cntt_usiq_srno (19자리). 전역 유니크 + 시각 내장.
    date: string; // YYYY-MM-DD (data_dt)
    time: string; // HH:MM:SS (data_tm)
    title: string; // hts_pbnt_titl_cntt
    sourceCode: string; // news_ofer_entp_code (제공업체 1글자 코드)
    sourceName: string; // dorg (자료원 표시명)
    categoryCode: string; // news_lrdv_code (뉴스 대구분)
    stockCodes: string[]; // iscd1~10 중 비지 않은 것들. 0개 가능.
}
