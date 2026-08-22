// 집합 편성 머리글 — 왼쪽은 상태(죽은 참조), 오른쪽은 손잡이 줄.
//
// "지금 보는 집합"은 여기 없다 — 바로 아래 **집합 줄**(SetRow)이 상시라 켜진 칩이 곧 그 답이다. 옛
// 상주 칩은 집합 서랍이 접혔을 때 답을 남기려고 있었는데, 줄이 늘 서 있으니 같은 것을 두 자리에서
// 말할 이유가 없다.
//
// 여기서 사라진 것들과 이유:
//   · **후보 분모**(5,825 종목·날짜) — 전체는 집합 서랍의 "전체" 칩이 수와 함께 말하고, 걸러진 뒤의
//     수는 아래 막대 요약이 말한다. 머리글에서 셋째 숫자로 또 말할 이유가 없다.
//   · **타점으로** — 결과 목록이 사라진 뒤 남은 효과가 탤리 단위뿐이었다(stage.ts 주석).
//   · **슬롯 1·2·3** — 이름 없는 칸 3개. 그 일은 저장 집합이 이미 한다(집합 = 이름 붙은 슬롯).
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, barsOpen, onToggleBars, onlyActive, setOnlyActive }: {
    v: FunnelView;
    /** 막대(걸린 필터 목록) 서랍 — 아래에서 올라온다. 손잡이는 여기와 요약 줄 둘 다(둘 다 같은 상태). */
    barsOpen: boolean;
    onToggleBars: () => void;
    /** 보드에서 조건이 걸린 줄만 보기. */
    onlyActive: boolean;
    setOnlyActive: (on: boolean) => void;
}): JSX.Element {
    const stages = useWorkbench(selectFilterStages);
    const clearStages = useWorkbench((s) => s.clearFilterStages);

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "boardOnlyActive", name: "걸린 것만", activeColor: "var(--accent-primary)",
            help: "보드에서 조건이 걸린 줄만 보기 — 다 펼쳐 두는 게 기본이다(분포를 보고 자르는 일이라)",
            on: onlyActive, set: setOnlyActive,
        },
        {
            kind: "toggle", id: "bars", name: "막대", help: "걸린 필터 막대를 아래에서 펼친다 — 접으면 요약 한 줄만 남는다",
            on: barsOpen, set: onToggleBars,
        },
        {
            kind: "action", id: "clearStages", name: "비우기", disabled: stages.length === 0,
            help: "걸린 필터 전부 지우기 — 저장한 집합은 안 변한다(자립 사본이라)", run: clearStages,
        },
    ], [onlyActive, setOnlyActive, barsOpen, onToggleBars, stages.length, clearStages]);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>집합 편성</span>
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
