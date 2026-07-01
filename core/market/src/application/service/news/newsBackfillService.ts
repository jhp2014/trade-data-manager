// NewsBackfillService — 시황 헤드라인 백필(일회성 Command) 구현.
// 협력: NewsSource(앵커 이전 한 페이지) · StockNewsRepository(멱등 저장).
// 흐름(역방향 워크 + forced-stepping — recon 으로 확정):
//   ① 앵커 = (to, 23:59:59) 부터. 어댑터가 ≤anchor 내림차순(벤더 wrap 은닉) 한 페이지(≤40) 반환.
//   ② 직전 oldest 가 page[0] 로 재등장(앵커 inclusive) → 1건 겹침 제거.
//   ③ from 이상인 헤드라인만 멱등 저장.
//   ④ 전진: oldest 가 앵커보다 과거면 거기로 재앵커.
//      ⚠ wrap-stall(older 없음): KIS 가 한 페이지를 못 채우면 같은 날 뒤쪽으로 wrap → 어댑터 필터 후 older=0.
//        이때 앵커를 **시간만큼 강제 하강(forced step, 자정 넘으면 전날)** → 그 아래 데이터 정상 재개.
//        (강제점프 폭만큼 stall 지점 미세 누락 가능하나 드물고 무시 가능.)
//   ⑤ 종료: oldest 가 from 미만 · 강제하강이 from 미만 · 연속 강제하강 과다(보관 경계/영구 stall).
import type { DateRange, NewsHeadline } from "#domain";
import type { NewsSource, StockNewsRepository } from "#port/outbound";
import type {
    NewsBackfiller,
    NewsBackfillOptions,
    NewsBackfillResult,
} from "#port/inbound";

export interface NewsBackfillDeps {
    source: NewsSource;
    repo: StockNewsRepository;
}

/** 안전 상한 — 무한루프 방지용. 1년 풀피드도 ~5만 페이지라 넉넉히. */
const MAX_PAGES = 1_000_000;
/** wrap-stall 시 앵커를 한 번에 내릴 폭(초). 10분 — recon 상 stall 1회로 빠져나옴. */
const FORCED_STEP_SEC = 600;
/** 연속 강제하강 허용 횟수. 초과 = 그 구간에 데이터 없음(보관 경계) → 종료. 10분×30=5시간. */
const MAX_FORCED_RUN = 30;

/** 앵커(YYYY-MM-DD / HH:MM:SS)를 deltaSec 만큼 과거로. 자정 넘으면 전날. UTC 산술(라벨 계산이라 TZ무관). */
function stepBack(anchor: { date: string; time: string }, deltaSec: number): { date: string; time: string } {
    const dt = new Date(`${anchor.date}T${anchor.time}Z`);
    dt.setUTCSeconds(dt.getUTCSeconds() - deltaSec);
    const iso = dt.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export class NewsBackfillService implements NewsBackfiller {
    constructor(private readonly deps: NewsBackfillDeps) {}

    async backfill(range: DateRange, opts?: NewsBackfillOptions): Promise<NewsBackfillResult> {
        const { source, repo } = this.deps;
        let anchor: { date: string; time: string } = { date: range.to, time: "23:59:59" };
        let prevOldestSrno: string | null = null;
        let pages = 0;
        let headlines = 0;
        let forcedRun = 0;

        while (pages < MAX_PAGES) {
            let page = await source.fetchBefore(anchor);
            pages++;
            // 앵커 inclusive 로 직전 oldest 가 page[0] 로 재등장 → 겹침 1건 제거.
            if (prevOldestSrno !== null && page.length > 0 && page[0].srno === prevOldestSrno) {
                page = page.slice(1);
            }

            if (page.length > 0) {
                const inRange = page.filter((h: NewsHeadline) => h.date >= range.from);
                if (inRange.length > 0) {
                    await repo.saveHeadlines(inRange);
                    headlines += inRange.length;
                }
            }

            // 어댑터가 ≤anchor 를 보장하므로 page[last] 가 가장 과거. 앵커보다 엄격히 과거여야 "전진".
            const oldest = page.length > 0 ? page[page.length - 1] : null;
            const advanced =
                oldest !== null &&
                (oldest.date < anchor.date || (oldest.date === anchor.date && oldest.time < anchor.time));

            if (advanced) {
                opts?.onProgress?.({ pages, anchorDate: oldest!.date, headlines });
                if (oldest!.date < range.from) break; // from 경계 넘음 → 끝
                prevOldestSrno = oldest!.srno;
                anchor = { date: oldest!.date, time: oldest!.time };
                forcedRun = 0;
            } else {
                // wrap-stall/빈 페이지 → 앵커 강제 하강(그 아래 데이터로 점프).
                anchor = stepBack(anchor, FORCED_STEP_SEC);
                prevOldestSrno = null; // 합성 앵커라 겹침 srno 무의미
                forcedRun++;
                opts?.onProgress?.({ pages, anchorDate: anchor.date, headlines });
                if (anchor.date < range.from) break; // 강제하강이 from 밑으로 → 끝
                if (forcedRun > MAX_FORCED_RUN) break; // 연속 stall 과다 = 데이터 없음 → 끝
            }
        }

        return { range, pages, headlines };
    }
}
