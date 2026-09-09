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
import { useGroupAssign } from "../store/groupAssign.js";
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

    // 이 시각이 타점인가 — 차트의 현재 타점 판정과 같은 소스(자동 타점 파생 한 벌).
    const points = useChartPoints(code, viewDate);
    const pointTime = useMemo(() => (time && points.includes(time) ? time : null), [points, time]);

    const placements = usePlacements();
    const { chartGroupsOf, pointGroupNamesOf, groupByName, pathLabel } = useGroups();
    // 그룹 두 줄 — 타점(좌표 라벨, 2026-09-09 재도입)과 그 날. grain 이 달라 칩 줄을 섞지 않는다.
    const groups = useMemo(() => chartGroupsOf({ stockCode: code, date: viewDate }), [code, viewDate, chartGroupsOf]);
    const pointGroups = useMemo(
        () =>
            pointTime === null
                ? []
                : pointGroupNamesOf({ stockCode: code, date: viewDate, time: pointTime })
                      .map((n) => groupByName.get(n))
                      .filter((g): g is NonNullable<typeof g> => g != null),
        [pointTime, code, viewDate, pointGroupNamesOf, groupByName],
    );
    const detail = useMemo(
        () => (pointTime ? placements.detailOf({ stockCode: code, date: viewDate, time: pointTime }) : null),
        [pointTime, code, viewDate, placements],
    );

    if (!code) return <BoardCenter text="종목을 선택하세요" />;
    if (!pointTime || !detail) return <BoardCenter text={time ? `${time.slice(0, 5)} — 타점 아님` : "시각을 선택하세요"} />;

    /** 배정 팝오버 열기 — time 유무가 입구 grain(타점/날)을 가른다. */
    const openAssign = (e: React.MouseEvent, timeArg: string | null | undefined): void =>
        useGroupAssign.getState().open(
            { stockCode: code, name: name ?? undefined, date: viewDate, time: timeArg ?? undefined },
            { x: e.clientX, y: e.clientY },
        );

    return (
        <div
            style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 12 }}
        >
            {/* 헤더 — 종목 · 시각. 종목/날짜는 헤더 툴팁(좁은 셀이라 한 줄). */}
            <PanelHeader chrome={false} gap={6} padding="5px 8px"
                title={`${name ?? code} · ${viewDate}`}
                style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <span style={{ minWidth: 0, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name ?? code}</span>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)", fontWeight: 700 }}>{pointTime.slice(0, 5)}</span>
            </PanelHeader>

            {/* 그룹 두 줄 — 타점(좌표 라벨)·그 날. 각 줄 한 줄 고정(wrap 없이 hover 가로 스크롤).
                클릭/우클릭 = 배정 팝오버(시선 충돌 없는 패널이라 좌클릭 보조 입구 허용 — decisions.md 그룹 편집 출구). */}
            <div
                onClick={(e) => openAssign(e, pointTime)}
                onContextMenu={(e) => { e.preventDefault(); openAssign(e, pointTime); }}
                title="클릭 = 그룹 배정"
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}
            >
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>타점</span>
                <GroupChips groups={pointGroups} scroll empty="그룹 없음" pathOf={(id) => pathLabel(id, "(지워짐)")} />
            </div>
            <div
                onClick={(e) => openAssign(e, undefined)}
                onContextMenu={(e) => { e.preventDefault(); openAssign(e, undefined); }}
                title="클릭 = 그룹 배정"
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}
            >
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>날</span>
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

        </div>
    );
}
