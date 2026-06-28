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

/**
 * [HHKDB669107C0] 예탁원정보(상장정보일정) 응답. output1=상장 변동 이벤트 배열.
 * 각 행 = 한 변동(신규상장/유상증자/무상증자/감자/액면분할/전환·행사 등). 핵심:
 *   tot_issue_stk_qty(그 이벤트 후 누적 총발행주식수) → 날짜별 주식수 타임라인 복원.
 *   issue_price(발행가; 신규상장이면 공모가), issue_type(사유; 액분 등 일봉 수정 트리거 신호).
 * 페이징 = CTS 쿼리 파라미터(표준 tr_cont 아님). 다음 CTS 가 응답 어디서 오는지는 recon 으로 확정.
 * 수량/가격은 공백패딩 우측정렬 문자열일 수 있음(예 "   142184300") → 소비자가 trim/Number.
 */
export interface KisListInfoEvent {
    list_dt: string; // 상장/등록(변동)일 YYYYMMDD
    sht_cd: string; // 종목코드
    isin_name: string; // 종목명
    stk_kind: string; // 주식종류(보통 등)
    issue_type: string; // 사유(신규상장/유상증자/무상증자/감자/액면분할/STOCKOPTION행사/국내CB행사…)
    issue_stk_qty: string; // 이 이벤트 증감 주식수
    tot_issue_stk_qty: string; // 이 이벤트 후 누적 총발행주식수
    issue_price: string; // 발행가(신규상장=공모가)
}

export interface KisListInfoResponse extends KisResponseBase {
    output1: KisListInfoEvent[];
}

/** tr_cont(연속조회 여부) 메타를 포함한 공통 응답 래퍼. */
export interface KisApiResponse<T> {
    data: T;
    /** 응답 헤더 tr_cont: "F"/"M"=더 있음, "D"/"E"=마지막. */
    trCont: string;
}
