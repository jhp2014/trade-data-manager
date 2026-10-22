// lab-api /theme 계약 — tdm-ai 판단 작업장의 테마 등록부·종목 이력(읽기 전용). 생산 apps/lab-api(theme/store.ts 가
// 같은 타입으로 적재) · 소비 apps/lab. workbench 의 옛 /theme/members 계약(theme.ts)과는 별개.
//   GET /theme/registry                       → ThemeKeyword[](등록부 그대로)
//   GET /theme/stocks/{code}?asOf=YYYY-MM-DD  → StockMoves. asOf 가 있으면 issues 를 date <= asOf(당일 포함)로
//                                               **서버가** 자른다 — 복기 중 사후정보 차단은 서버 몫. 없는 종목은 404,
//                                               body.error 가 "이력 없는 종목"으로 시작(배선 오류 404 "없는 경로"와
//                                               가르는 판별 문자열 — lab StockHistoryPopover 가 본다. 바꾸면 양쪽 함께).

/** 등록부 한 줄 = 테마 하나(tdm-ai theme/keywords.jsonl). 표시 계층(tier)은 없다 —
 *  테마 간 포함관계는 등록하지 않고 화면이 그날의 멤버 집합 겹침으로 파생한다. */
export interface ThemeKeyword {
    theme: string;
    /** standing = 상시(활동성 무관 노출 · 종목의 정체가 될 수 있음) ·
     *  transient = 한시(활동 창 안에서만 노출 — 미등록 이름도 한시 자동. 종목 소속으로 붙일 수 있고 그 소속도 활동 창에만 보인다. 노출은 조회 몫). */
    kind: "standing" | "transient";
    /** 한시만(선택) — 소속 상시 테마(흡수처): 평소엔 이 이름의 움직임이 소속으로 흡수되고(점유율 포함),
     *  활동기엔 소속 카드에 더해 제 카드가 선다. 사건 한시(밸류업·정치인)는 없음. 표시 계층 아님. */
    parent?: string;
    /** 같은 말(다른 표기) — 조회 때 이 테마로 흡수된다. 카드로 서지 않고 이력에만 원 이름 그대로. */
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
