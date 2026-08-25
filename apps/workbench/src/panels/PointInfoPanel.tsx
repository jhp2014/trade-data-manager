import { useMemo } from "react";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { useWorkbench } from "../store/workbench.js";
import { useChartPoints } from "../lib/useChartPoints.js";
import { usePlacements } from "../lib/usePlacements.js";
import { useGroups } from "../lib/GroupsContext.js";
import { useStockName } from "../lib/useStockName.js";
import { PlacementRows } from "../components/Placement.js";
import { GroupChips } from "../components/GroupChips.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader } from "../components/ControlChrome.js";

// 타점 정보 패널 — **지금 보고 있는 시각의 타점 하나**를 세로로 읽는다(시트 한 행의 전치).
// 시트는 행=타점·열=축이라 축이 많으면 가로로 길어져 한 타점을 읽기 나쁘고, 배치 보드는 전 타점 편집면이다.
// 여기는 조회 전용·좁은 셀용: 그룹 한 줄 + 꽂힌 축을 강한 순으로, 미배치는 접어서. 축 클릭 = 시트의 그 열로 링크(revealRankAxis).
// 데이터는 차트/작업셋과 같은 캐시(usePlacements) — 추가 페치 0.
export function PointInfoPanel({ panelId }: { panelId: string }): JSX.Element {
    const { code, viewDate, time } = usePlaneBus("replay");
    const name = useStockName(code);
    const revealRankAxis = useWorkbench((s) => s.revealRankAxis);
    const [unplacedOpen, setUnplacedOpen] = usePanelUi(panelId, "unplacedOpen", false);

    // 이 시각이 저장된 타점인가 — 차트의 현재 타점 판정과 같은 소스(useChartPoints 복제본 셀렉터).
    const points = useChartPoints(code, viewDate);
    const point = useMemo(() => points.find((rp) => rp.time === time) ?? null, [points, time]);

    const placements = usePlacements();
    const { groupsOf, pathLabel } = useGroups();
    const groups = useMemo(() => (point ? groupsOf({ stockCode: code, date: viewDate, time: point.time }) : []), [point, code, viewDate, groupsOf]);
    const detail = useMemo(
        () => (point ? placements.detailOf({ stockCode: code, date: viewDate, time: point.time }) : null),
        [point, code, viewDate, placements],
    );

    if (!code) return <BoardCenter text="종목을 선택하세요" />;
    if (!point || !detail) return <BoardCenter text={time ? `${time.slice(0, 5)} — 타점 아님` : "시각을 선택하세요"} />;

    return (
        <div
            style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 12 }}
        >
            {/* 헤더 — 종목 · 시각. 종목/날짜는 헤더 툴팁(좁은 셀이라 한 줄). */}
            <PanelHeader chrome={false} gap={6} padding="5px 8px"
                title={`${name ?? code} · ${viewDate}`}
                style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <span style={{ minWidth: 0, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name ?? code}</span>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)", fontWeight: 700 }}>{point.time.slice(0, 5)}</span>
            </PanelHeader>

            {/* 그룹 줄 — 축 레인 위(명목 분류가 순서 차원보다 먼저 읽힌다). 한 줄 고정: 폭이 좁아도 wrap 하지 않고
                hover 가로 스크롤로 훑는다(줄 수가 늘면 아래 축 목록이 밀린다). 편집은 차트 ▼ 우클릭에서만. */}
            <div style={{ flexShrink: 0, padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                <GroupChips groups={groups} scroll empty="그룹 없음" pathOf={(id) => pathLabel(id, "(지워짐)")} />
            </div>

            {/* 축 목록 — 패널 높이를 그대로 쓰고 넘치면 스크롤(도킹 패널이라 차트 줌과 무관). */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "4px 0" }}>
                <PlacementRows
                    placed={detail.placed}
                    unplaced={detail.unplaced}
                    unplacedOpen={unplacedOpen}
                    onToggleUnplaced={() => setUnplacedOpen((v) => !v)}
                    onPickAxis={revealRankAxis}
                />
            </div>

            {point.memo && (
                <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-subtle)", padding: "4px 8px", color: "var(--text-tertiary)", fontSize: 11, maxHeight: 64, overflowY: "auto" }}>
                    {point.memo}
                </div>
            )}
        </div>
    );
}
