// Daily 타점 생성소 머리글 — 날짜·수·상태(어긋남·죽은 참조)와 손잡이 줄.
// 모드 토글은 없다 — 작업면은 하루로 고정이다(main.tsx 가 부팅 때 한 번 고정, decisions).
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectEditingExpr, selectEditingUniverse, useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import { leafCount, leavesOf, refsOf } from "../filter/expr.js";
import type { FunnelView } from "../filter/useFilterFunnel.js";
import { useBoundSet } from "../filter/useBoundSet.js";

export function DailyGenHeader({ v, panelId }: { v: FunnelView; panelId: string }): JSX.Element {
    const clearStages = useWorkbench((s) => s.clearFilterStages);
    const derived = useWorkbench(selectEditingUniverse);
    const date = useWorkbench((s) => s.focus.date);
    const expr = useWorkbench(selectEditingExpr);
    const exprIsEmpty = leafCount(expr) === 0 && refsOf(expr).length === 0;
    const bound = useBoundSet(panelId);
    const leaves = leavesOf(expr);
    const all = leaves.length;
    const on = leaves.filter((x) => x.enabled).length;

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "action", id: "clearStages", name: "비우기", disabled: exprIsEmpty,
            help: "걸린 조건 전부 지우기 — 저장한 다른 집합은 안 변한다", run: clearStages,
        },
    ], [exprIsEmpty, clearStages]);

    // 수 — 셀 엔진이 낸 **그날** 후보 셀 수(작업 대상 목록 행 수와 같은 단위). 모르는 동안은 "…".
    const d = bound.day;
    const count = d.unsupported !== null ? null
        : d.error !== null ? "오류"
        : d.isLoading ? "…"
        : d.tooWide ? `${d.matched.toLocaleString("ko-KR")}+ 너무 넓음`
        : d.matched.toLocaleString("ko-KR");

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-secondary)", flexShrink: 0 }}
                title="이 집합이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날)을 따라간다">
                {date}
            </span>
            {count !== null && (
                <span className="tabular" style={{ fontSize: 10.5, color: d.error ? FAIL : "var(--text-secondary)", flexShrink: 0 }}
                    title={d.error?.message ?? "그날 조건에 걸린 셀(종목·분) 수 — 작업 대상 목록의 행 수와 같다"}>
                    후보 {count}
                </span>
            )}
            {/* 조건 수 — **편집 집합의 잎**을 센다(`v.active` 는 종단 깔때기의 것이라 하루에선 늘 0). 참조 항은 수에 안 든다. */}
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                조건 {on}{all > on ? ` / ${all}` : ""}
            </span>
            {/* 열린 집합이 종단 조건을 품고 있다(옛 저장물) — 모드를 바꾸는 손은 없다(종단 보류). 사실만 말한다. */}
            {derived === "longitudinal" && (
                <span title={d.unsupported ?? "이 집합에는 종단 조건이 있어 하루에서 평가하지 않습니다"}
                    style={{ fontSize: 10.5, color: FAIL, flexShrink: 0 }}>
                    종단 집합 — 평가 안 함
                </span>
            )}
            {v.deadStageIds.length > 0 && (
                <span style={{ fontSize: 10.5, color: FAIL, flexShrink: 0 }} title="지워진 참조를 가리키는 조건이 있습니다">
                    죽은 참조 {v.deadStageIds.length}
                </span>
            )}
            <HeaderControls controls={controls} storageKey="wb.headerPins.funnel" />
        </PanelHeader>
    );
}
