// 집합 편성 머리글 — 왼쪽은 상태(죽은 참조), 오른쪽은 손잡이 줄.
//
// "지금 보는 집합"은 여기 없다 — 바로 아래 **집합 줄**(SetRow)이 상시라 켜진 칩이 곧 그 답이다. 옛
// 상주 칩은 집합 서랍이 접혔을 때 답을 남기려고 있었는데, 줄이 늘 서 있으니 같은 것을 두 자리에서
// 말할 이유가 없다.
//
// 여기서 사라진 것들과 이유:
//   · **타점으로** — 결과 목록이 사라진 뒤 남은 효과가 탤리 단위뿐이었다(stage.ts 주석).
//   · **슬롯 1·2·3** — 이름 없는 칸 3개. 그 일은 저장 집합이 이미 한다(집합 = 이름 붙은 슬롯).
//   · **걸린 것만** — 목록이 곧 걸린 것들이라 늘 켠 것과 같아졌다.
//
//   · **막대** — 5칸 진단이 은퇴하면서(2026-09-19) 펼 것이 없어졌다.
//
// 반대로 **전체 → 생존**은 여기로 왔다(옛 막대 서랍의 요약 줄이 없어졌다) — 두 수는 붙어 있을 때만
// 관계가 읽힌다.
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { selectFilterExpr, selectFilterUniverse, useWorkbench } from "../../store/workbench.js";
import { FAIL, POINT_DEF } from "../../styles/palette.js";
import { effectiveUniverse, UNIVERSE_LABEL } from "./universe.js";
import { leafCount, refsOf } from "./expr.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v }: { v: FunnelView }): JSX.Element {
    const clearStages = useWorkbench((s) => s.clearFilterStages);
    // 편집 대상의 **타입**(우주) — 전역 모드 스위치가 아니라 "지금 만지는 집합이 무엇인가"의 표시다.
    // 바꾸는 손은 집합 줄의 `＋ 새 집합 ▾` 하나뿐(decisions 「집합」).
    // 우주는 **파생**이다(2026-09-19 9단계) — null = 아직 안 정해짐(중립 조건뿐이거나 조건 0개).
    const derived = useWorkbench(selectFilterUniverse);
    const setUniverse = effectiveUniverse(derived);
    const date = useWorkbench((s) => s.focus.date);
    const expr = useWorkbench(selectFilterExpr);
    const exprIsEmpty = leafCount(expr) === 0 && refsOf(expr).length === 0;

    const controls = useMemo<ControlSpec[]>(() => [
        {
            // ⚠ 참조도 "걸린 것"이다 — 잎 수로만 재면 `OR(참조…)` 집합을 연 화면에서 비우기가
            //   막혀 참조를 지울 손이 없다(ConditionBoard 의 같은 게이트와 한 규칙).
            kind: "action", id: "clearStages", name: "비우기", disabled: exprIsEmpty,
            help: "걸린 필터 전부 지우기 — 저장한 집합은 안 변한다(자립 사본이라)", run: clearStages,
        },
    ], [exprIsEmpty, clearStages]);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>집합 편성</span>
            {/* 우주 뱃지 — 이 패널이 무엇을 편집 중인지 말하는 한 자리. 하루면 **날짜 칩**이 따라 선다
                (날짜는 정의가 아니라 변수라 전역 시선의 거울이다 — 불변식 ③). */}
            <span style={{
                fontSize: 10, flexShrink: 0, borderRadius: 8, padding: "0 6px",
                color: setUniverse === "daily" ? "var(--accent-primary)" : "var(--text-secondary)",
                border: `1px solid ${setUniverse === "daily" ? POINT_DEF : "var(--border-default)"}`,
            }} title={derived === null
                ? "아직 우주가 안 정해졌습니다 — 한쪽에만 사는 조건(등락률·격자 Point 등 하루 재료, 축값·결과 등 종단 재료)을 처음 걸면 그때 정해집니다. 그 전엔 종단으로 평가합니다."
                : setUniverse === "daily"
                    ? "하루·셀 우주 — 그날 전 (종목,분) 셀이 모수다. 날짜는 정의가 아니라 전역 시선이 주는 변수. **조건이 정한 것이지 고른 것이 아니다.**"
                    : "종단 · 좌표 우주 — 라벨 좌표 전부가 모수다(전 기간). **조건이 정한 것이지 고른 것이 아니다.**"}>
                {derived === null ? "우주 · 미정" : UNIVERSE_LABEL[setUniverse]}
            </span>
            {setUniverse === "daily" && (
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-secondary)", flexShrink: 0 }}
                    title="이 집합이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날)을 따라간다">
                    {date}
                </span>
            )}
            {/* 전체 → 생존 — 옛 막대 서랍의 요약 줄이 여기로 왔다(서랍이 없어졌다). 붙어 있어야 관계가 읽힌다. */}
            <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}
                title="후보 전체 → 걸린 필터를 다 통과한 수">
                {v.isLoading ? "…" : `${v.universe.toLocaleString("ko-KR")} → ${(v.result?.survivors.length ?? v.universe).toLocaleString("ko-KR")}`}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                필터 {v.active.length}{v.stagesOrdered.length > v.active.length ? ` / ${v.stagesOrdered.length}` : ""}
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
