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
import { selectEditingExpr, selectEditingUniverse, useWorkbench } from "../../store/workbench.js";
import { FAIL, POINT_DEF } from "../../styles/palette.js";
import { modeMismatch, UNIVERSE_LABEL, UNIVERSES } from "./universe.js";
import { leafCount, refsOf } from "./expr.js";
import { useDayEvalStatus } from "./useCellSet.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v }: { v: FunnelView }): JSX.Element {
    const clearStages = useWorkbench((s) => s.clearFilterStages);
    // **작업면의 모드** — 사람이 고른다(2026-09-21). 이게 팔레트를 처음부터 가른다.
    const setUniverse = useWorkbench((s) => s.filterMode);
    const setMode = useWorkbench((s) => s.setFilterMode);
    // 집합이 **실제로** 어느 우주인지(조건에서 파생) — 모드와 어긋나면 화면이 말해야 한다.
    const derived = useWorkbench(selectEditingUniverse);
    const mismatch = modeMismatch(setUniverse, derived);
    const computeNow = useWorkbench((s) => s.computeNow);
    const evalStatus = useDayEvalStatus();
    const date = useWorkbench((s) => s.focus.date);
    const expr = useWorkbench(selectEditingExpr);
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
            {/* 모드 — **사람이 고른다**(2026-09-21). 조건 팔레트가 여기서 갈리므로 "첫 조건이 말없이
                우주를 정하는" 일이 없다. 하루면 **날짜 칩**이 따라 선다(날짜는 정의가 아니라 전역 시선). */}
            <span style={{ display: "flex", gap: 2, flexShrink: 0 }} role="group" aria-label="작업 모드">
                {UNIVERSES.map((u) => (
                    <button key={u} onClick={() => setMode(u)} title={u === "daily"
                        ? "하루 — 그날 전 (종목,분) 셀이 모수다. 계산이 비싸 「계산」을 눌러야 돈다."
                        : "종단 — 라벨 좌표 전부가 모수다(전 기간). 재료가 이미 구워져 있어 자동으로 따라온다."}
                        style={{
                            font: "inherit", fontSize: 10, padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                            border: "1px solid transparent",
                            background: setUniverse === u ? POINT_DEF : "transparent",
                            color: setUniverse === u ? "#fff" : "var(--text-tertiary)",
                        }}>{UNIVERSE_LABEL[u]}</button>
                ))}
            </span>
            {setUniverse === "daily" && (
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-secondary)", flexShrink: 0 }}
                    title="이 집합이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날)을 따라간다">
                    {date}
                </span>
            )}
            {/* 전체 → 생존 — 옛 막대 서랍의 요약 줄이 여기로 왔다(서랍이 없어졌다). 붙어 있어야 관계가 읽힌다.
                ⚠ **하루 우주에서는 이 수를 안 쓴다.** 저 정산은 종단 기계의 것이고, 셀 술어는 거기서
                전부 결손이라 하루 집합이면 **언제나 0** 이 나온다("조건에 다 걸렸다"로 읽히는 거짓말).
                하루의 수는 셀 엔진이 내므로 그 자리(작업 대상 패널)에 있고, 여기서는 그 사실을 말한다. */}
            {setUniverse === "daily" ? (
                // 하루는 **손으로 시작한다** — 그날 270종목 × ~390분을 되짚는 일이라 자동으로 돌면
                // 조건을 만지는 내내 그 값을 문다(2026-09-21 사용자 확정). 수 자체는 작업 대상 패널이 말한다.
                <>
                    <button onClick={computeNow} style={{
                        font: "inherit", fontSize: 10.5, padding: "1px 9px", borderRadius: 3, cursor: "pointer",
                        border: `1px solid ${evalStatus.stale ? "var(--warning)" : "var(--border-default)"}`,
                        background: "var(--bg-secondary)",
                        color: evalStatus.stale ? "var(--warning)" : "var(--text-secondary)", flexShrink: 0,
                    }} title={evalStatus.computed
                        ? "지금 조건으로 다시 셉니다 — 화면의 수는 계산을 누른 순간의 것입니다."
                        : "아직 한 번도 안 셌습니다 — 누르면 그날 재료를 받아 셉니다(하루 ~15MB)."}>
                        계산{evalStatus.stale ? " · 낡음" : ""}
                    </button>
                    {!evalStatus.computed && (
                        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}
                            title="빈 화면이 '조건에 다 걸렸다'는 뜻이 아닙니다 — 아직 세지 않았습니다.">
                            아직 계산 안 함
                        </span>
                    )}
                </>
            ) : (
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title="후보 전체 → 걸린 필터를 다 통과한 수">
                    {v.isLoading ? "…" : `${v.universe.toLocaleString("ko-KR")} → ${(v.result?.survivors.length ?? v.universe).toLocaleString("ko-KR")}`}
                </span>
            )}
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                필터 {v.active.length}{v.stagesOrdered.length > v.active.length ? ` / ${v.stagesOrdered.length}` : ""}
            </span>
            {/* 모드와 집합이 어긋났다 — 팔레트가 갈려 있어 드문 상태지만, 조용히 두면 "하루라고 적힌
                머리글 아래 종단 결과"가 선다. 눌러서 그 집합의 우주로 건너간다. */}
            {mismatch !== null && derived !== null && (
                <button onClick={() => setMode(derived)} title={mismatch}
                    style={{
                        font: "inherit", fontSize: 10.5, padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                        border: `1px solid ${FAIL}`, background: "transparent", color: FAIL, flexShrink: 0,
                    }}>
                    {UNIVERSE_LABEL[derived]} 집합입니다 — 모드 바꾸기
                </button>
            )}
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
