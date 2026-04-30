
/** [au10001] 접근토큰 발급 응답 스펙    
 * {
    "expires_dt":"20241107083713",
    "token_type":"bearer",
    "token":"WQJCwyqInphKnR3bSRtB9NE1lv..."
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
    }
 */
export interface KiwoomTokenResponse {
    token: string;
    token_type: string;
    expires_dt: string;
    return_code: number;
    return_msg: string;
}

/* [ka10100] 종목정보조회 응답 스펙
{
    "code":"005930",
    "name":"삼성전자",
    "listCount":"0000000026034239",
    "auditInfo":"정상",
    "regDay":"20090803",    //상장일
    "lastPrice":"00136000",
    "state":"증거금20%|담보대출|신용가능",
    "marketCode":"0",
    "marketName":"거래소",
    "upName":"금융업",
    "upSizeName":"대형주",
    "companyClassName":"",
    "orderWarning":"0",
    "nxtEnable":"Y",
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10100Response {
    code: string;               // 종목코드
    name: string;               // 종목명
    marketName: string;         // 시장명 (예: 코스피, 코스닥)
    nxtEnable: string;          // NXT가능여부 (Y/N)
    regDay: string;
}


/* [ka10001] 주식기본정보요청 응답 스펙
{
    "stk_cd":"005930",
    "stk_nm":"삼성전자",
    "setl_mm":"12",
    "fav":"5000",
    "cap":"1311",
    "flo_stk":"25527",
    "crd_rt":"+0.08",
    "oyr_hgst":"+181400",
    "oyr_lwst":"-91200",
    "mac":"24352",
    "mac_wght":"",
    "for_exh_rt":"0.00",
    "repl_pric":"66780",
    "per":"",
    "eps":"",
    "roe":"",
    "pbr":"",
    "ev":"",
    "bps":"-75300",
    "sale_amt":"0",
    "bus_pro":"0",
    "cup_nga":"0",
    "250hgst":"+124000",
    "250lwst":"-66800",
    "high_pric":"95400",
    "open_pric":"-0",
    "low_pric":"0",
    "upl_pric":"20241016",
    "lst_pric":"-47.41",
    "base_pric":"20231024",
    "exp_cntr_pric":"+26.69",
    "exp_cntr_qty":"95400",
    "250hgst_pric_dt":"3",
    "250hgst_pric_pre_rt":"0",
    "250lwst_pric_dt":"0.00",
    "250lwst_pric_pre_rt":"0",
    "cur_prc":"0.00",
    "pre_sig":"",
    "pred_pre":"",
    "flu_rt":"0",
    "trde_qty":"0",
    "trde_pre":"0",
    "fav_unit":"0",
    "dstr_stk":"0", //유통주식수
    "dstr_rt":"0",  //유통비율
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10001Response {
    stk_cd: string;
    stk_nm: string;
    mac: string;     // 시가총액
    flo_stk: string; // 상장주식수
    dstr_stk: string;   //유통주식수
}

/* [ka10080] 주식분봉차트조회 단일 캔들 스펙
{
    "stk_cd": "005930",
    "stk_min_pole_chart_qry": [
        {
            "cur_prc": "-78800",
            "trde_qty": "7913",
            "cntr_tm": "20250917132000",
            "open_pric": "-78850",
            "high_pric": "-78900",
            "low_pric": "-78800",
            "acc_trde_qty": "14947571",
            "pred_pre": "-600",
            "pred_pre_sig": "5"     //전일대비기호 1: 상한가, 2:상승, 3:보합, 4:하한가, 5:하락
        },
        {
            "cur_prc": "-78900",
            "trde_qty": "16084",
            "cntr_tm": "20250917131900",
            "open_pric": "-78900",
            "high_pric": "-78900",
            "low_pric": "-78800",
            "acc_trde_qty": "14939658",
            "pred_pre": "-500",
            "pred_pre_sig": "5"
        },
    ],
    "return_code": 0,
    "return_msg": "정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10080Response {
    stk_cd: string;
    stk_min_pole_chart_qry: Array<{
        cur_prc: string;    // 종가
        trde_qty: string;   // 거래량
        cntr_tm: string;    // 체결시간
        open_pric: string;  // 시가
        high_pric: string;  // 고가
        low_pric: string;   // 저가
    }>;
}

/* [ka10081] 주식일봉차트조회 단일 캔들 스펙
{
    "stk_cd": "005930",
    "stk_dt_pole_chart_qry": [
        {
            "cur_prc": "70100",
            "trde_qty": "9263135",
            "trde_prica": "648525",
            "dt": "20250908",
            "open_pric": "69800",
            "high_pric": "70500",
            "low_pric": "69600",
            "pred_pre": "+600",
            "pred_pre_sig": "2",
            "trde_tern_rt": "+0.16"
        },
        {
            "cur_prc": "69500",
            "trde_qty": "11526724",
            "trde_prica": "804642",
            "dt": "20250905",
            "open_pric": "70300",
            "high_pric": "70400",
            "low_pric": "69500",
            "pred_pre": "-600",
            "pred_pre_sig": "5",    //전일대비기호 1: 상한가, 2:상승, 3:보합, 4:하한가, 5:하락
            "trde_tern_rt": "+0.19"
        },
    ],
    "return_code": 0,
    "return_msg": "정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10081Response {
    stk_cd: string;
    stk_dt_pole_chart_qry: Array<{
        cur_prc: string;
        trde_qty: string;
        trde_prica: string; // 거래대금
        dt: string;         // 일자
        open_pric: string;
        high_pric: string;
        low_pric: string;
        pred_pre: string
        pred_pre_sig: string;
    }>;
}

export interface KiwoomApiResponse<T> {
    data: T;
    contYn: string; // 연속 조회 여부 ("Y" or "N")
    nextKey: string; // 다음 데이터 조회를 위한 키값
}

export type KiwoomDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
export type KiwoomMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];