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

/**
 * [ka10099] 종목정보 리스트 — 시장 전체 종목의 raw 엔트리(필터 없음).
 * 주의: `kind`·일부 필드는 키움 공식 스펙에 없는 미문서 필드(실측 확인). 어댑터는 거르지 않고 그대로 반환.
 */
export interface KiwoomKa10099Entry {
    code: string; // 종목코드
    name: string; // 종목명
    listCount: string; // 상장주식수
    auditInfo: string; // 감리/관리/거래정지 상태 (※ 익일 새벽~05시 갱신 → 호출 시점 기준 ~T-1 lag)
    regDay: string; // 상장일
    lastPrice: string; // 전일종가
    state: string; // 증거금/신용/거래상태 문자열
    marketCode: string; // 시장코드
    marketName: string; // 거래소(코스피)/코스닥/ETF/ETN/리츠 ... — 개별주식 식별에 사용(도메인)
    upName: string; // 업종명 (ETF/ETN 은 빈값)
    upSizeName: string; // 대/중/소형주
    companyClassName: string; // 외국기업/스팩 등
    orderWarning: string;
    nxtEnable: string; // NXT 가능여부 (Y/N)
    kind: string; // 미문서 필드: A=일반주(우선주 포함), Q=ETN
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
        trde_prica: string; // 거래대금 (단위: 백만원 — 실측 확인. 원화 환산 시 ×1e6)
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
