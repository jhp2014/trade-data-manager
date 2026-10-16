// tdm api 응답 모양 — tdm-work contracts/wire · core/market/domain 에서 필요한 것만 옮겨 왔다.
// 시계열 가격·수량은 무손실 string(계산은 domain.ts 에서).

/** 시장별(KRX / UN=통합) 두 벌. */
export interface ByMarket<T> {
    krx: T;
    un: T;
}

/** 분봉 % 기준 시장. */
export type PriceMode = "krx" | "un";

export interface DailyBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    /** 거래대금(원) — 일봉 소스 원본 값. */
    amount: string;
}

export interface DailyCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    krx: DailyBar;
    un: DailyBar;
}

/** 분봉 바 — 거래대금은 없다(domain.computeMinuteTradingAmount 로 계산). */
export interface MinuteBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

export interface MinuteCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    /** 프리마켓·시간외(NXT 단독)엔 KRX 세션이 없어 null. */
    krx: MinuteBar | null;
    un: MinuteBar;
}

/**
 * GET /chart?code&date — 일봉 2년(수정주가, 오름차순) + 그 날 dense 분봉(원주가) + 분봉 % 기준가.
 * 일봉 범위는 서버가 정한다(date−24개월 … date).
 */
export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandle[];
    /** 분봉 % 기준가(직전 거래일 종가, 당일 원주가 스케일). 상장 첫날 등은 null. */
    basePrice: ByMarket<number | null> | null;
}

/** GET /stocks/master 한 줄. */
export interface StockMeta {
    stockCode: string;
    name: string;
    market: string;
}

/**
 * GET /day-replay?date — 그날 수집 종목 전부의 분당 % 시계열 + 메타(테마 소속 포함). 하루 수백~900종목, 원본 ~26MB(gzip ~4MB).
 * % 는 전부 통합(UN) 기준가 대비 한 벌(소수 2자리). times 는 kstToUnix(date, time) 로 만든 unix 초.
 * 서버가 주는 분봉 OHLC(minuteOpen/High/Low)·120일 고가(trailingHighs)는 테마 보드가 안 써서 받자마자 버린다
 * (메모리 하루 ~32MB → ~23MB, tdm.ts). 필요해지면 여기와 tdm.ts 를 같이 늘린다.
 */
export interface ReplayStock {
    code: string;
    times: number[];
    /** 분당 종가 등락률 % */
    rate: number[];
    /** 그 분까지의 고가 %(누적 최대) */
    high: number[];
    /** 그 분까지의 저가 %(누적 최소) */
    low: number[];
    /** 당일 시가 % */
    open: number;
    /** 그 분까지의 누적 거래대금(원) */
    cumAmount: number[];
    /** 등락률 기준가(KRX 기준 재계산용) */
    basePrice: ByMarket<number | null>;
    name: string | null;
    market: string | null;
    /** 시가총액(원, 직전 거래일 기준) */
    marketCap: string | null;
    /** 테마명 — 시트에 없는 종목은 [] */
    themes: string[];
}

export interface DayReplay {
    date: string;
    stocks: ReplayStock[];
}

/** GET /news/hts 한 건 — HTS(시황) 헤드라인. 응답은 늘 최신순. */
export interface HtsNewsItem {
    /** 페이징 커서(같은 날짜 안의 순번, 숫자 문자열) */
    srno: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    title: string;
    sourceName: string;
    categoryCode: string;
}

/** HTS 뉴스 "더 가져오기" 커서 — 이 지점(가장 과거 항목의 날짜·순번)보다 과거만. */
export interface HtsCursor {
    date: string;
    srno: string;
}

/** 텔레그램 아카이브 한 건 — 등록된 방의 메시지(본문 전문). */
export interface TelegramNewsItem {
    /** 방 이름 */
    channel: string;
    /** ISO 절대시각(표시는 KST 로) */
    at: string;
    text: string;
    url?: string;
    /** `${peer}#${messageId}` — 고유 식별 */
    ref: string;
    /** 본문 안 링크(글자 위치) — 없으면 칸 자체가 없다. */
    links?: { offset: number; length: number; url: string }[];
    /** 링크 미리보기(기사 제목 · 설명) — tdm 검색은 본문과 이것을 함께 본다. 하나도 없으면 칸 자체가 없다. */
    preview?: { title?: string; description?: string };
}

/**
 * GET /news/telegram/archive 봉투 — tdm DB 아카이브(라이브 아님).
 * coverage = DB 에 빠짐없이 든 구간(ISO, UTC). 그 밖의 날짜는 비었거나 불완전하다 — "언급 없음"이 아니라 "아직 모름".
 * null = 수집이 아직 한 바퀴도 안 돌았다. nextBefore = limit 에 걸렸을 때 다음 요청의 before.
 */
export interface TelegramArchivePage {
    items: TelegramNewsItem[];
    coverage: { from: string; to: string } | null;
    nextBefore?: string;
}
