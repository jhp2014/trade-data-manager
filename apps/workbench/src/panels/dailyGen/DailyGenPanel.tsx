// Daily 타점 생성소 — 하루 집합(조건 묶음)이 태어나는 단 하나의 자리(2026-09-24, 옛 「집합 편성」 은퇴).
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 옛 패널의 **데이터 층을 그대로** 쓴다 — 하루 장부(savedSets)·식 트리·FunnelContext·useBoundSet 보는
// 집합. 그래서 작업 대상·시트·차트 ◇ 가 자동으로 따라온다. 바뀐 건 화면뿐이다: 모드 토글·종단 입구가
// 없고, 「돌파」 생성기의 노브는 연동 격자판(「Daily 타점 조건 - 격자」)이 편집면이다.
//
// 카탈로그 자리(`filter-funnel`/`filterFunnel`)는 옛 패널의 것을 **승계**한다 — 사용자 배치가 그대로
// 새 패널이 된다. 옛 저장 배치의 탭 제목("집합 편성")은 아래 정규화가 되돌린다.
import { useEffect } from "react";
import { useDock } from "../../store/dock.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { SetRow } from "../filter/SetRow.js";
import { DailyConditionBoard } from "./DailyConditionBoard.js";
import { DailyGenHeader } from "./DailyGenHeader.js";

export function DailyGenPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const v = useFunnel();

    // 탭 제목 = 카탈로그 이름 — 옛 저장 배치에 남은 "집합 편성" 을 되돌린다(테마 [조건]판 선례).
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <DailyGenHeader v={v} panelId={panelId} />
            <SetRow />
            <div style={{ flex: 1, minHeight: 0 }}>
                <DailyConditionBoard />
            </div>
        </div>
    );
}
