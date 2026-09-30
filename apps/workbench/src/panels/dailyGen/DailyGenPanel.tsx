// 일별 타점 [생성] — 하루 집합(조건 묶음)이 태어나는 단 하나의 자리(2026-09-24, 옛 「집합 편성」 은퇴).
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 옛 패널의 **데이터 층을 그대로** 쓴다 — 하루 장부(savedSets)·식 트리·FunnelContext·useBoundSet 보는
// 집합. 그래서 작업 대상·시트·차트 ◇ 가 자동으로 따라온다. 바뀐 건 화면뿐이다: 모드 토글·종단 입구가
// 없고, 「돌파」 생성기의 값은 줄의 팝오버(BreakoutCondEditor)에서 만진다.
//
// 카탈로그 자리(`filter-funnel`/`filterFunnel`)는 옛 패널의 것을 **승계**한다 — 사용자 배치가 그대로
// 새 패널이 된다. 옛 저장 배치의 탭 제목("집합 편성")은 아래 정규화가 되돌린다.
import { useEffect } from "react";
import { useDock } from "../../store/dock.js";
import { SetRow } from "../filter/SetRow.js";
import { DailyConditionBoard } from "./DailyConditionBoard.js";
import { useDailyGenHeader } from "./DailyGenHeader.js";

export function DailyGenPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    // 헤더는 선언·등록뿐 — 그리는 것은 셸(PanelFrame·탭 칩·모음 판)이다.
    useDailyGenHeader(panelId);

    // 탭 제목 = 카탈로그 이름 — 옛 저장 배치에 남은 "집합 편성" 을 되돌린다(테마 [조건]판 선례).
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <SetRow />
            <div style={{ flex: 1, minHeight: 0 }}>
                <DailyConditionBoard />
            </div>
        </div>
    );
}
