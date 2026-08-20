// 집합 편성 머리글 — 왼쪽은 **지금 보는 집합**(상주 칩 + 서랍 손잡이), 오른쪽은 손잡이 줄.
//
// 상주 칩이 접힘 상태에서도 서 있는 이유: 이 패널이 정한 선택 포인터를 **연동 패널 전부가** 따라간다.
// 서랍을 접었다고 그 답이 사라지면 다른 패널의 모수가 왜 그런지 설명하는 자리가 없어진다.
//
// 여기서 사라진 것들과 이유:
//   · **후보 분모**(5,825 종목·날짜) — 전체는 집합 서랍의 "전체" 칩이 수와 함께 말하고, 걸러진 뒤의
//     수는 아래 막대 요약이 말한다. 머리글에서 셋째 숫자로 또 말할 이유가 없다.
//   · **타점으로** — 결과 목록이 사라진 뒤 남은 효과가 탤리 단위뿐이었다(stage.ts 주석).
//   · **슬롯 1·2·3** — 이름 없는 칸 3개. 그 일은 저장 집합이 이미 한다(집합 = 이름 붙은 슬롯).
import { useMemo } from "react";
import { GazeChip, PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import type { SetRef } from "../../lib/setRef.js";
import { FAIL, PIN } from "../../styles/palette.js";
import { setRefLabel } from "./useSetBinding.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, setsOpen, onToggleSets, barsOpen, onToggleBars, onlyActive, setOnlyActive }: {
    v: FunnelView;
    /** 집합 칩 서랍 — 위에서 내려온다. 상주 칩이 그 손잡이다(같은 것을 두 자리에서 열지 않는다). */
    setsOpen: boolean;
    onToggleSets: () => void;
    /** 막대(걸린 필터 목록) 서랍 — 아래에서 올라온다. 손잡이는 여기와 요약 줄 둘 다(둘 다 같은 상태). */
    barsOpen: boolean;
    onToggleBars: () => void;
    /** 보드에서 조건이 걸린 줄만 보기. */
    onlyActive: boolean;
    setOnlyActive: (on: boolean) => void;
}): JSX.Element {
    const stages = useWorkbench(selectFilterStages);
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selection = useWorkbench((s) => s.funnelSelection);
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

    // 상주 칩 — 선택 포인터가 가리키는 것. 아무것도 안 골랐으면 작업 깔때기(짚은 칸이 있으면 그 칸)를
    // **채우지 않고** 말한다: 서랍에도 켜진 칩이 없는 상태와 표기가 어긋나면 안 된다.
    const workingRef: SetRef = selection
        ? { kind: "cell", stageId: selection.stageId, cells: selection.cells }
        : { kind: "survivors" };
    const shownRef = selectedSetRef ?? workingRef;
    const label = selectedSetRef !== null
        ? setRefLabel(selectedSetRef, savedSets)
        : selection ? "작업 깔때기 · 짚은 칸" : "작업 깔때기";
    const resolved = v.resolveSet(shownRef);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>집합</span>
            <GazeChip
                active={selectedSetRef !== null}
                color={PIN}
                onClick={onToggleSets}
                title={`지금 보는 집합 — 연동 패널이 전부 이걸 따라간다.\n클릭 = 집합 서랍 ${setsOpen ? "접기" : "펼치기"}`}
                label={<>
                    {label}
                    <span style={{ marginLeft: 5, opacity: 0.62, fontVariantNumeric: "tabular-nums" }}>
                        {resolved.broken ? "—" : resolved.items.length.toLocaleString("ko-KR")}
                    </span>
                    <span style={{ marginLeft: 4, opacity: 0.55 }}>{setsOpen ? "▴" : "▾"}</span>
                </>} />
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
