// 집합 편성 머리글 — 왼쪽은 상태(죽은 참조), 오른쪽은 손잡이 줄.
//
// "지금 보는 집합"은 여기 없다 — 바로 아래 **집합 줄**(SetRow)이 상시라 켜진 칩이 곧 그 답이다. 옛
// 상주 칩은 집합 서랍이 접혔을 때 답을 남기려고 있었는데, 줄이 늘 서 있으니 같은 것을 두 자리에서
// 말할 이유가 없다.
//
// 여기서 사라진 것들과 이유:
//   · **타점으로** — 결과 목록이 사라진 뒤 남은 효과가 탤리 단위뿐이었다(stage.ts 주석).
//   · **슬롯 1·2·3** — 이름 없는 칸 3개. 그 일은 저장 집합이 이미 한다(집합 = 이름 붙은 슬롯).
//   · **걸린 것만** — 목록이 곧 걸린 것들이라(레일이 제 패널로 나간 뒤) 늘 켠 것과 같아졌다.
//     조건 없는 레일을 접는 그 토글은 이제 필터 레일 패널의 머리글에 산다.
//
// 반대로 **전체 → 생존**은 여기로 왔다(옛 막대 서랍의 요약 줄이 없어졌다) — 두 수는 붙어 있을 때만
// 관계가 읽힌다.
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, barsOpen, onToggleBars }: {
    v: FunnelView;
    /** 줄마다 막대(5칸)와 수치를 편다 — 목록 전체를 지배하는 토글 하나(줄마다 접는 손잡이는 없다). */
    barsOpen: boolean;
    onToggleBars: () => void;
}): JSX.Element {
    const stages = useWorkbench(selectFilterStages);
    const clearStages = useWorkbench((s) => s.clearFilterStages);

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "bars", name: "막대", help: "줄마다 5칸 막대와 '새로 죽임'을 편다 — 접으면 요약 한 줄만 남는다",
            on: barsOpen, set: onToggleBars,
        },
        {
            kind: "action", id: "clearStages", name: "비우기", disabled: stages.length === 0,
            help: "걸린 필터 전부 지우기 — 저장한 집합은 안 변한다(자립 사본이라)", run: clearStages,
        },
    ], [barsOpen, onToggleBars, stages.length, clearStages]);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>집합 편성</span>
            {/* 전체 → 생존 — 옛 막대 서랍의 요약 줄이 여기로 왔다(서랍이 없어졌다). 붙어 있어야 관계가 읽힌다. */}
            <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}
                title="후보 전체 → 걸린 필터를 다 통과한 수">
                {v.isLoading ? "…" : `${v.universe.toLocaleString("ko-KR")} → ${(v.result?.survivors.length ?? v.universe).toLocaleString("ko-KR")}`}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                필터 {v.active.length}{stages.length > v.active.length ? ` / ${stages.length}` : ""}
            </span>
            {/* 죽은 참조는 손잡이가 아니라 **상태**다 — 그래서 컨트롤 줄이 아니라 보는 집합 옆에 선다. */}
            {v.deadStageIds.length > 0 && (
                <span style={{ fontSize: 10.5, color: FAIL, flexShrink: 0 }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 필터는 판단 불가(미배치)로 잡힙니다.">
                    죽은 참조 {v.deadStageIds.length}
                </span>
            )}
            <HeaderControls controls={controls} storageKey="wb.headerPins.funnel" />
        </PanelHeader>
    );
}
