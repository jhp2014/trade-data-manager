// 토스 Open API 원시 타입. 문서(openapi-docs) 기준이고, 값의 실제 모양은 recon 으로 확정한다.

export type TossCandleInterval = "1m" | "1d";

/** 문서상 BigDecimal — JSON 에서 문자열로 올지 숫자로 올지 문서만으로 모른다. */
export type TossDecimal = string | number;

export interface TossCandle {
    /** 1m = 봉이 **끝나는** 시각(직전 1분 집계) · 1d = 거래일(현지 자정). */
    timestamp: string;
    openPrice: TossDecimal;
    highPrice: TossDecimal;
    lowPrice: TossDecimal;
    closePrice: TossDecimal;
    volume: TossDecimal;
    currency: string;
}

export interface TossCandleQuery {
    /** KRX = 6자리 종목코드(영숫자 가능). */
    symbol: string;
    interval: TossCandleInterval;
    /** 기본 100, 최대 200. */
    count?: number;
    /** ISO 8601. 이 시각을 포함해 그 이전 봉만. */
    before?: string;
    /** 기본 true(수정주가). */
    adjusted?: boolean;
}

export interface TossCandlePageBody {
    /** 최신순 — 첫 요소가 가장 최근 봉. */
    candles: TossCandle[];
    /** 다음 페이지의 before. 마지막 페이지면 null. */
    nextBefore: string | null;
}

export interface TossRateLimit {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
}

export interface TossCandlePage extends TossCandlePageBody {
    rateLimit: TossRateLimit;
}

/** 하루 안의 시각 구간(봉 끝 시각 KST, 양끝 포함, "HH:MM:SS"). 안 쓰는 시간대의 채움 봉 페이지를 건너뛰는 데 쓴다. */
export interface TossDayWindow {
    from: string;
    to: string;
}

export interface TossDayMinutesOptions {
    window?: TossDayWindow;
    /** 기본 false(원주가) — 하루치를 받는 쪽은 저장용이다. */
    adjusted?: boolean;
}

export interface TossDayCandle extends TossCandle {
    /** 토스 시각 그대로의 KST 표기 — 1분봉은 봉 끝 시각. */
    kstTime: string;
}

export interface TossDayMinutes {
    /** 시간 오름차순. 토스의 채움 봉(거래량 0)도 그대로 들어 있다. */
    candles: TossDayCandle[];
    pages: number;
    /** 페이지 경계에서 겹쳐 합친 봉 수. */
    duplicates: number;
}

/** 토큰 응답 중 비밀이 아닌 칸. 응답 모양이 문서에 없어 칸 이름도 함께 남긴다. */
export interface TossTokenInfo {
    fieldNames: string[];
    expires_in?: unknown;
    token_type?: unknown;
    scope?: unknown;
}

/** 오류 본문 — 공통 형태(error 객체) 또는 OAuth 표준 형태(error 문자열). */
export interface TossErrorBody {
    error?:
        | string
        | {
              requestId?: string;
              code?: string;
              message?: string;
              data?: unknown;
          };
    error_description?: string;
}
