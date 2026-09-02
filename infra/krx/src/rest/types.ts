// KRX OPEN API 응답 타입. 스펙 문서(홈페이지 배포 docx) 기준의 **선언**이며, 실제 서식·의미는 recon 이 확정한다.
// 원칙: 문서 믿지 말고 실측 — 필드는 전부 string 으로 받고(숫자 변환은 어댑터 경계에서) 미지의 키도 버리지 않는다.

/** 전송 결과 + 원본 헤더. recon 이 헤더까지 봐야 해서 data 만 돌려주지 않는다. */
export interface KrxApiResponse<T> {
    status: number;
    data: T;
    headers: Record<string, string>;
}

/**
 * 일별매매정보 대상 시장. 서비스가 시장별로 분리돼 있어 엔드포인트 자체가 갈린다.
 * - stk 유가증권('10-01-04~) · ksq 코스닥('10-01-04~) · knx 코넥스('13-07-01~)
 * 우리 유니버스는 거래소·코스닥뿐이라 knx 는 당장 안 쓴다(서비스는 열어둔다).
 */
export type KrxMarket = "stk" | "ksq" | "knx";

/**
 * 일별매매정보 1행 = (기준일, 종목). MKTCAP·LIST_SHRS 가 우리가 노리는 값이다.
 * 샘플 실측(20200414 338100): TDD_CLSPRC 4715 × LIST_SHRS 18660000 = MKTCAP 87981900000
 * → MKTCAP 은 **당일 종가 기준**. 우리 시총 계약(D-1 기준)과 시점이 다르므로 그대로 쓰지 않는다.
 */
export interface KrxByddTrdRow {
    /** 기준일자 YYYYMMDD. */
    BAS_DD: string;
    /** 종목코드(샘플은 단축 6자리 — recon 으로 전수 확인). */
    ISU_CD: string;
    ISU_NM: string;
    /** 시장구분(샘플 "KOSPI"). */
    MKT_NM: string;
    /** 소속부(샘플은 빈 문자열 — 코스닥에서 값이 오는지 recon 확인). */
    SECT_TP_NM: string;
    TDD_CLSPRC: string;
    CMPPREVDD_PRC: string;
    FLUC_RT: string;
    TDD_OPNPRC: string;
    TDD_HGPRC: string;
    TDD_LWPRC: string;
    ACC_TRDVOL: string;
    ACC_TRDVAL: string;
    /** 시가총액(원). */
    MKTCAP: string;
    /** 상장주식수(주) — 시총 백필의 본질값. */
    LIST_SHRS: string;
}

/** 성공 응답. 실패 시 이 키가 없을 수 있어 optional(그 경우 클라이언트가 본문째 에러에 싣는다). */
export interface KrxByddTrdResponse {
    OutBlock_1?: KrxByddTrdRow[];
}
