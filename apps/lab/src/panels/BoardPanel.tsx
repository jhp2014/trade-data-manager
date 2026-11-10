// 테마 보드 판 — 소속 공급원 = tdm-ai 장중 복기 분류 장부(/replay/day — 그날 하루의 분류, 종목별 이력은 없다).
// 보드가 보는 시각(경로 시각, 없으면 장 마감)까지 보인 이름표만 입힌다 — 장 전 이름표 · 당일 이슈 아닌 이름표는 개장 때부터(개장 전 시각에도),
// 장중 글로 붙은 이름표는 그 글 시각부터. 이름표 하나가 상위와 「상위/세부」 둘을 줘 보드 포함관계가 계층을 보인다(board/replayMembership).
// 「사후 보기」(컨트롤, 기본 끔) = 시각 무관 장 마감까지의 이름표 전부 + 종목 줄 툴팁에 그날 이유(why — 장 마감까지 보고 쓴 것이라 사후정보).
// 장부 없는 날 = 전 종목 미분류 + 알림(오류 아님). 그 밖의 실패는 소속 오류.
import { useMemo } from "react";
import { CLOSE_TIME, usePanelPath } from "../store/paths.js";
import { usePanelUi } from "../store/panelUi.js";
import { isNoLedger, useDayFlow, useReplayDay } from "../market/queries.js";
import { replayMembership } from "../board/replayMembership.js";
import { ThemeBoardPanel, type Membership } from "./themeBoard/ThemeBoardPanel.js";

const HINDSIGHT = ["off", "on"] as const;
const UNCLASSIFIED = "미분류 — 이름표 없음";

export function BoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const { date, time } = usePanelPath(panelId).path.s;
    const [hindsight, setHindsight] = usePanelUi(panelId, "hindsight", HINDSIGHT, "off");
    const after = hindsight === "on";
    // 소속은 **보드가 지금 그리는 시계열의 날짜**로 받는다 — 날짜가 바뀌는 동안 보드는 직전 날 시계열을 그리므로(placeholder),
    // 경로 날짜로 받으면 새 날 이름표가 옛 날 판에 입혀진다. 같은 /day-flow 캐시라 다시 받지 않는다. 경로 날짜 장부는 미리 받아 둔다.
    const flowDate = useDayFlow(date).data?.date ?? date;
    useReplayDay(date);
    const q = useReplayDay(flowDate);
    const shownTime = time || CLOSE_TIME;

    const membership = useMemo((): Membership => {
        const base = { unclassified: UNCLASSIFIED, error: null, note: null }; // 사후 보기 상태는 토글이 보여 준다 — 소속 알림 칸은 「아직 분류 없음」 같은 진짜 경고 몫(숨겨지면 안 된다)
        if (q.data) {
            const { themes, notes } = replayMembership(q.data, after ? null : shownTime);
            return { ...base, themes, notes };
        }
        if (q.isError && isNoLedger(q.error)) return { ...base, themes: new Map(), note: "이 날짜는 아직 분류 없음" };
        return { ...base, themes: undefined, error: q.isError ? q.error : null };
    }, [q.data, q.isError, q.error, after, shownTime]);

    return (
        <ThemeBoardPanel
            panelId={panelId}
            membership={membership}
            controls={[
                {
                    kind: "toggle", id: "hindsight", name: "사후 보기", help: "시각과 상관없이 그날 장 마감까지의 이름표 전부 + 종목 줄 툴팁에 이유 — 사후정보가 섞인다",
                    on: after, set: (on) => setHindsight(on ? "on" : "off"),
                },
            ]}
        />
    );
}
