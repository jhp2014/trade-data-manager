// 시장 데이터 창구 — 패널·훅은 이 인터페이스만 안다(fetch·URL 은 구현 몫).
// 쓰는 쪽이 필요한 것만 의존하도록 종류별로 나눈다. 구현(tdm.ts / 테스트 가짜)은 여럿을 한 번에 구현해도 된다.
import type { ChartBundle, DayReplay, HtsCursor, HtsNewsItem, StockMeta, TelegramArchivePage } from "./types.js";

export interface ChartData {
    /** 일봉 2년 + 그 날 분봉 + 분봉 % 기준가. */
    chart(code: string, date: string, signal?: AbortSignal): Promise<ChartBundle>;
}

export interface StockData {
    /** 종목 마스터 전량(코드·이름·시장). */
    stockMaster(signal?: AbortSignal): Promise<StockMeta[]>;
}

export interface CalendarData {
    /** 분봉(장중 데이터) 있는 거래일 YYYY-MM-DD, 오름차순(전역·종목무관). 서버가 파일 캐시로 두고 저녁 수집분까지 꼬리만 더한다. */
    tradingDays(signal?: AbortSignal): Promise<string[]>;
}

export interface ThemeData {
    /** 그날 전 종목의 분당 시계열 + 테마 소속. 서버가 과거 날짜를 파일 캐시로 굽는다(처음 한 번은 느릴 수 있다). */
    dayReplay(date: string, signal?: AbortSignal): Promise<DayReplay>;
}

export interface NewsData {
    /**
     * HTS(시황) 헤드라인, 최신순. code 를 주면 그 종목 뉴스, 없으면 전체 시황. q = 제목 키워드.
     * before 없음 = 첫 장(종목+무키워드면 그 날 전체 / 그 밖엔 date 이하 최신 limit 건),
     * before 있음 = 그 커서보다 과거 limit 건("더 가져오기"). DB 조회(읽기).
     */
    htsNews(args: { code?: string; q?: string; date: string; before: HtsCursor | null; limit: number }, signal?: AbortSignal): Promise<HtsNewsItem[]>;
}

export interface TelegramData {
    /**
     * 등록된 텔레그램 방 전체의 메시지 — 날짜 구간(KST, 양 끝 포함), 최신순. q = 공백으로 가른 낱말 전부 포함(없으면 전부).
     * **아카이브(tdm DB)만 읽는다** — 라이브 검색(개인 세션으로 텔레그램에 바로 묻는 길)은 trade-lab 이 쓰지 않는다
     * (요청 제한에 걸려 다른 화면의 뉴스까지 막힌다). 그래서 부르는 횟수에 제한이 없다.
     */
    telegramArchive(args: { from: string; to: string; q?: string; before?: string }, signal?: AbortSignal): Promise<TelegramArchivePage>;
}

/** 앱이 주입받는 전체 — 새 종류는 여기 교집합으로 늘린다. */
export type Market = ChartData & StockData & CalendarData & ThemeData & NewsData & TelegramData;
