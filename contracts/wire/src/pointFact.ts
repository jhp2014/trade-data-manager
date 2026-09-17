// 좌표 봉 사실 — 그룹 배정 좌표(라벨=타점)의 봉 값(원주가 UN, 원 단위 정확값).
// 라벨 좌표는 격자 사건 봉이 아닐 수 있어 격자에 봉 값이 없다 — 결과 걷기 분모(종가)와 걷기 시그널
// 재료(고가)를 이 계약이 진다. 봉 우주는 **격자와 같은 자**(gridSessionBars — 세션 창 필터 뒤 densify):
// 라벨이 격자 사건 봉과 겹치면 격자의 close/tv 파생값과 비트 일치해야 한다(회귀 게이트).
// open·tv 는 싣지 않는다 — 소비자가 없다(2026-09-18, 필요해지면 additive).

/** 라벨 좌표 하나의 봉 사실. 미수집·세션 창 밖 좌표는 항목 자체가 없다(결손은 결손 — 폴백 금지). */
export interface LabeledPointFact {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    /** 봉 종가(원주가 UN, 원) — 결과 걷기·시뮬 분모. */
    close: number;
    /** 봉 고가(원주가 UN, 원) — 걷기 시그널(OutcomeSignal.high). */
    high: number;
}

/** GET /labeled-point-facts 응답 — 전 라벨 좌표의 사실 한 벌(수백~수천 규모라 튜플 인코딩 불요). */
export interface LabeledPointFactBundle {
    facts: LabeledPointFact[];
}
