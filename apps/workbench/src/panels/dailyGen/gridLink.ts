// 「돌파」 줄 ↔ 격자판 연동의 **읽기 판정 한 벌** — 생성소 보드(연동 칩·메뉴)·머리글(미연동 수)·집합 평가(미연동 =
// 미완성)·기본 차트 사슬 층(출처 목록)이 같은 이 술어를 쓴다(두 벌이면 보드는 미연동이라는데 차트는 연동된 줄로 그린다).
// 바인딩이 가리키는 판이 **슬롯 대장에 살아 있을 때만** 연동이다(고아 = 미연동 — 테마 보드와 같은 규칙,
// themeBindingSlice 머리 주석: 고아는 지우지 않고 읽는 시점에 해석한다).
//
// ## 값의 주인은 줄, 판은 창 (2026-09-25)
// 격자 값(밴드·zigzag·사슬 필터)은 **줄(집합) 안**에 산다 — 판을 지워도 집합의 값은 그대로다. 판은 그 값을 비추고
// 고치는 창이고, 생성소는 줄에 **판 이름**만 보인다. 미연동 줄은 값을 든 채 **계산하지 않는다**(미완성 —
// 보이는 것 = 도는 것). 다시 연결하면 그 줄의 값이 판에 뜬다.
import { parseSlotId } from "../../shell/panelSlots.js";
import type { FilterStage } from "../filter/stage.js";
import { DAILY_GRID_BASE } from "./dailyPanelIds.js";

export function liveGridPanelOf(
    bindings: Readonly<Record<string, string>>,
    slots: readonly string[],
    stageId: string,
): string | undefined {
    const pid = bindings[stageId];
    return pid !== undefined && slots.includes(pid) && parseSlotId(pid)?.base === DAILY_GRID_BASE ? pid : undefined;
}

/** 칩·차트 목록에 서는 짧은 판 이름 — 슬롯 번호만(탭 제목 「Daily 타점 조건 [격자] 2」 의 끝 번호와 같다). */
export const gridShortName = (panelId: string): string => `격자 ${parseSlotId(panelId)?.n ?? "?"}`;

export const isBreakoutStage = (s: FilterStage): boolean => s.predicates.some((p) => p.kind === "breakout");

export const UNLINKED_GRID = "격자판 미연동 — 돌파 줄은 연동된 격자판이 있어야 계산합니다(값은 줄에 남아 있습니다)";

/** 미연동 돌파 줄 = 미완성 — 평가(`toCellExpr`)에 결손 이유로 싣는다(조용히 옛 값으로 돌지 않게). */
export const gridLinkDeficiency = (bindings: Readonly<Record<string, string>>, slots: readonly string[]) =>
    (s: FilterStage): readonly string[] =>
        (isBreakoutStage(s) && liveGridPanelOf(bindings, slots, s.id) === undefined ? [UNLINKED_GRID] : []);
