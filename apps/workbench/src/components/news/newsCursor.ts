// 뉴스 피드의 **커서 전진 규칙**(순수) — 페이징이 깨지면 "더보기가 안 됨"으로만 보여 조용히 썩는
// 부류라, 패널(NewsPanel)에서 떼어 값으로 잠근다. 반환 undefined = 과거 소진(더보기 끝).

/** 복기(DB) 커서 — (date, srno) 엄격미만 페이징. */
export interface HeadlineCursorLike {
    date: string; // YYYY-MM-DD
    srno: string;
}

/** 실시간(KIS) 앵커 — (date, time) 이하 되감기. */
export interface LiveAnchorLike {
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
}

/**
 * 복기 피드의 다음 커서 — 마지막으로 받은 항목의 (date, srno).
 *  · `dayInitial`(종목+무키워드의 첫 페이지 = "그 날 전체")은 길이와 무관하게 계속 — 짧아도 과거는 남아있다.
 *  · 그 외 페이지는 limit 미만이면 소진(undefined).
 *  · 지금까지의 페이지가 전부 비었어도 `(date, "0")` 으로 과거로는 걸을 수 있다(그 날이 비었을 뿐).
 */
export function replayNextCursor(
    lastPage: readonly HeadlineCursorLike[],
    allPages: readonly (readonly HeadlineCursorLike[])[],
    opts: { date: string; dayInitial: boolean; pageSize: number },
): HeadlineCursorLike | undefined {
    if (!opts.dayInitial && lastPage.length < opts.pageSize) return undefined;
    for (let i = allPages.length - 1; i >= 0; i--) {
        const p = allPages[i];
        if (p.length > 0) {
            const oldest = p[p.length - 1];
            return { date: oldest.date, srno: oldest.srno };
        }
    }
    return { date: opts.date, srno: "0" }; // 그 날이 비었어도 과거로는 걸을 수 있다
}

/**
 * 실시간 피드의 다음 앵커 — 마지막 항목의 (date, time). 앵커가 **이하(≤) 포함**이라 한 페이지가
 * 같은 초에 몰리면 앵커가 안 움직인다 — 그때는 1초 뒤로 강제 전진(무한 루프 방지). 빈 페이지 = 소진.
 */
export function liveNextCursor(
    lastPage: readonly LiveAnchorLike[],
    lastPageParam: LiveAnchorLike | null,
): LiveAnchorLike | undefined {
    if (lastPage.length === 0) return undefined; // KIS 과거 소진
    const oldest = lastPage[lastPage.length - 1];
    const anchor = { date: oldest.date, time: oldest.time };
    if (lastPageParam && anchor.date === lastPageParam.date && anchor.time === lastPageParam.time) return secondBefore(anchor);
    return anchor;
}

/** (date,time) 앵커 1초 뒤로 — 자정을 넘으면 전날 23:59:59. */
export function secondBefore({ date, time }: LiveAnchorLike): LiveAnchorLike {
    const [h, m, s] = time.split(":").map(Number);
    const t = h * 3600 + m * 60 + s - 1;
    if (t >= 0) {
        const pad = (n: number): string => String(n).padStart(2, "0");
        return { date, time: `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` };
    }
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return { date: d.toLocaleDateString("en-CA"), time: "23:59:59" };
}
