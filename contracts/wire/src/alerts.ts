// 알람 계약 — apps/live REST(/live/watchlist·/live/alerts·/live/universe)와 workbench 패널 공유.
// 규칙 모양은 apps/live 의 JSON 영속과도 동일(단일 출처 — apps/live 가 이 타입을 import).
//
// **통합 규칙 모델(4b)**: 규칙 = 술어(AND) 리스트 + 스코프. code 있으면 집중 감시(watchlist, 그 종목만),
// 없으면 유니버스 전체 탐지. 술어(kind·params·textParams)는 core 레지스트리(BOARD_PREDICATES)가 해석 —
// wire 는 불투명 운반. 옛 AlertLeaf(price/rank)는 price·themeRank 술어로 흡수(엔진도 한 벌).
// 발화 = 식 전체 참 진입 엣지. OR = 규칙 여러 개. 밴드 = price≥하한 AND price≤상한.

/** 순위 기준 시장(전일종가). 이중-시장이라 등락률·순위가 시장마다 다르다. */
export type AlertMarket = "krx" | "un";

/** 술어 인스턴스 — 숫자 params + 문자열 textParams(테마명 등). 해석은 core 레지스트리. */
export interface AlarmPredicateInstance {
    kind: string;
    params: Record<string, number>;
    textParams?: Record<string, string>;
}

/** 텔레그램 쿨다운 키 — code(종목 단위, 넓게) / codeRule(종목×규칙, 디테일). code 스코프 규칙은 룰별 고정. */
export type CooldownKeyMode = "code" | "codeRule";

/**
 * 알람 규칙 하나 — predicates(AND). 규칙 여러 개 = OR("다양한 조건 하나라도").
 * output: telegram=텔레그램(쿨다운)+로그 / log=로그만(넓은 상황 파악용).
 * 발화는 엣지(식 false→true 진입)에만 — 계속 걸려 있는 동안 도배하지 않는다.
 * 데이터 결손 정책은 스코프별: code 스코프=미결이면 틱 스킵(가짜 엣지 방지) / 유니버스=false 취급
 * (탐지 — "이제 알게 된 돌파"도 발화).
 */
export interface AlarmRule {
    id: string;
    /** 종목 귀속(집중 감시) — 없으면 유니버스(hot∪watchlist) 전체 탐지. */
    code?: string;
    /** 규칙 이름 — 발화 메시지에 메모로 실림. */
    name?: string;
    predicates: AlarmPredicateInstance[];
    output: "telegram" | "log";
    /** 텔레그램 쿨다운 키(유니버스 전용, 기본 code). code 스코프 규칙은 룰별(=종목×룰) 고정. */
    cooldownKey?: CooldownKeyMode;
    /** 텔레그램 재배달 최소 간격 ms(기본 서버 3분). 발화는 막지 않는다(쿨다운=배달 정책, 로그엔 남음). */
    cooldownMs?: number;
}

/** 발화 근거 한 조각 — 문구는 core 술어(predicateEvidence — label+실측값)가 소유, 서버가 채워 보낸다. */
export interface LeafEvidence {
    kind: "pred";
    text: string;
}

/**
 * 테마 미니 보드의 한 멤버 — 발화 시점 스냅샷. 순위 잣대는 UN(rateKrx 는 괄호 표시용).
 * 등락률은 시장별 basePrice(기준가) 기준(발화 종목 features.changeRate 와 달리 보드와 같은 잣대).
 */
export interface AlertThemeMember {
    code: string;
    name: string;
    rateUn: number | null; // UN 등락률 %(순위 잣대) — 없으면 UN 전일종가 미도착
    rateKrx: number | null; // KRX 등락률 %(괄호 표시용)
    rank: number; // 테마 내 UN 순위(1-based)
    tradeValue: number; // 누적 거래대금(백만원)
    themes: string[]; // 그 종목의 연관 테마(칩) — 워크벤치가 렌더, 텔레그램은 생략(길이)
    isSelf: boolean; // 발화 종목 자신(화살표·강조)
}

/**
 * 발화 종목이 놓인 테마 상황 — 발화 시점 스냅샷(재계산 불가라 저장). 설정 off 면 없음.
 * boards = 유니버스 멤버 임계 이상인 테마만 펼침(멤버 전부, UN 순위순). 각 소비자가 잘라 렌더
 * (텔레그램=테마당 상위 N + "외 M종목" / 워크벤치=전부, 필요 시 자체 컷).
 * (배정 팝업의 ThemeContext(theme.ts)와 다른 개념이라 Alert 접두.)
 */
export interface AlertThemeContext {
    chips: string[]; // 발화 종목의 소속 테마 전부(칩만)
    boards: { theme: string; members: AlertThemeMember[] }[];
}

/** 발화 한 건 — 알림 페이로드·로그. features = 발화 시점 스칼라, evidence = 참이 된 술어들의 근거. */
export interface AlertFiring {
    ruleId: string;
    code: string;
    name: string;
    at: number; // epoch ms
    features: {
        price: number; // 발화 시점 현재가(원)
        changeRate: number; // ka10095 등락률 %(참고 표시용)
    };
    /** 식(AND)의 모든 술어 근거 — 발화 시점엔 전부 참이므로 조건 전체를 설명한다. */
    evidence: LeafEvidence[];
    /** 테마 상황(설정 on 일 때만). 억제된 발화도 갖는다 — 로그 미니 보드가 남아야 하므로. */
    themeContext?: AlertThemeContext;
    note?: string;
}

/** 발화 갈래 — watchlist(집중 감시, code 스코프) / universe(조건검색식 탐지). 로그 필터용. */
export type AlertScope = "watchlist" | "universe";

/**
 * 배달 결과 — 로그 ⊇ 텔레그램 불변식(발화는 전부 로그에, 텔레그램은 부분집합).
 * sent=텔레그램 배달 / suppressed=쿨다운 억제 / logOnly=규칙이 로그 전용(output:"log") /
 * blacklisted=종목 블랙리스트(당일) — 뒤 셋은 텔레그램 미발송이지만 로그엔 남는다.
 */
export type AlertDelivery = "sent" | "suppressed" | "logOnly" | "blacklisted";

/**
 * 발화 로그 한 줄 — 워크벤치 로그 패널이 누적한다.
 * **억제된 발화도 남는다**(delivery≠sent) — 알람을 듣고 PC 앞에 앉았을 때 시장 전체를 보기 위함.
 */
export interface AlertLogEntry {
    /** 단조 증가 — 클라 증분 폴링 커서. at 은 같은 틱에 여러 건이라 커서로 못 쓴다. */
    seq: number;
    firing: AlertFiring;
    scope: AlertScope;
    /** 그 종목이 속한 **전체** 테마 — 클라 필터용. */
    themes: string[];
    delivery: AlertDelivery;
}

/**
 * 당일 블랙리스트 한 건 — until(epoch ms) 지나면 자동 만료. 유니버스 전용(watchlist 감시엔 미적용).
 * scope: telegram(기본)=텔레그램만 차단(로그엔 blacklisted 로 남음) / all=로그조차 안 남김(완전 무시).
 */
export interface BlacklistEntry {
    code: string;
    until: number;
    scope?: "telegram" | "all";
}

/** GET /live/universe — 유니버스(스코프 없는) 규칙 + 블랙리스트. */
export interface UniverseView {
    rules: AlarmRule[];
    blacklist: BlacklistEntry[];
}

/**
 * GET /live/alerts/log?since=<seq> — since 초과 항목만(seq 오름차순, 클라가 누적).
 * 서버 재시작이면 seq 가 0 부터 다시 → 클라는 `latestSeq < since` 를 보고 자기 로그를 리셋한다.
 */
export interface AlertLogView {
    entries: AlertLogEntry[];
    latestSeq: number;
}

/** 규칙 + 런타임 상태(읽기 전용) — GET /live/watchlist 응답의 규칙 모양. */
export interface AlarmRuleView extends AlarmRule {
    /** 현재 술어값(true=조건 안). undefined = 아직 첫 평가 전(또는 데이터 결손). 재무장 여부 표시용. */
    inZone?: boolean;
    lastFiredAt?: number | null;
}

/**
 * GET /live/watchlist — 실시간 모니터링 패널이 폴링하는 전체 뷰(code 스코프 규칙만).
 * 발화 목록은 여기 없다 — 로그(AlertLogView)가 watchlist·유니버스 발화를 시간순으로 함께 싣는 단일 자리다.
 */
export interface WatchlistView {
    codes: string[]; // watchlist 종목(수동 정렬 없음 — 표시는 스냅샷 시세로)
    rules: AlarmRuleView[];
    /** 이번 틱 테마 등락률 순위 — 키 `code|theme|market`(전 테마×양시장). 클라가 종목·시장·테마 골라 표시. */
    ranks: Record<string, number>;
}
