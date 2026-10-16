// 판단 저장소(trade-judgment)의 이슈 이력 — 원본 규약: trade-judgment/이력-awake/형식.md(움직인 날) ·
// 테마구성/형식.md(등재), 테마 묶기: 관점/테마 사전.md. 화면은 이 모양만 안다 — 주는 쪽은 apps/lab-api(src/judgment/history.ts)다.

/** 이력 한 줄(그날). */
export interface HistoryLine {
    date: string;
    /** 그날 테마 이름(세부 — 이력에 쓴 그대로: 기판 · HBM · 인맥(이재명) …). */
    details: string[];
    /** 세부를 사전으로 이은 테마(상위 포함). 사전에 없는 세부뿐이면 []. */
    themes: string[];
    issue: string;
    /** 그날 종가 등락 %(장 마감 정리) — 없으면 null. */
    pct: number | null;
    limitUp: boolean;
    /** 장 마감 정리(주도주시황)의 묶음 이유들 — 그날의 문맥. */
    reasons: string[];
    /** 근거 출처(cafe · awake · telegram · hts) — 화면이 소스를 가려 보는 재료. */
    sources: string[];
}

/** 기준일 이전 이력에서 테마 하나를 센 것. */
export interface ThemeCount {
    theme: string;
    /** 움직인 날 수(이력-awake — 소스가 늘면 날짜 단위 합집합). */
    n: number;
    first: string;
    last: string;
    /** 이 테마 구성 명단에 처음 등재된 날(테마구성/, 기준일 이전) — 등재 기록이 없거나 아직 모르면 null. */
    listed: string | null;
    /** 이 테마로 이어진 세부 이름들(자주 쓴 순). */
    details: string[];
}

/** 이력이 덮는 기간 — 그 밖은 "없음"이 아니라 "아직 안 봤다". */
export interface Coverage {
    from: string;
    to: string;
}

/** 그날 이전 이력으로 종목 → 테마들(많이 · 최근 순). 이력이 없거나 묶인 테마가 없는 종목은 없다. */
export interface HistoryThemes {
    themes: ReadonlyMap<string, string[]>;
    /** 이력이 하나도 없으면 null. */
    coverage: Coverage | null;
}

/** 한 종목의 이력 — 기준일 **이전** 줄만 센다. */
export interface StockHistory {
    code: string;
    name: string;
    asOf: string;
    /** 기준일의 장 마감 정리 — 장중에는 볼 수 없는 정보. 없으면 null. */
    closing: HistoryLine | null;
    /** 많이 · 최근 순. */
    themes: ThemeCount[];
    /** 최근 먼저. */
    lines: HistoryLine[];
    coverage: Coverage | null;
}
