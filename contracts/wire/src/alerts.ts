// 알람(watchlist) 계약 — apps/live REST(/live/watchlist·/live/alerts)와 workbench 실시간 모니터링 패널 공유.
// 조건 모양은 apps/live 의 JSON 영속과도 동일(단일 출처 — apps/live 가 이 타입을 import).
//
// 조건 모델: 조건 = leaf(AND) 리스트. 발화 = 식 전체 참 진입 엣지 + 쿨다운.
//   · OR 은 조건을 여러 개 다는 것으로 대체(한 종목 여러 조건 = 아무거나 걸리면 발화).
//   · 밴드 = price≥하한 AND price≤상한 두 leaf 로 표현.
//   · 순위 leaf 는 시장(KRX/UN 전일종가) 을 고른다 — 이중-시장이라 등락률 순위가 시장마다 다름.

/** 비교 방향 — gte=이상(≥) / lte=이하(≤). */
export type AlertOp = "gte" | "lte";
/** 순위 기준 시장(전일종가). 가격 leaf 는 절대가라 시장 무관. */
export type AlertMarket = "krx" | "un";

/** 절대가격 임계(원) — 차트 좌클릭으로 캡처. op 방향으로 상/하한. */
export interface PriceLeaf {
    kind: "price";
    op: AlertOp;
    value: number; // 원화 절대가(>0)
}
/** 테마 등락률 순위 — reach=도달(순위≤threshold) / delta=60초 창 상승 계단(≥threshold). market=순위 잣대. */
export interface RankLeaf {
    kind: "rank";
    theme: string; // 종목이 여러 테마면 사용자가 지정
    market: AlertMarket;
    mode: "reach" | "delta";
    threshold: number; // reach=K(위) / delta=D(계단), 1 이상 정수
}
export type AlertLeaf = PriceLeaf | RankLeaf;

/** 알람 조건 한 개 — watchlist 종목에 귀속. leaves = AND(최소 1개). */
export interface AlertRule {
    id: string;
    code: string;
    leaves: AlertLeaf[];
    /**
     * 이 룰이 울린 뒤 텔레그램 재배달 최소 간격 ms(생략=서버 기본 3분).
     * 발화 자체는 막지 않는다 — 억제된 발화도 워크벤치 로그에는 남는다(쿨다운 = 배달 정책).
     * 억제 단위는 **룰별**(한 종목의 "돌파"와 "이탈"은 서로 다른 사건이라 서로를 막지 않는다).
     */
    cooldownMs?: number;
    /** 사용자 메모(알림 메시지에 실림). */
    note?: string;
}

/**
 * leaf 가 참이 된 근거 — "왜 울렸는지". **구조화**(실측값·임계)해서 싣고, 텔레그램은 서버가 문구로
 * flatten, 워크벤치는 자기 방식으로 렌더한다(같은 문구를 재현하는 게 아니라 매체별 뷰).
 * price: 실측가 op 임계 / rank: 테마 순위 변화 + 조건(reach=K위 이내 / delta=D계단).
 * past = ~60초 전 순위(표시용, reach 는 없을 수 있음 → 변화 표기 생략).
 * pred: 유니버스 조건검색 술어 — 문구는 core 술어 정의(evidence/label)가 소유(서버가 채워 보냄).
 */
export type LeafEvidence =
    | { kind: "price"; op: AlertOp; price: number; value: number }
    | { kind: "rank"; theme: string; market: AlertMarket; mode: "reach" | "delta"; rank: number; past?: number; threshold: number }
    | { kind: "pred"; text: string };

/**
 * 테마 미니 보드의 한 멤버 — 발화 시점 스냅샷. 순위 잣대는 UN(rateKrx 는 괄호 표시용).
 * 등락률은 시장별 rawPrevClose 기준(발화 종목 features.changeRate 와 달리 보드와 같은 잣대).
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

/** 발화 한 건 — 알림 페이로드·로그. features = 발화 시점 스칼라, evidence = 참이 된 leaf 들의 근거. */
export interface AlertFiring {
    ruleId: string;
    code: string;
    name: string;
    at: number; // epoch ms
    features: {
        price: number; // 발화 시점 현재가(원)
        changeRate: number; // ka10095 등락률 %(참고 표시용)
    };
    /** 식(AND)의 모든 leaf 근거 — 발화 시점엔 전부 참이므로 조건 전체를 설명한다. */
    evidence: LeafEvidence[];
    /** 테마 상황(설정 on 일 때만). 억제된 발화도 갖는다 — 로그 미니 보드가 남아야 하므로. */
    themeContext?: AlertThemeContext;
    note?: string;
}

/** 발화 갈래 — watchlist(집중 감시) / universe(조건검색식 탐지). 로그 필터용. */
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

// ── 유니버스 조건검색 알람 — 종목을 안 고르고 유니버스(hot∪watchlist) 전체에 식을 건다. ──

/** 술어 인스턴스 — kind·params 는 core 술어 레지스트리(BOARD_PREDICATES)가 해석(wire 는 불투명 운반). */
export interface UniversePredicateInstance {
    kind: string;
    params: Record<string, number>;
}

/** 텔레그램 쿨다운 키 — code(종목 단위, 넓게) / codeRule(종목×규칙, 디테일). */
export type CooldownKeyMode = "code" | "codeRule";

/**
 * 유니버스 규칙 하나 — predicates(AND). 규칙 여러 개 = OR("다양한 조건 하나라도").
 * output: telegram=텔레그램(쿨다운)+로그 / log=로그만(넓은 상황 파악용).
 * 발화는 엣지(식 false→true 진입)에만 — 계속 걸려 있는 동안 도배하지 않는다.
 */
export interface UniverseRule {
    id: string;
    /** 규칙 이름 — 발화 메시지에 메모로 실림(예: "돈 유입 + 매물대 돌파"). */
    name?: string;
    predicates: UniversePredicateInstance[];
    output: "telegram" | "log";
    /** 텔레그램 쿨다운 키(기본 code — 같은 종목 알림 한 번). log 규칙엔 무의미. */
    cooldownKey?: CooldownKeyMode;
    /** 텔레그램 재배달 최소 간격 ms(기본 서버 3분). */
    cooldownMs?: number;
}

/** 당일 블랙리스트 한 건 — until(epoch ms) 지나면 자동 만료. 유니버스 전용(watchlist 감시엔 미적용). */
export interface BlacklistEntry {
    code: string;
    until: number;
}

/** GET /live/universe — 유니버스 알람 설정 뷰. */
export interface UniverseView {
    rules: UniverseRule[];
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

/** 조건 + 런타임 상태(읽기 전용) — GET /live/watchlist 응답의 조건 모양. */
export interface AlertRuleView extends AlertRule {
    /** 현재 술어값(true=조건 안). undefined = 아직 첫 평가 전(또는 데이터 결손). 재무장 여부 표시용. */
    inZone?: boolean;
    lastFiredAt?: number | null;
}

/**
 * GET /live/watchlist — 실시간 모니터링 패널이 폴링하는 전체 뷰.
 * 발화 목록은 여기 없다 — 로그(AlertLogView)가 watchlist·유니버스 발화를 시간순으로 함께 싣는 단일 자리다.
 * 룰이 마지막에 언제 울렸는지는 AlertRuleView.lastFiredAt 으로 충분.
 */
export interface WatchlistView {
    codes: string[]; // watchlist 종목(수동 정렬 없음 — 표시는 스냅샷 시세로)
    rules: AlertRuleView[];
    /** 이번 틱 테마 등락률 순위 — 키 `code|theme|market`(전 테마×양시장). 클라가 종목·시장·테마 골라 표시. */
    ranks: Record<string, number>;
}
