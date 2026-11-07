// OpenDART 응답 타입. 공식 개발가이드 기준의 **선언**이며, 실제 서식·의미는 recon 이 확정한다.

/** 모든 JSON 응답의 머리. status "000" = 정상, "013" = 조회된 데이터 없음. */
export interface DartStatus {
    status: string;
    message: string;
}

/** corpCode.xml 한 줄 = 법인 하나. stockCode 는 상장 이력이 없으면 null(상폐 종목의 처리는 recon 이 확정). */
export interface DartCorpCode {
    /** 고유번호 8자리 — 종목코드가 바뀌어도 이어지는 법인 ID. */
    corpCode: string;
    /** **현재** 정식 회사명(이력 아님). */
    corpName: string;
    corpEngName: string | null;
    stockCode: string | null;
    /** 기업개황 최종 변경일 YYYYMMDD. */
    modifyDate: string;
}

/** list.json 요청. corpCode 를 빼면 기간이 3개월로 제한된다. */
export interface DartDisclosureQuery {
    corpCode?: string;
    /** 접수일 시작 YYYYMMDD. */
    bgnDe?: string;
    /** 접수일 끝 YYYYMMDD. */
    endDe?: string;
    /** Y = 최종본만, N = 정정 전 원본까지 전부(시점 재현에는 N). */
    lastReprtAt?: "Y" | "N";
    /** 공시유형 한 글자(A 정기공시, B 주요사항보고 …). */
    pblntfTy?: string;
    /** 공시상세유형 4자리(A001 사업보고서, A002 반기, A003 분기 …). */
    pblntfDetailTy?: string;
    /** Y 유가 · K 코스닥 · N 코넥스 · E 기타. */
    corpCls?: string;
    sort?: "date" | "crp" | "rpt";
    sortMth?: "asc" | "desc";
    pageNo?: number;
    /** 1~100. */
    pageCount?: number;
}

export interface DartDisclosure {
    corp_cls: string;
    corp_name: string;
    corp_code: string;
    stock_code: string;
    report_nm: string;
    /** 접수번호 14자리. ⚠ 앞 8자리가 접수일과 다를 수 있다(실측) — 날짜는 rcept_dt 만 쓴다. */
    rcept_no: string;
    flr_nm: string;
    /** 접수일 YYYYMMDD. 시각 정보는 없다. */
    rcept_dt: string;
    rm: string;
}

/** status "013"(없음) 도 정상으로 받아 list = [] 로 돌려준다. */
export interface DartDisclosureList extends DartStatus {
    page_no?: number;
    page_count?: number;
    total_count?: number;
    total_page?: number;
    list?: DartDisclosure[];
}

/** company.json — 기업개황(현재 값). */
export interface DartCompany extends DartStatus {
    corp_name?: string;
    corp_name_eng?: string;
    stock_name?: string;
    stock_code?: string;
    ceo_nm?: string;
    corp_cls?: string;
    jurir_no?: string;
    bizr_no?: string;
    adres?: string;
    hm_url?: string;
    ir_url?: string;
    phn_no?: string;
    fax_no?: string;
    induty_code?: string;
    est_dt?: string;
    acc_mt?: string;
}

/** zip 안의 파일 하나. 인코딩이 문서마다 다를 수 있어 디코딩은 호출자 몫. */
export interface DartArchiveFile {
    name: string;
    bytes: Uint8Array;
}
