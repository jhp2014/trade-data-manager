// lab-api /theme 계약 — tdm-ai 판단 작업장의 테마 등록부·종목 이력(읽기 전용). 생산 apps/lab-api(theme/store.ts 가
// 같은 타입으로 적재) · 소비 apps/lab. workbench 의 옛 /theme/members 계약(theme.ts)과는 별개.
//   GET /theme/registry                       → ThemeKeyword[](등록부 그대로)
//   GET /theme/stocks/{code}?asOf=YYYY-MM-DD  → StockMoves. asOf 가 있으면 issues 를 date <= asOf(당일 포함)로
//                                               **서버가** 자른다 — 복기 중 사후정보 차단은 서버 몫. 없는 종목은 404.

/** 등록부 한 줄 = 테마 하나(tdm-ai views/theme/keywords.jsonl). */
export interface ThemeKeyword {
    theme: string;
    /** 1 = 큰 테마(기본 묶음 단위) · 2 = 세부 테마(정체 유지). */
    tier: 1 | 2;
    /** 세부만 — 소속 큰 테마. */
    parent?: string;
    /** basic = 기본(상시) · event = 이벤트(마지막 활동일 뒤 일정 기간 지나면 숨김 — 노출은 조회 몫). */
    kind: "basic" | "event";
    /** 같은 말(다른 표기) — 조회 때 이 테마로 흡수된다. */
    aliases: string[];
}

/** 움직인 날의 근거 1건 — ref 는 아카이브 좌표(표시만, 링크 아님). */
export interface MoveEvidence {
    src: string;
    date: string;
    time: string;
    title: string;
    ref: string;
    pct?: number;
}

/** 이력(움직인 날)의 이슈 줄 — 종목이 그날 왜 움직였나. */
export interface MoveIssue {
    date: string;
    /** 그날 엮인 테마(그때 쓰인 이름 그대로 — 등록부 흡수는 조회 때). */
    themes: string[];
    issue: string;
    evidence: MoveEvidence[];
}

/** GET /theme/stocks/{code} 응답 — 그 종목의 움직인 날(issues 는 날짜 오름차순). */
export interface StockMoves {
    code: string;
    name: string;
    /** 아카이브에서 훑은 범위 — 모든 종목이 같다. */
    from: string;
    to: string;
    /** 날짜 오름차순. asOf 를 주면 date <= asOf 만. */
    issues: MoveIssue[];
}
