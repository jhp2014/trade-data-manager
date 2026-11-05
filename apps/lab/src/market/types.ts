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
 * GET /daily · GET /minutes — lab 차트 계약(lab-api, contracts/wire 정의를 그대로 쓴다).
 * 일봉 = 수정주가 + 유령 보정 unFix(보정된 날만) · 분봉 = 그 날 원주가 + % 기준가 + 수정주가 환산비(rawScale).
 */
export type { DailyUnFix, LabChartLine, LabDailyCandle, LabMinuteDay } from "@trade-data-manager/wire";

/** GET /stocks 한 줄 중 쓰는 필드(lab-api 는 상장일 listedAt 도 주지만 화면 소비자가 아직 없다 — wire LabStockRow). */
export interface StockMeta {
    stockCode: string;
    name: string;
    market: string;
}

/** GET /marketcap?code&from&to 한 줄 — 그 날 종가 × 그 날 상장주식수(KRX 원값 문자열, contracts/wire 정의를 그대로 쓴다). */
export type { StockMarketCapPoint } from "@trade-data-manager/wire";

/**
 * GET /day-flow?date — 그날 수집 종목 전부의 **분당 원값**(lab 전용 계약, lab-api 서빙 — contracts/wire 정의를
 * 그대로 쓴다). 표현(%·누적·기준 전환)은 전부 클라 몫 — 받은 뒤 flowDerive.ts 가 % 공간으로 파생한다.
 * 옛 /day-replay 와 달리 name·market(마스터 클라 조인)·themes(시트 의존 소멸)가 없다.
 */
export type { DayFlow, DayFlowStock } from "@trade-data-manager/wire";

/**
 * GET /theme/stocks/{code}?asOf — 그 종목의 움직인 날(tdm-ai 이력, lab-api 서빙 — contracts/wire 의
 * labTheme 계약을 그대로 쓴다). asOf 를 주면 서버가 date <= asOf(당일 포함)로 자른다. 이력 없는 종목은 404.
 */
export type { MoveEvidence, MoveIssue, StockMoves } from "@trade-data-manager/wire";

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
 * coverage.channels = 방별 가장 오래된 메시지(channel = 아이템의 방 표시명) — 백필 깊이가 방마다 달라 from 앞의 날에도
 * 어떤 방은 빠짐없다. 옛 서버는 안 보낸다(없으면 from 앞은 전부 모름).
 */
export interface TelegramArchivePage {
    items: TelegramNewsItem[];
    coverage: { from: string; to: string; channels?: { channel: string; from: string }[] } | null;
    nextBefore?: string;
}
