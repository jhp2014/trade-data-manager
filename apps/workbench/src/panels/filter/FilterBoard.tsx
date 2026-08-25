// 필터 보드 — **조건을 거는 판**. 종류가 무엇이든 여기 한 곳에서 걸고 푼다.
//
// 왜 목록 전체를 펼쳐 두나: 조건은 "무슨 축이 있더라"를 떠올려 고르는 게 아니라 **분포를 보고 자르는**
// 일이다. 축을 드롭다운에서 하나 고른 뒤 숫자를 입력하던 옛 방식은 그 축의 분포를 이미 알고 있어야
// 했다("5% 위"가 상위 3건인지 300건인지). 레일을 다 깔아 두면 어디가 두꺼운지 보면서 자르게 된다.
//
// 층위 칸이 곧 선언이다 — 하루 칸에는 하루 축·날짜가, 타점 칸에는 타점 축·시간이 산다. 한 필터는 한
// 층위여야 "하루가 먼저"라는 깔때기 순서가 성립한다(stage.ts 의 층위 규칙).
//
// **레일 하나 = 필터 하나**(stageBinding). 그어서 만들고 지워서 없앤다 — "추가" 버튼이 없는 이유다.
// 그룹만 리스트인 이유도 거기 있다: 축은 존재 자체가 자리를 정하지만 그룹은 그런 고정 자리가 없고,
// 게다가 그룹 조건은 여러 필터로 나누는 게 의미가 있다(각각의 한계 기여도가 따로 나온다).
//
// 레일 순서는 **이름 열을 끌어** 바꾼다(트랙은 조건 긋기라 잡이가 못 된다). 그 순서는 이 보드만의
// 로컬 저장물이다 — 시트 축 서열과 갈라져 있고, 셈은 axisOrder(순수)에 있다.
//
// 팝오버 편집기 4갈래는 BoardEditors, 그룹 생성 draft 는 useGroupCreateFlow, 되짚기는 boardReveal 에 —
// 여기는 **레일 격자**(층위 칸·줄 배치)만 남는다.
import { useMemo, useState } from "react";
import { useAllPoints } from "../../lib/useAllPoints.js";
import { useCandidateDays } from "../../lib/useCandidateDays.js";
import { type AxisRef } from "../../lib/computedAxis.js";
import { chartKeyOf, pointKeyOf } from "../../lib/pointKey.js";
import { useSubject } from "../../lib/subject.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { usePersistedState } from "../../store/persist.js";
import { useFunnel } from "./FunnelContext.js";
import { BoardEditors, type BoardEditor } from "./BoardEditors.js";
import { rowIdOfKey, rowIdOfStage, useBoardReveal, type BoardReveal } from "./boardReveal.js";
import { GroupExprChips, namingOf } from "./GroupExprChips.js";
import { useGroupCreateFlow } from "./useGroupCreateFlow.js";
import { ComputedAxisRail } from "./rail/AxisRails.js";
import { RAIL_LABEL_W, RAIL_ROW_H } from "./rail/Rail.js";
import { DateRail, TimeRail } from "./rail/RangeRails.js";
import { GRAIN_TITLE, GrainSection } from "./grain.js";
import { predicateOfKind, stagesFor, type RailKey } from "./stageBinding.js";
import { dropEdge, moveAxis, orderAxes, parseAxisOrder } from "./axisOrder.js";
import type { AxisValueRange, FilterPredicate, FilterStage, Grain } from "./stage.js";
import { stageKind } from "./stage.js";

const GRAINS: Grain[] = ["day", "point"];

/** 레일 순서 pref(로컬 전용). 시트 축 서열(store rankAxisOrder)과 **다른 저장물**이다 — axisOrder.ts 참조. */
const AXIS_ORDER_KEY = "wb.filterAxisOrder";
/**
 * 순서 드래그의 미디어타입 — 시트 열 헤더의 것(`x-rank-axis`)과 **일부러 다르다**. 순서 저장물이
 * 둘로 갈린 마당에 같은 타입이면 시트 열을 보드에 떨어뜨렸을 때 엉뚱한 순서가 바뀐다.
 */
const AXIS_DND = "application/x-filter-axis";

export function FilterBoard({ reveal, onlyActive }: {
    reveal: BoardReveal | null;
    /** 조건이 걸린 줄만 보기 — 손잡이는 패널의 컨트롤 바에 있다(보드 안에 두면 목록의 일부로 읽힌다). */
    onlyActive: boolean;
}): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const gv = useGroups();
    const ax = useRankAxes(); // 축 재료는 Provider 에서 직접 — 깔때기가 실어 나르지 않는다

    const [editor, setEditor] = useState<BoardEditor | null>(null);
    // 그룹 생성 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다(이중 커밋 가드 포함).
    const groupCreate = useGroupCreateFlow(addStage, setEditor);

    // 후보 날짜·타점 시각 — 레일의 척도. 둘 다 깔때기와 같은 복제본 재료라 캐시에서 온다(왕복 없음).
    const cand = useCandidateDays();
    const pts = useAllPoints();
    const dates = useMemo(() => [...new Set(cand.candidates.map((c) => c.date))].sort(), [cand.candidates]);
    const times = useMemo(() => pts.points.map((p) => p.time), [pts.points]);

    // 마커(지금 고른 자리) — **subject 계약**을 그대로 쓴다: 타점을 골랐으면 타점, 하루만 골랐으면 그 하루.
    // 옛날엔 activePoint 만 봐서, 하루 선택(goToDay 가 activePoint 를 명시적으로 푼다)이면 하루 층위
    // 레일까지 통째로 마커가 사라졌다 — 날짜도 일봉 축 값도 있는데 안 보였다.
    // 키가 곧 층위다(rowKey 규약): 타점 키는 point 축 값 맵에, 차트 키는 day 축 값 맵에 닿는다.
    // 그래서 하루 선택이 분봉 축에서 안 뜨는 건 분기가 아니라 **키 공간이 갈려서**다(조회가 miss).
    const subject = useSubject();
    const markerKey = subject === null ? null
        : subject.time !== null ? pointKeyOf(subject.code, subject.date, subject.time)
            : chartKeyOf(subject.code, subject.date);

    // 선택 집합 오버레이의 재료 — **선택 포인터가 보는 것**(viewOf(null): 목록에서 고른 집합, 없으면
    // 작업 깔때기 시선). 하루 항목은 뷰 계약이 이미 타점으로 전개해 뒀다(∀ — 하루 조건은 전 타점에
    // 같은 값). 아무것도 안 걸렸으면 null — 전부 멤버인 오버레이는 아무 말도 아니다.
    const selectedView = v.viewOf(null);
    // 오버레이는 **조건/집합/짚음이 걸렸을 때만** — 월 시선만으로도 isFiltering 이 켜지는데(전 패널 공통
    // 접기), 그때의 멤버는 "그 달의 전부"라 레일에 칠하면 정보가 아니라 바탕색이다.
    const filtersOn = stages.some((st) => st.enabled !== false && st.predicates.length > 0);
    const pointerOn = useWorkbench((s) => s.selectedSetRef !== null || s.funnelSelection !== null) || filtersOn;
    const memberKeys = useMemo<ReadonlySet<string> | null>(
        () => (pointerOn && selectedView.isFiltering && !selectedView.broken
            ? new Set(selectedView.viewedPointRefs.map((p) => pointKeyOf(p.stockCode, p.date, p.time)))
            : null),
        [pointerOn, selectedView],
    );

    const grainOf = useMemo(() => new Map(v.stagesOrdered.map((e) => [e.stage.id, e.grain])), [v.stagesOrdered]);

    // ── 레일 순서 — **이 보드만의 것**(시트 축 서열과 별개 저장물, 사용자 확정). 조건이 아니라 보기
    // 순서라 store 슬라이스가 아니라 패널 로컬 영속으로 둔다(usePersistedState — 패널 설정의 관례).
    const [axisOrder, setAxisOrder] = usePersistedState<string[]>(AXIS_ORDER_KEY, parseAxisOrder, []);
    const orderedAxes = useMemo(() => orderAxes(ax.axes, axisOrder), [ax.axes, axisOrder]);
    const orderedIds = useMemo(() => orderedAxes.map((a) => a.key), [orderedAxes]);
    // 끌고 있는 축 — 표시선과 층위 검사에 쓴다. dragover 는 dataTransfer 값을 못 읽어서(브라우저 보안)
    // 미디어타입만 보이므로, **id 는 여기서** 든다.
    const [dragAxis, setDragAxis] = useState<string | null>(null);
    const scopeOf = useMemo(() => new Map(ax.axes.map((a) => [a.key, a.scope])), [ax.axes]);
    /** 이 축 위에 놓을 수 있나 — **같은 층위**여야 한다. 축의 scope 는 서버 정의라 드래그가 바꿀 값이 아니다. */
    const canDropOn = (axisKey: string): boolean =>
        dragAxis !== null && dragAxis !== axisKey && scopeOf.get(dragAxis) === scopeOf.get(axisKey);
    const dropAxis = (targetKey: string): void => {
        if (dragAxis === null || !canDropOn(targetKey)) return;
        const next = moveAxis(orderedIds, dragAxis, targetKey);
        if (next) setAxisOrder(next);
        setDragAxis(null);
    };

    // 되짚기 — 그 조건이 사는 줄로 스크롤 + 강조(boardReveal).
    const { registerRow, flash } = useBoardReveal(reveal, stages);

    // ── 조건 쓰기 — 전부 이 한 줄을 지난다(레일 하나 = 필터 하나) ──
    const write = (key: RailKey, predicate: FilterPredicate | null): void => applyRail(key, predicate);
    const stageOf = (key: RailKey): FilterStage | undefined => stagesFor(stages, key)[0];

    /** 이 줄을 그릴까 — "걸린 것만"이 켜져 있으면 조건이 있는 줄만. */
    const visible = (has: boolean): boolean => !onlyActive || has;

    const naming = useMemo(() => namingOf(gv), [gv]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            {/* 가로 8px — 위 필터 막대 목록과 같은 여백. 층위 칸(GrainSection)의 세로선이 두 화면에서 같은 자리에 서야 한다. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {/* 사전이 오기 전엔 그리지 않는다 — 빈 레일은 "축이 없다"·"날짜가 없다"고 말하는데 그건 사실이 아니다. */}
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && GRAINS.map((grain) => {
                    const groupStages = stages.filter((s) => stageKind(s) === "group" && (grainOf.get(s.id) ?? "day") === grain);
                    const axes = orderedAxes.filter((a) => a.scope === grain);
                    const timeKey: RailKey = grain === "day" ? { kind: "date" } : { kind: "time" };

                    return (
                        <div key={grain}>
                            <GrainSection grain={grain}>
                                {/* 그룹 — 유일하게 리스트인 조건(순서가 없어 레일이 안 된다). 그래도 **레일과 같은 행 격자**에
                                    둔다: 이름 열이 축 이름들과 세로로 맞아야 "축·날짜와 나란한 또 하나의 조건 종류"로 읽힌다. */}
                                {visible(groupStages.length > 0) && (
                                    <>
                                        {groupStages.map((s, i) => {
                                            const expr = (s.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] };
                                            const rowId = rowIdOfStage(s);
                                            return (
                                                <BoardRow key={s.id} innerRef={registerRow(rowId)} label={i === 0 ? "그룹" : ""}
                                                    flash={flash === rowId} dimmed={!s.enabled}>
                                                    <button onClick={(e) => setEditor({ kind: "group", grain, stageId: s.id, x: e.clientX, y: e.clientY })}
                                                        title="눌러서 이 그룹 조건 고치기 · 끄기·지우기는 위 목록에서"
                                                        style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                                                        <GroupExprChips expr={expr} naming={naming} empty="조건 없음" />
                                                    </button>
                                                </BoardRow>
                                            );
                                        })}
                                        <BoardRow label={groupStages.length === 0 ? "그룹" : ""}>
                                            <button onClick={(e) => groupCreate.open(grain, e.clientX, e.clientY)}
                                                title={`${GRAIN_TITLE[grain]} 층위 그룹 조건 추가 — 여러 개로 나누면 각각의 기여도가 보입니다`}
                                                style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                                                + 그룹 조건
                                            </button>
                                        </BoardRow>
                                    </>
                                )}

                                {/* 날짜(하루) · 시간(타점) — 이것도 축이라 같은 레일이다. */}
                                {visible(stageOf(timeKey) !== undefined) && (
                                    <div ref={registerRow(timeKey.kind)} style={rowWrap(stageOf(timeKey), flash === timeKey.kind)}>
                                        {grain === "day" ? (
                                            <DateRail
                                                dates={dates}
                                                ranges={predicateOfKind(stages, timeKey, "date")?.ranges ?? []}
                                                marker={subject?.date ?? null}
                                                onType={(x, y) => setEditor({ kind: "date", x, y })}
                                                onChange={(next) => write(timeKey, next ? { kind: "date", ranges: next } : null)}
                                            />
                                        ) : (
                                            <TimeRail
                                                tickTimes={times}
                                                ranges={predicateOfKind(stages, timeKey, "time")?.ranges ?? []}
                                                marker={subject?.time ?? null}
                                                onType={(x, y) => setEditor({ kind: "time", x, y })}
                                                onChange={(next) => write(timeKey, next ? { kind: "time", ranges: next } : null)}
                                            />
                                        )}
                                    </div>
                                )}

                                {axes.length === 0 && <Note>이 층위에 축이 없습니다</Note>}
                                {axes.map((axis) => {
                                    const key: RailKey = { kind: "axis", axisId: axis.key };
                                    const stage = stageOf(key);
                                    if (!visible(stage !== undefined)) return null;
                                    const rowId = rowIdOfKey(key);
                                    // 드롭은 **줄 전체**가 받는다(잡이보다 과녁이 넓어야 손이 편하다). 트랙과 안 부딪힌다 —
                                    // HTML5 드래그 중에는 pointer 이벤트가 안 간다.
                                    const edge = canDropOn(axis.key) ? dropEdge(orderedIds, dragAxis!, axis.key) : null;
                                    return (
                                        <div key={axis.key} ref={registerRow(rowId)}
                                            onDragOver={(e) => { if (canDropOn(axis.key) && e.dataTransfer.types.includes(AXIS_DND)) e.preventDefault(); }}
                                            onDrop={(e) => { e.preventDefault(); dropAxis(axis.key); }}
                                            style={{ ...rowWrap(stage, flash === rowId), ...(edge ? { boxShadow: `inset 0 ${edge === "before" ? "2px" : "-2px"} 0 var(--accent-primary)` } : {}) }}>
                                            <ComputedAxisRailRow axis={axis} stages={stages} markerKey={markerKey} memberKeys={memberKeys}
                                                dragHandle={{
                                                    onDragStart: (e) => { e.dataTransfer.setData(AXIS_DND, axis.key); e.dataTransfer.effectAllowed = "move"; setDragAxis(axis.key); },
                                                    onDragEnd: () => setDragAxis(null),
                                                }}
                                                onType={(x, y) => setEditor({ kind: "axisValue", axisId: axis.key, x, y })}
                                                onChange={(ranges) => write(key, ranges ? { kind: "axisValue", axisId: axis.key, ranges } : null)} />
                                        </div>
                                    );
                                })}
                            </GrainSection>
                        </div>
                    );
                })}
                <div style={{ height: 8 }} />
            </div>

            {/* ── 편집기(정밀 입력·그룹 팔레트) — 4갈래 배선은 BoardEditors ── */}
            <BoardEditors editor={editor} stages={stages}
                draft={groupCreate.draft} onDraftChange={groupCreate.setDraft} onCloseCreate={groupCreate.close}
                write={write} removeStage={removeStage} setPredicates={setPredicates}
                onClose={() => setEditor(null)} />
        </div>
    );
}

// ── 조각들 ────────────────────────────────────────────────────────────────

/** 계산 축 레일 — 재료(값·표시 규격)를 꺼내 꽂는 자리. 값이 없는 축은 어댑터가 이유를 적는다. */
function ComputedAxisRailRow({ axis, stages, markerKey, memberKeys, dragHandle, onType, onChange }: {
    axis: AxisRef;
    stages: readonly FilterStage[];
    markerKey: string | null;
    memberKeys: ReadonlySet<string> | null;
    dragHandle: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
    onType: (x: number, y: number) => void;
    onChange: (ranges: AxisValueRange[] | null) => void;
}): JSX.Element {
    // 축은 Provider 에서 직접 — 부모가 넘겨주지 않는다(어차피 같은 한 벌이라 넘길 이유가 없다).
    const ax = useRankAxes();
    const meta = ax.computedMeta.get(axis.key);
    const key: RailKey = { kind: "axis", axisId: axis.key };
    return (
        <ComputedAxisRail
            axis={axis}
            values={ax.computedValues.get(axis.key) ?? EMPTY_VALUES}
            strongerWhen={meta?.strongerWhen ?? "higher"}
            fmtValue={meta?.fmt ?? ((n) => n.toFixed(1))}
            ranges={predicateOfKind(stages, key, "axisValue")?.ranges ?? []}
            markerKey={markerKey}
            memberKeys={memberKeys}
            dragHandle={dragHandle}
            onType={onType}
            onChange={onChange}
        />
    );
}
const EMPTY_VALUES = new Map<string, number>();

/**
 * 레일이 아닌 줄(그룹·추가 버튼)을 **레일과 같은 격자**에 앉히는 껍데기 — 이름 열 폭·행 높이·구분선이
 * 같아야 목록 하나로 읽힌다. 이게 없을 때 그룹 영역이 조건 목록이 아니라 여백처럼 보였다.
 */
function BoardRow({ label, innerRef, flash = false, dimmed = false, children }: {
    label: string;
    innerRef?: (el: HTMLElement | null) => void;
    flash?: boolean;
    dimmed?: boolean;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <div ref={innerRef} style={{
            display: "flex", alignItems: "center", height: RAIL_ROW_H, borderBottom: "1px solid var(--border-subtle)",
            background: flash ? "var(--accent-soft)" : "transparent", opacity: dimmed ? 0.5 : 1, transition: "background .35s ease",
        }}>
            <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                {label}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", paddingRight: 8 }}>{children}</div>
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: "4px 10px 8px", fontSize: 10.5, color: "var(--text-tertiary)" }}>{children}</div>;
}

const rowWrap = (stage: FilterStage | undefined, flash: boolean): React.CSSProperties => ({
    opacity: stage && !stage.enabled ? 0.5 : 1,
    background: flash ? "var(--accent-soft)" : "transparent",
    transition: "background .35s ease",
});
