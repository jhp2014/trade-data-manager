// 키움 REST TR 응답 타입. 정본: trade-data-manager/apps/batch/src/clients/types.ts 이주.
// (원본 응답 스펙 주석은 batch 쪽 explore 로그 및 _shared 참고)

/** [au10001] 접근토큰 발급 응답 */
export interface KiwoomTokenResponse {
    token: string;
    token_type: string;
    expires_dt: string;
    return_code: number;
    return_msg: string;
}

/** [ka10100] 종목정보조회 */
export interface KiwoomKa10100Response {
    code: string; // 종목코드
    name: string; // 종목명
    marketName: string; // 시장명 (코스피/코스닥)
    nxtEnable: string; // NXT가능여부 (Y/N)
    regDay: string; // 상장일
}

/** [ka10001] 주식기본정보요청 */
export interface KiwoomKa10001Response {
    stk_cd: string;
    stk_nm: string;
    mac: string; // 시가총액
    flo_stk: string; // 상장주식수
    dstr_stk: string; // 유통주식수
}

/** [ka10080] 주식분봉차트조회 */
export interface KiwoomKa10080Response {
    stk_cd: string;
    stk_min_pole_chart_qry: Array<{
        cur_prc: string; // 종가
        trde_qty: string; // 거래량
        cntr_tm: string; // 체결시간 (YYYYMMDDHHMMSS)
        open_pric: string; // 시가
        high_pric: string; // 고가
        low_pric: string; // 저가
    }>;
}

/** [ka10081] 주식일봉차트조회 */
export interface KiwoomKa10081Response {
    stk_cd: string;
    stk_dt_pole_chart_qry: Array<{
        cur_prc: string;
        trde_qty: string;
        trde_prica: string; // 거래대금
        dt: string; // 일자
        open_pric: string;
        high_pric: string;
        low_pric: string;
        pred_pre: string;
        pred_pre_sig: string;
    }>;
}

/** 연속조회 메타를 포함한 공통 응답 래퍼. */
export interface KiwoomApiResponse<T> {
    data: T;
    contYn: string; // 연속 조회 여부 ("Y" | "N")
    nextKey: string; // 다음 페이지 키
}

export type KiwoomDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
export type KiwoomMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];
