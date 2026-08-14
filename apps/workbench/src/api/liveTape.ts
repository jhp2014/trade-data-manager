// 장중 테마 테이프(apps/live /tape) — 계약은 @tdm/wire LiveTapeView. transport 만(누적 병합은 패널 몫).
import type { LiveTapeView } from "@trade-data-manager/wire";
import { liveGet, livePost } from "./http.js";

/** 테이프 한 페이지 — since+rev 를 주면 서버가 rev 일치 시 델타(minute >= since)만 내린다. */
export function fetchTape(theme: string, opts: { since?: number; rev?: number } = {}, signal?: AbortSignal): Promise<LiveTapeView> {
    const query: Record<string, string> = { theme };
    if (opts.since != null) query.since = String(opts.since);
    if (opts.rev != null) query.rev = String(opts.rev);
    return liveGet<LiveTapeView>("tape", query, signal);
}

/** 그 종목의 테마들(시트 멤버십) — 테이프 패널 칩. */
export const fetchTapeThemes = (code: string, signal?: AbortSignal): Promise<{ themes: string[] }> =>
    liveGet<{ themes: string[] }>("theme/of", { code }, signal);

/** 수동 메우기 — 조건 이탈 구멍을 분봉 재조회로 채운다(rev 증가 → 다음 폴에서 풀 응답). */
export const backfillTape = (code: string): Promise<{ ok: true }> => livePost<{ ok: true }>("tape/backfill", { code });
