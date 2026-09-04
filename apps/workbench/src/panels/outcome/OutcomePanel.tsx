// 시그널 결과 패널 — **시그널 이후(미래)를 긋는 판**. 규칙: .claude/decisions.md "시그널 결과" 절.
//
// 필터 레일 패널의 형제다: 같은 Rail/railModel 관용구, 같은 깔때기 직결(그으면 그 자리에서 집합 편성의
// 행이 된다 — 사본·동기화 없음). 갈리는 건 경계 하나 — 저긴 시그널 봉까지(과거·특징), 여긴 그 이후
// (미래·결과)다. 결과 값은 축 피드에 없으므로 이 패널이 그 분포·조건의 유일한 자리다.
//
// 맨 위 **T 레일은 필터가 아니다** — 모수를 안 거르고 아래 레일들의 값을 바꾸는 정의 조작(pointDef 의
// T1/T2, SavedSet payload 동승)이라 색을 가른다(앰버 = LEG_HIGH, 조건 빨강 금지). T1 = 기본 허용
// (술어·레일·차트 표식의 기준), T1~T2 = Δ 관찰 구간 — 전용 컴포넌트(ToleranceRail)가 그 비대칭을 그린다.
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { OUTCOME_METRIC_NAME, type OutcomeMetric } from "../../lib/outcomeMetric.js";
import { useOutcomes } from "../../lib/PointGridsContext.js";
import { chartKeyOf, pointKeyOf } from "../../lib/pointKey.js";
import { useSubject } from "../../lib/subject.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { LEG_HIGH } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { OUTCOME_REVEAL, rowIdOfKey, useBoardReveal, useRevealConsumer } from "../filter/boardReveal.js";
import { predicateOfKind, stagesFor, type RailKey } from "../filter/stageBinding.js";
import { Note } from "../filter/grain.js";
import type { FilterStage } from "../filter/stage.js";
import { OutcomeMetricRail } from "./OutcomeRails.js";
import { ToleranceRail } from "./ToleranceRail.js";

/** 레일 방향 — 전부 "큰 값 = 오른쪽"(연장은 크게, 낙폭은 얕게가 오른쪽). 값 기준은 전부 T1(기본 허용) 단면·정확값. */
const METRIC_ROWS: readonly { metric: OutcomeMetric; hint: string }[] = [
    { metric: "extHigh", hint: "기본 허용 T1 로 이어 읽은 연장 고점(Point 봉 종가 대비 %) — 이내·무눌림은 세션 최고가라 전부 정확값입니다" },
    { metric: "dropFromHigh", hint: "보고 저가의 낙폭(직전 고점 대비 %) — 초과: T1 을 처음 넘은 눌림 · 이내: T1 이내 최대 눌림. 무눌림은 값 없음(무사건)" },
    { metric: "dropFromClose", hint: "그 저가의 Point 봉 종가 대비 % — 진입가 관점의 깊이. 무눌림은 값 없음" },
    { metric: "deltaExt", hint: "연장 고점 %(T2) − 연장 고점 %(T1) — 양수면 T1→T2 에서 눌림이 흡수돼 고점이 연장된 시그널" },
];

export function OutcomePanel(): JSX.Element {
    const outcomes = useOutcomes();
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const applyRail = useWorkbench((s) => s.applyFilterRail);

    // 마커·멤버 오버레이 — 필터 레일 패널과 같은 계약(subject 판정·viewOf). 결과 레일은 전부 타점 층위라
    // 마커 키는 타점 키만 의미가 있다(하루 선택은 값 맵 miss 로 자연히 안 선다).
    const subject = useSubject();
    const markerKey = subject === null ? null
        : subject.time !== null ? pointKeyOf(subject.code, subject.date, subject.time)
            : chartKeyOf(subject.code, subject.date);

    // 보는 집합 멤버 오버레이 — RailPanel 과 같은 규칙: 조건/집합/짚음이 걸렸을 때만(전부 멤버는 바탕색).
    const selectedView = v.viewOf(null);
    const filtersOn = stages.some((st) => st.enabled !== false && st.predicates.length > 0);
    const pointerOn = useWorkbench((s) => s.selectedSetRef !== null || s.funnelSelection !== null) || filtersOn;
    const memberKeys = useMemo<ReadonlySet<string> | null>(
        () => (pointerOn && selectedView.isFiltering && !selectedView.broken
            ? new Set(selectedView.viewedPointRefs.map((p) => pointKeyOf(p.stockCode, p.date, p.time)))
            : null),
        [pointerOn, selectedView],
    );

    // 되짚기 — 보드 목록의 결과 줄에서 온 신호(OUTCOME_REVEAL — 레일 패널과 키가 다르다: 편집면이 다르다).
    const { reveal, markHandled } = useRevealConsumer(OUTCOME_REVEAL);
    const { registerRow, flash } = useBoardReveal(reveal, stages, { onHandled: markHandled });

    // 회복/미회복 칩 = outcomeRecovery 조건의 편집 입구(명목값이라 레일이 없다). 클릭 = 조건 토글/갈아타기.
    // ⚠ 칩의 켜짐은 술어 존재가 아니라 **enabled 인 술어**다 — 보드에서 끈 조건을 켜진 것처럼 그리면,
    // "켜야지" 하고 누른 클릭이 removeStage 로 흘러 조건이 사라진다(레일 줄의 흐림 표시와 같은 규약).
    const addStage = useWorkbench((s) => s.addFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const recoveryStage = stages.find((s) => s.predicates.some((p) => p.kind === "outcomeRecovery"));
    const recoveryOn = recoveryStage?.predicates.find((p) => p.kind === "outcomeRecovery");
    const recoveryActive = (recovered: boolean): boolean =>
        recoveryStage?.enabled === true && recoveryOn?.kind === "outcomeRecovery" && recoveryOn.recovered === recovered;
    const toggleRecovery = (recovered: boolean): void => {
        if (recoveryStage === undefined) {
            addStage([{ kind: "outcomeRecovery", recovered }]);
            return;
        }
        const same = recoveryOn?.kind === "outcomeRecovery" && recoveryOn.recovered === recovered;
        if (same) {
            // 켜져 있으면 해제, 보드에서 꺼 둔 것이면 재활성(삭제가 아니라 — 끈 건 "잠깐 빼 본 것"이다).
            if (recoveryStage.enabled) removeStage(recoveryStage.id);
            else toggleStage(recoveryStage.id);
            return;
        }
        setPredicates(recoveryStage.id, [{ kind: "outcomeRecovery", recovered }]);
        if (!recoveryStage.enabled) toggleStage(recoveryStage.id);
    };

    const { counts, recovery, extendedCount, t1, t2 } = outcomes;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>시그널 결과</span>
                <span title="모수 = 시그널 전부, 기준 = 기본 허용 T1(전부 정확값). 초과 = T1 보다 깊은 눌림 발생 · 이내 = 눌림 전부 T1 이내 · 무눌림 = 2% 이상 눌림 자체가 없음(연장 고점 = 세션 최고가)"
                    style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }} className="tabular">
                    {counts.total.toLocaleString()} · 초과 {counts.exceeded.toLocaleString()}
                    {" · "}이내 {counts.contained.toLocaleString()}
                    {" · "}무눌림 {counts.none.toLocaleString()}
                </span>
                <span title={`T1→T2 (${t1}→${t2}%) 에서 연장 고점이 커진 시그널(종목 수)`} style={{ fontSize: 10, color: LEG_HIGH, flexShrink: 0 }} className="tabular">
                    연장 {extendedCount.toLocaleString()}
                </span>
                {/* 회복 = 보고 저가 이후 직전 고가 재돌파(세션 최고가 판정, 볼륨 무관). 칩 클릭 = 깔때기 조건 토글. */}
                <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }} className="tabular">
                    <button onClick={() => toggleRecovery(true)}
                        title="보고 저가 이후 직전 고가를 다시 넘은 시그널 — 클릭하면 깔때기 조건으로 걸거나 풉니다"
                        style={recoveryChip(recoveryActive(true))}>
                        회복 {recovery.recovered.toLocaleString()}
                    </button>
                    <button onClick={() => toggleRecovery(false)}
                        title="보고 저가 이후 그 고가를 못 넘고 마감한 시그널(저가 = 남은 기간 최저) — 클릭하면 깔때기 조건으로 걸거나 풉니다"
                        style={recoveryChip(recoveryActive(false))}>
                        미회복 {recovery.unrecovered.toLocaleString()}
                    </button>
                </span>
                <span title="그은 컷은 곧바로 집합 편성의 조건이 된다 — 필터 레일 패널과 같은 직결, 여긴 시그널 이후(미래) 값" style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    긋는 순간 조건
                </span>
            </PanelHeader>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {counts.total === 0 && <Note>자동 시그널이 아직 없습니다 — 격자 로딩 중이거나 정의 게이트가 전부 걸렀습니다</Note>}
                <ToleranceRail breakDepths={outcomes.breakDepths} />
                {METRIC_ROWS.map(({ metric, hint }) => {
                    const key: RailKey = { kind: "outcome", metric };
                    const stage: FilterStage | undefined = stagesFor(stages, key)[0];
                    const rowId = rowIdOfKey(key);
                    return (
                        <div key={metric} ref={registerRow(rowId)} title={hint}
                            style={{ opacity: stage && !stage.enabled ? 0.5 : 1, background: flash === rowId ? "var(--accent-soft)" : "transparent", transition: "background .35s ease" }}>
                            <OutcomeMetricRail
                                name={OUTCOME_METRIC_NAME[metric]}
                                values={outcomes.railValues.get(metric)}
                                ranges={predicateOfKind(stages, key, "outcome")?.ranges ?? []}
                                markerKey={markerKey}
                                memberKeys={memberKeys}
                                onChange={(ranges) => applyRail(key, ranges ? { kind: "outcome", metric, ranges } : null)}
                            />
                        </div>
                    );
                })}
                <div style={{ height: 8 }} />
            </div>
        </div>
    );
}

/** 회복/미회복 칩 — 걸린 상태는 조건색(FILTER 결)이 아니라 앰버 결의 채움으로(머리글은 관리소가 아니라 입구). */
const recoveryChip = (on: boolean): React.CSSProperties => ({
    fontSize: 10, padding: "0 6px", borderRadius: 8, cursor: "pointer",
    border: `1px solid ${on ? LEG_HIGH : "var(--border-default)"}`,
    color: on ? LEG_HIGH : "var(--text-secondary)",
    background: on ? "var(--warning-soft)" : "transparent",
    fontWeight: on ? 700 : 400,
});

