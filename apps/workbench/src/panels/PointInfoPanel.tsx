import { useMemo } from "react";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { useWorkbench } from "../store/workbench.js";
import { useChartPoints } from "../lib/useChartPoints.js";
import { useGroups } from "../lib/GroupsContext.js";
import { useStockName } from "../lib/useStockName.js";
import { GroupChips } from "../components/GroupChips.js";
import { useGroupAssign } from "../store/groupAssign.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { PointInfoRowList } from "./pointInfo/PointInfoRows.js";
import { usePointInfoPrefs } from "./pointInfo/usePointInfoPrefs.js";
import { usePointInfoRows } from "./pointInfo/usePointInfoRows.js";

// 타점 정보 패널 — **지금 보고 있는 시각의 타점 하나**를 세로로 읽는다(시트 한 행의 전치).
// 시트는 행=타점·열=축이라 축이 많으면 가로로 길어져 한 타점을 읽기 나쁘고, 배치 보드는 전 타점 편집면이다.
//
// 2026-09-13 재편(decisions.md 「타점 정보 패널」): **값을 수치로 읽는 면**이다 — 순위 표기(`n/m`)와
// 트랙 바는 사라졌고(순위는 툴팁에만) 축·결과·테마가 **한 목록**에 선다. 종류는 색점으로만 말한다.
// 정렬은 사람 손(드래그)이고 순서·숨김은 이 패널 전용 저장물이다. 값은 전부 다른 화면이 이미 당기는
// 파생이라 추가 API 요청 0(usePointInfoRows 머리 주석).
export function PointInfoPanel({ panelId }: { panelId: string }): JSX.Element {
    const { code, viewDate, time } = usePlaneBus("replay");
    const name = useStockName(code);
    const revealSheetCol = useWorkbench((s) => s.revealSheetCol);
    const [missingOpen, setMissingOpen] = usePanelUi(panelId, "unplacedOpen", false);
    const [hiddenOpen, setHiddenOpen] = usePanelUi(panelId, "hiddenOpen", false);

    // 이 시각이 타점인가 — 차트의 현재 타점 판정과 같은 소스(라벨 좌표 한 벌, useChartPoints).
    const points = useChartPoints(code, viewDate);
    const pointTime = useMemo(() => (time && points.includes(time) ? time : null), [points, time]);
    const point = useMemo(
        () => (code && pointTime ? { stockCode: code, date: viewDate, time: pointTime } : null),
        [code, viewDate, pointTime],
    );

    const { chartGroupsOf, pointGroupsOf, pathLabel } = useGroups();
    // 그룹 두 줄 — 타점(좌표 라벨)과 그 날. grain 이 달라 칩 줄을 섞지 않는다.
    const groups = useMemo(() => chartGroupsOf({ stockCode: code, date: viewDate }), [code, viewDate, chartGroupsOf]);
    const pointGroups = useMemo(
        () => (pointTime === null ? [] : pointGroupsOf({ stockCode: code, date: viewDate, time: pointTime })),
        [pointTime, code, viewDate, pointGroupsOf],
    );

    const { rows, displayT, axisKeys, allThemes, isLoading } = usePointInfoRows(point);
    const prefs = usePointInfoPrefs(rows, { axisKeys, allThemes, isLoading });

    if (!code) return <BoardCenter text="종목을 선택하세요" />;
    if (!point) return <BoardCenter text={time ? `${time.slice(0, 5)} — 타점 아님` : "시각을 선택하세요"} />;

    /** 배정 팝오버 열기 — time 유무가 입구 grain(타점/날)을 가른다. */
    const openAssign = (e: React.MouseEvent, timeArg: string | null | undefined): void =>
        useGroupAssign.getState().open(
            { stockCode: code, name: name ?? undefined, date: viewDate, time: timeArg ?? undefined },
            { x: e.clientX, y: e.clientY },
        );

    const groupRow = (label: string, chips: typeof groups, timeArg: string | null | undefined): JSX.Element => (
        <div
            onClick={(e) => openAssign(e, timeArg)}
            onContextMenu={(e) => { e.preventDefault(); openAssign(e, timeArg); }}
            title="클릭 = 그룹 배정"
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", cursor: "pointer" }}
        >
            <span style={{ flexShrink: 0, width: 22, fontSize: 10, fontWeight: 700, color: "var(--accent-primary)" }}>{label}</span>
            <GroupChips groups={chips} scroll empty="그룹 없음" pathOf={(id) => pathLabel(id, "(지워짐)")} />
        </div>
    );

    return (
        <div
            style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 12 }}
        >
            {/* 헤더 — 종목 · 시각 · 표시 T(결과 값 전부의 기준). 종목/날짜는 헤더 툴팁(좁은 셀이라 한 줄). */}
            <PanelHeader chrome={false} gap={6} padding="5px 8px"
                title={`${name ?? code} · ${viewDate}`}
                style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <span style={{ minWidth: 0, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name ?? code}</span>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)", fontWeight: 700 }}>{pointTime!.slice(0, 5)}</span>
                <span className="tabular" title="지금 보는 허용 폭 T — 결과 줄의 기준(연동 결과 조건, 없으면 탐색 T)"
                    style={{ flexShrink: 0, marginLeft: "auto", background: "var(--accent-soft)", color: "var(--accent-primary)", borderRadius: 3, padding: "0 4px", fontSize: 10, fontWeight: 700 }}>
                    T {displayT}%
                </span>
            </PanelHeader>

            {/* 그룹 카드 — 타점(좌표 라벨)·그 날 두 줄. 배경을 accent 로 올려 먼저 눈에 걸리게 한다.
                클릭/우클릭 = 배정 팝오버(시선 충돌 없는 패널이라 좌클릭 보조 입구 허용 — decisions.md 그룹 편집 출구). */}
            <div style={{ flexShrink: 0, background: "var(--bg-active)", borderBottom: "1px solid var(--border-default)", padding: "1px 0" }}>
                {groupRow("타점", pointGroups, pointTime)}
                {groupRow("날", groups, undefined)}
            </div>

            {/* 값 목록 — 패널 높이를 그대로 쓰고 넘치면 스크롤(도킹 패널이라 차트 줌과 무관). */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "4px 0" }}>
                <PointInfoRowList
                    rows={prefs.ordered}
                    hidden={prefs.hidden}
                    missingOpen={missingOpen}
                    hiddenOpen={hiddenOpen}
                    onToggleMissing={() => setMissingOpen((v) => !v)}
                    onToggleHidden={() => setHiddenOpen((v) => !v)}
                    onPick={(key) => { if (key) revealSheetCol(key); }}
                    onHide={prefs.toggleHidden}
                    onDrop={prefs.reorder}
                    onUnhideAll={prefs.unhideAll}
                />
            </div>

        </div>
    );
}
