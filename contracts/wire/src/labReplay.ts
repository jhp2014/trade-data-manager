// lab-api /replay 계약 — tdm-ai 장중 복기 분류 장부(theme/replay/curated/<날짜>.jsonl, 읽기 전용)의 그날 하루.
// 생산 apps/lab-api(replay/day.ts — 이름 바꾸기 renames.jsonl 을 겹쳐 정규화) · 소비 apps/lab(테마 보드 소속).
//   GET /replay/day?date=YYYY-MM-DD → LabReplayDay. 그날 장부가 없으면 404 {error}(아직 분류 안 한 날 — 오류 아님).
// 장부의 작업 메모(closing — 그날 장 마감 정리에서 온 사후정보 · unsure · brief · reviewed · evidence · by)는 싣지 않는다.

/** 이름표 하나 — 상위(theme) + 세부(sub, 그날 재료가 따로 선 날만). 이름 바꾸기를 겹친 뒤의 이름이다. */
export interface LabReplayLabel {
    theme: string;
    sub?: string;
    /** 근거 — issue(당일 이슈) · ride(편승) · carry(연장선) · base(기본) · none(없음). 장 전·장 마감 항목의 합집합. */
    basis: string[];
    /**
     * 복기 중 이 이름표가 보이기 시작하는 때 — "open" = 개장 때부터(장 전 이름표 · 당일 이슈 아닌 장 마감 이름표 · 시각 없는 것),
     * "HH:MM" = 장중 글로 붙은 장 마감 이름표의 그 글 시각(since).
     */
    from: string;
}

/** 종목 한 줄 — 그날 그 종목의 이름표들(장 전 ∪ 장 마감, 같은 이름표는 하나로). */
export interface LabReplayStock {
    code: string;
    name: string;
    labels: LabReplayLabel[];
    /** 그날 이유(분류 메모) — 장 마감까지 본 이유라 사후정보가 섞인다. 화면은 「사후 보기」에서만 보인다. */
    why: string;
}

/** GET /replay/day 응답. */
export interface LabReplayDay {
    date: string;
    rows: LabReplayStock[];
}
