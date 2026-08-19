// 깔때기 머리글 — 분모(후보 수)·해상도 손잡이·슬롯. 조건 자체는 여기서 못 만진다(보드의 일).
// 저장/불러오기는 여기 없다 — 집합 목록(SetListSidebar)이 저장·열기·덮어쓰기를 전담한다(집합 공장 재편).
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import { GRAIN_UNIT } from "./grain.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, expandToPoints, setExpand, barsOpen, onToggleBars }: {
    v: FunnelView;
    expandToPoints: boolean;
    setExpand: (on: boolean) => void;
    /** 막대(걸린 필터 목록) 접기 — 접히는 건 막대뿐이라 손잡이가 머리글에 산다(목록·보드는 늘 열려 있다). */
    barsOpen: boolean;
    onToggleBars: () => void;
}): JSX.Element {
    const stages = useWorkbench(selectFilterStages);
    // 슬롯 — 이름 없는 고정 3칸. 저장 집합(이름 붙인 보관)과 역할이 다르다: 슬롯은 오늘 이 세션의
    // A/B 비교·"잠깐 이 조합만 보기" 용 작업면이다. 빈 칸으로 갈아타면 "잠시 필터 없음"이 공짜로 나온다.
    const slots = useWorkbench((s) => s.filterSlots);
    const slotIndex = useWorkbench((s) => s.filterSlotIndex);
    const setSlot = useWorkbench((s) => s.setFilterSlot);
    const clearStages = useWorkbench((s) => s.clearFilterStages);

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "expandToPoints", name: "타점으로", available: v.canExpandToPoints,
            help: "결과를 타점까지 펼친다 — 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다(반대는 롤업 규칙이 없어 막혀 있다)",
            on: expandToPoints, set: setExpand,
        },
        {
            kind: "toggle", id: "bars", name: "막대", help: "걸린 필터 막대를 펼친다 — 접으면 목록·보드가 화면을 다 쓴다",
            on: barsOpen, set: onToggleBars,
        },
        {
            // 나열인 이유는 규약 ③의 예외 두 조건에 **둘 다** 걸려서다: 순환이면 1→3 이 2를 실제로 켜
            // (필터 한 벌 교체 → 깔때기 재계산) 지나가고, 어느 칸이 찼는지는 지금 값 하나로는 못 보인다.
            kind: "segmented", id: "slots", name: "슬롯", group: "필터 한 벌",
            help: "칸마다 조건 한 벌 — 빈 칸으로 갈아타면 잠시 필터 없는 상태가 됩니다",
            values: slots.map((sl, i) => ({
                v: String(i), label: String(i + 1), filled: sl.length > 0,
                title: `슬롯 ${i + 1} — 필터 ${sl.length}개${i === slotIndex ? " (지금)" : ""}`,
            })),
            value: String(slotIndex),
            set: (x) => setSlot(Number(x)),
        },
        {
            kind: "action", id: "clearStages", name: "비우기", group: "필터 한 벌", disabled: stages.length === 0,
            help: "이 슬롯의 필터 전부 지우기(다른 슬롯은 그대로)", run: clearStages,
        },
    ], [v.canExpandToPoints, expandToPoints, setExpand, barsOpen, onToggleBars, stages.length, clearStages,
        slots, slotIndex, setSlot]);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>후보</span>
            {/* 분모는 편집에 따라 조용히 변한다(앵커 하나 지우면 그 하루가 빠진다) — 그래서 상시 표시. */}
            <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }} title="손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 편집에 따라 변한다.">
                {v.universe.toLocaleString("ko-KR")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>{GRAIN_UNIT[v.grain]}</span>
            {/* 죽은 참조는 손잡이가 아니라 **상태**다 — 그래서 컨트롤 줄이 아니라 분모 옆(왼쪽)에 선다.
                자동 여백은 HeaderControls 가 자기 안에 하나만 갖는다(둘이면 남는 폭이 갈려 컨트롤 줄이
                오른쪽 끝이 아니라 가운데쯤에 뜬다 — 실제로 그러고 있었다). */}
            {v.deadStageIds.length > 0 && (
                <span style={{ fontSize: 10.5, color: FAIL, flexShrink: 0 }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 필터는 판단 불가(미배치)로 잡힙니다.">
                    죽은 참조 {v.deadStageIds.length}
                </span>
            )}
            <HeaderControls controls={controls} storageKey="wb.headerPins.funnel" />
        </PanelHeader>
    );
}
