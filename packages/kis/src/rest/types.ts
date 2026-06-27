// KIS REST 응답 타입. 정본은 recon 의 raw 덤프로 검증한다(문서 ≠ 실응답 원칙).
// 아래 필드명은 공식 샘플(koreainvestment/open-trading-api) 기준 best-known — recon 으로 확정.

/** 모든 KIS 시세 응답 공통 헤더. rt_cd "0" 이 성공. */
export interface KisResponseBase {
    rt_cd: string; // "0" 성공, 그 외 오류
    msg_cd: string; // 메시지 코드 (예: EGW00201 유량초과, EGW00123 토큰만료)
    msg1: string; // 메시지 텍스트
}

/**
 * [FHKST03010200] 주식당일분봉조회 output2 의 분봉 1건.
 * 핵심: acml_tr_pbmn(누적거래대금) — 키움 분봉엔 없어 Σ(종가×거래량) 근사를 쓰던 걸 정확값으로 대체.
 */
export interface KisMinuteCandle {
    stck_bsop_date: string; // 영업일자 YYYYMMDD
    stck_cntg_hour: string; // 체결시간 HHMMSS
    stck_prpr: string; // 현재가(해당 분 종가)
    stck_oprc: string; // 시가
    stck_hgpr: string; // 고가
    stck_lwpr: string; // 저가
    cntg_vol: string; // 체결 거래량(해당 분)
    acml_tr_pbmn: string; // 누적 거래대금(당일 시작~해당 분)
}

/**
 * [FHKST03010200] 주식당일분봉조회 응답. output1=종목 당일요약, output2=분봉 배열.
 * output1 실측 필드(recon 확인): prdy_vrss(전일대비), prdy_vrss_sign, prdy_ctrt(전일대비율%),
 *   stck_prdy_clpr(전일종가), acml_vol(누적거래량·주), acml_tr_pbmn(누적거래대금·원),
 *   hts_kor_isnm(종목명), stck_prpr(현재가).
 * [FHKST03010230] 주식일별분봉조회도 같은 형태(output2 1회 최대 120봉) → 동일 타입 재사용.
 */
export interface KisMinuteChartResponse extends KisResponseBase {
    output1: Record<string, string>;
    output2: KisMinuteCandle[];
}

/**
 * [FHKST01011800] 종합 시황/공시(제목) 응답. output=뉴스 제목 배열.
 * 개별 필드명은 recon raw 로 확정(loose 타입 유지).
 */
export interface KisNewsResponse extends KisResponseBase {
    output: Array<Record<string, string>>;
}

/** tr_cont(연속조회 여부) 메타를 포함한 공통 응답 래퍼. */
export interface KisApiResponse<T> {
    data: T;
    /** 응답 헤더 tr_cont: "F"/"M"=더 있음, "D"/"E"=마지막. */
    trCont: string;
}
