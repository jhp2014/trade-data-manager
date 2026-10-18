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
    // note 는 비워 둔다 — 꼬리 카드 이름이 이미 말하고, 상시 문구를 note 자리(id "membership")에 두면
    // 사용자가 숨겼을 때 장부에 남아 다음 단계 공급원의 진짜 범위 경고까지 숨은 채 시작한다.
    note: null,
};

export function BoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const { date } = usePanelPath(panelId).path.s;
    // asOf 는 **여는 시점**의 경로 날짜로 고정한다 — 열린 뒤 경로가 비면(다른 경로로 전환 등) asOf 없는
    // 재요청(= 전체 이력)이 나가 사후정보 차단이 뚫린다. 닫고 다시 열면 그때의 날짜로 다시 고정된다.
    const [inspect, setInspect] = useState<{ code: string; x: number; y: number; asOf?: string } | null>(null);
    return (
        <ThemeBoardPanel panelId={panelId} membership={EMPTY_MEMBERSHIP} onInspect={(code, at) => setInspect({ code, ...at, asOf: date || undefined })}>
            {inspect && (
                <StockHistoryPopover
                    key={`${inspect.code}@${inspect.x},${inspect.y}`}
                    code={inspect.code}
                    asOf={inspect.asOf}
                    at={inspect}
                    onClose={() => setInspect(null)}
                />
            )}
        </ThemeBoardPanel>
    );
}
