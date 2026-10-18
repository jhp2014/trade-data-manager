// 테마 보드 판 — 등록부 기반 새 테마판의 골격. 소속 공급원(종목에 테마 입히기)은 주 테마 판정 설계 뒤에
// 얹는다 — 지금은 빈 membership(전 종목 미분류)으로 유니버스·카드 묶기·우클릭 이력만 산다.
// 종목 줄 우클릭 = 그 종목의 움직인 날(StockHistoryPopover, /theme/stocks) — 경로 날짜를 asOf 로 넘겨
// 그날까지만 본다(사후정보 차단은 서버 몫).
import { useState } from "react";
import { usePanelPath } from "../store/paths.js";
import { StockHistoryPopover } from "../board/StockHistoryPopover.js";
import { ThemeBoardPanel, type Membership } from "./themeBoard/ThemeBoardPanel.js";

const EMPTY_MEMBERSHIP: Membership = {
    themes: new Map(),
    error: null,
    unclassified: "미분류 — 소속 없음",
    note: "소속 공급원 없음 — 등록부 기반 판정은 다음 단계",
};

export function BoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const { date } = usePanelPath(panelId).path.s;
    const [inspect, setInspect] = useState<{ code: string; x: number; y: number } | null>(null);
    return (
        <ThemeBoardPanel panelId={panelId} membership={EMPTY_MEMBERSHIP} onInspect={(code, at) => setInspect({ code, ...at })}>
            {inspect && (
                <StockHistoryPopover
                    key={`${inspect.code}@${inspect.x},${inspect.y}`}
                    code={inspect.code}
                    asOf={date || undefined}
                    at={inspect}
                    onClose={() => setInspect(null)}
                />
            )}
        </ThemeBoardPanel>
    );
}
