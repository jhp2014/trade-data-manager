// 테마 순위 **관찰판** — 축 자유(창 = 임의 분 입력, 대금/등락 각 순위|값). 연동이 원리적으로 없다:
// 판정(컷·존·✓/✗·카운트·재적 띠) 코드가 이 파일에 아예 없다 — 종류 분리가 "연동해 놓고 값 모드로
// 돌려 판정이 조용히 꺼지는" 경로를 코드 구조로 막는다(2026-09-17 판 이원화, decisions.md).
// 십자선은 항상 자유 자(회색·인스턴스 영속)다. 검색(조건화)은 조건판·편성 보드의 몫.
import { useEffect, useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { SubjectBadge } from "../../components/SubjectBadge.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { useDock } from "../../store/dock.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { subjectStatus } from "../../lib/subject.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { AxisControls } from "./AxisControls.js";
import { ThemeLensStrip } from "./ThemeLensStrip.js";
import { ThemePlaneView } from "./ThemePlaneView.js";
import { parseThemeRankAxes, windowLabel } from "./axisModel.js";
import { fmtMin, useThemePlane } from "./useThemePlane.js";

export function ThemeScopePanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();

    // 축 설정 — 인스턴스 영속(⧉ 복제 시 사본이 같이 간다). 관찰판만의 손잡이다.
    const [axesRaw, setAxesRaw] = usePanelUi<unknown>(panelId, "axes", null);
    const axes = useMemo(() => parseThemeRankAxes(axesRaw), [axesRaw]);
    const plane = useThemePlane(panelId, axes);
    const { subject, section } = plane;

    // 자 키는 모드별(창 무시 — 임의 분이라 창을 키에 넣으면 무한히 번진다. 조건판과 키 규칙이 다른 건 의도).
    const guideKeys = useMemo(() => ({ x: `x:${axes.xMode}`, y: `y:${axes.yMode}` }), [axes.xMode, axes.yMode]);

    // 탭 꼬리표 — 축 설정에서 파생("· 30분 값").
    useEffect(() => {
        if (!baseTitle) return;
        const anyValue = axes.xMode === "value" || axes.yMode === "value";
        const tail = axes.windowMin === null && !anyValue ? "" : ` · ${windowLabel(axes.windowMin)}${anyValue ? " 값" : ""}`;
        useDock.getState().api?.getPanel(panelId)?.api.setTitle(baseTitle + tail);
    }, [panelId, baseTitle, axes]);

    const axisSummary = `${windowLabel(axes.windowMin)} 대금 ${axes.xMode === "rank" ? "순위" : "값"} × 등락 ${axes.yMode === "rank" ? "순위" : "값"}`;

    return (
        <div style={wrap}>
            <PanelHeader chrome={false} gap={8} style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <HeaderPopover width={340} align="start"
                    trigger={(open, toggle) => (
                        <button onClick={toggle}
                            style={{ ...label, cursor: "pointer", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px", background: open ? "var(--bg-tertiary)" : "none" }}
                            title="이 창의 축 설정 — 인스턴스마다 따로 저장된다(⧉ 복제 시 사본이 같이 간다)">
                            축: {axisSummary} ▾
                        </button>
                    )}>
                    {() => <AxisControls axes={axes} onChange={setAxesRaw} />}
                </HeaderPopover>
                <span style={{ ...label, color: "var(--text-tertiary)" }}>관찰 — 컷·판정 없음(조건은 조건판·편성 보드)</span>
                {subject && (
                    <span style={{ ...label, color: "var(--text-tertiary)" }}>
                        {nameOf(subject.code)} · {subject.date}{plane.minute !== null && ` ${fmtMin(plane.minute)}`}
                    </span>
                )}
                {plane.anchor && (
                    <button onClick={plane.goBack} title="이 패널에서 점을 눌러 떠나기 전 종목으로 돌아간다" style={backBtn}>
                        ← {nameOf(plane.anchor.code)}
                    </button>
                )}
                <SubjectBadge subject={subject} name={subject ? nameOf(subject.code) : undefined} absentLabel="그 분 값 없음"
                    status={section
                        ? subjectStatus(
                            section.indexOf(subject?.code ?? "") !== null && plane.participants.some((p) => p.code === subject?.code),
                            plane.participants.some((p) => p.code === subject?.code),
                        )
                        : "shown"} />
            </PanelHeader>

            {/* 렌즈 칩 — 시선 도구(판정 진단은 조건판 몫이라 verdicts 없음 = 이름만). */}
            {(plane.subjectThemes.length > 0 || (subject !== null && plane.themesStatus !== "ready")) && (
                <div style={chipsRow}>
                    <ThemeLensStrip themes={plane.subjectThemes} lens={plane.lens} verdicts={null} colorOf={plane.themeColors} status={plane.themesStatus}
                        onPick={plane.setLens} />
                </div>
            )}

            <ThemePlaneView plane={plane} cut={null} guideKeys={guideKeys} segments={null} />
        </div>
    );
}

const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const label: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
const backBtn: React.CSSProperties = { fontSize: 11, color: "var(--accent-primary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--accent-primary)", borderRadius: 8, padding: "0 6px", background: "var(--accent-soft)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
const chipsRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", flexShrink: 0 };
