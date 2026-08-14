// 실시간 테마 테이프(apps/live) → workbench 계약. GET /live/tape. 런타임 코드 0 — 전부 타입.
//
// 테이프 = 엔진이 3초 틱마다 접어 쌓는 "장중 분당 시계열"(폴링 아님 — 이미 손에 든 시세를 버리지 않는 것).
// 빈 분(minutes 에 없는 분)은 **결손이 정보다**: 그 분에 엔진 틱(ticks)이 있었으면 조건 이탈,
// 없었으면 기계 결손(서버 재시작·WS 끊김) — 클라는 전자를 선 끊김으로, 후자를 회색 세로띠로 그린다.
//
// 델타 프로토콜: 클라가 (rev, since=보유 최대 분)을 보내면 서버는 rev 일치 시 minute >= since 만 내린다
// (마지막 분은 재전송 — 형성 중이던 분이 갱신됐을 수 있어 클라가 덮어쓴다). rev 불일치(백필로 과거가
// 채워짐)·날짜 변경이면 풀 응답. 델타에 모르는 코드가 와도 그대로 추가하면 된다 — 신규 편입 종목의
// 과거는 백필 완료 시 rev 증가로 풀 응답에 실려 온다.

/** 테이프 종목 하나 — minutes/rate/cumAmount 는 같은 길이 평행 배열(분 오름차순, 빠진 분은 자리 자체가 없음). */
export interface LiveTapeStock {
    code: string;
    name: string;
    /** 속한 테마 전부(시트 멤버십) — 요청 테마 외 칩 표시용. */
    themes: string[];
    /** watchlist(알람 타겟) — 조건 이탈해도 폴링이 계속되는 종목. 선이 안 끊기는 이유가 "테마 활약"이 아님을 라벨로 구분. */
    watched?: boolean;
    /** 벽시계 분(0~1439, KST). */
    minutes: number[];
    /** 등락률 %(기준가 = 일봉 컨텍스트 basePrice.un — 복기 deriveMinutes 와 같은 분모). */
    rate: number[];
    /** 누적 거래대금(원) — 복기 cumAmount 와 같은 단위(굵기 채널). */
    cumAmount: number[];
}

/** GET /tape?theme=&since=&rev= 응답. */
export interface LiveTapeView {
    /** 테이프 날짜(KST). 클라 보유분과 다르면 무조건 풀 교체. */
    date: string;
    /** 백필(과거 채움) 세대 — 증가하면 클라는 풀 재요청. */
    rev: number;
    theme: string;
    /** 서버가 적용한 필터(에코) — null 이면 풀 응답. */
    since: number | null;
    /** 엔진이 틱을 돈 벽시계 분들(since 필터 동일 적용) — 기계 결손 판정의 전역 축. */
    ticks: number[];
    stocks: LiveTapeStock[];
    /** 테마 멤버인데 기준가(basePrice.un) 미도착이라 아직 못 싣는 코드들 — "기준가 대기 N" 표시용. */
    pending: string[];
}
