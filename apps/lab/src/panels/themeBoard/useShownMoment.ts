// 테마 보드가 지금 그리는 순간 — 새 날짜의 시계열을 받는 동안 보드는 직전 날 시계열을 그린다(useDayFlow placeholder).
// 그동안 경로의 종목·시각을 옛 판에 입히면 「새 종목의 테마가 옛 날 소속으로 올라온」, 있지도 않았던 판이 된다 —
// 그래서 판은 마지막으로 다 받아 그린 (종목, 시각)에 머물고, 새 날짜가 오면 한 번에 옮긴다.
// 판(ThemeBoardPanel)과 소속 시각(BoardPanel)이 같은 순간을 보게 둘 다 이 훅을 쓴다(같은 /day-flow 캐시라 판정도 같다).
import { useEffect, useRef } from "react";
import { usePanelPath } from "../../store/paths.js";
import { useDayFlow } from "../../market/queries.js";

export interface ShownMoment {
    /** 판이 입는 종목·시각 — 대기 중엔 직전 판의 것, 아니면 경로의 것. */
    code: string;
    time: string;
    /** 받는 중인 경로 상황 — 대기 중(직전 날 판을 보이는 중)일 때만, 아니면 null. */
    pending: { date: string; code: string; time: string } | null;
}

export function useShownMoment(panelId: string): ShownMoment {
    const { code, date, time } = usePanelPath(panelId).path.s;
    const q = useDayFlow(date);
    // 받는 중일 때만 — 날짜가 비면(받지 않음) placeholder 만 입고 fetching 은 없다: 그건 대기가 아니다(차트 판과 같은 판정).
    const waiting = q.isPlaceholderData && q.isFetching;
    // 다 받아 그린 마지막 (종목, 시각) — 커밋 뒤에 갱신하므로, 대기가 시작되는 렌더는 그 직전 판의 값을 읽는다.
    const lastFresh = useRef({ code, time });
    useEffect(() => {
        if (!waiting) lastFresh.current = { code, time };
    });
    if (!waiting) return { code, time, pending: null };
    return { ...lastFresh.current, pending: { date, code, time } };
}
