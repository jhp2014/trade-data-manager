/** 방 하나의 수집 결과. completed=false 면 커서를 안 옮겼다(다음 실행이 같은 구간을 다시 걷는다). */
export interface ChannelCollectOutcome {
    peer: string;
    label: string;
    pages: number;
    /** 저장소에 넘긴 메시지 수(신규+덮어쓰기 후보). */
    saved: number;
    completed: boolean;
    /** 이번에 닿은 가장 오래된 메시지 시각(있으면). */
    oldestAt?: Date;
    error?: string;
}

export interface ChannelArchiveProgress {
    phase: "sync" | "backfill";
    peer: string;
    label: string;
    pages: number;
    saved: number;
    oldestAt?: Date;
}

export interface ChannelArchiveOptions {
    onProgress?: (p: ChannelArchiveProgress) => void;
    /** 방당 페이지 상한(스모크·dry-run 용). 닿으면 그 방은 completed=false 로 끝낸다. */
    maxPagesPerChannel?: number;
}

export interface ChannelArchiveResult {
    channels: ChannelCollectOutcome[];
}

/**
 * 뉴스 방 아카이브 수집(Command). 방은 순차로 돈다(병렬 금지 — FLOOD).
 * - sync: 최신부터 내려가 "커서 이하 ∧ 재훑기 창(기본 48h) 밖"에 닿으면 멈춘다. 신규 수집과 수정 반영을 한 패스로.
 * - backfill: 저장된 최소 id 아래로 이어 내려가 since 경계를 넘으면 끝. 중단 후 재실행하면 이어 받는다(자가치유).
 *   경계에 걸친 since 이전 행도 그대로 저장한다 — "min(posted_at) < since" 가 상태 없이 완료 판정이 되게.
 */
export interface ChannelArchiveCollector {
    sync(opts?: ChannelArchiveOptions): Promise<ChannelArchiveResult>;
    backfill(since: Date, opts?: ChannelArchiveOptions): Promise<ChannelArchiveResult>;
}
