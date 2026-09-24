// 「돌파」 줄 ↔ 격자판 연동의 **읽기 판정 한 벌** — 생성소 보드(연동 배지·메뉴)와 기본 차트 사슬 층(출처 고르기)이
// 같은 이 술어를 쓴다(두 벌이면 보드는 미연동이라는데 차트는 연동된 줄로 그린다).
// 바인딩이 가리키는 판이 **슬롯 대장에 살아 있을 때만** 연동이다(고아 = 미연동 — 테마 보드와 같은 규칙,
// themeBindingSlice 머리 주석: 고아는 지우지 않고 읽는 시점에 해석한다).
import { parseSlotId } from "../../shell/panelSlots.js";
import { DAILY_GRID_BASE } from "./dailyPanelIds.js";

export function liveGridPanelOf(
    bindings: Readonly<Record<string, string>>,
    slots: readonly string[],
    stageId: string,
): string | undefined {
    const pid = bindings[stageId];
    return pid !== undefined && slots.includes(pid) && parseSlotId(pid)?.base === DAILY_GRID_BASE ? pid : undefined;
}
