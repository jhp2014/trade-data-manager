// 필터 레일 — **1차원 조건을 긋는 판**. 축·날짜·시간이 여기 다 깔린다.
//
// 왜 목록 전체를 펼쳐 두나: 조건은 "무슨 축이 있더라"를 떠올려 고르는 게 아니라 **분포를 보고 자르는**
// 일이다. 축을 드롭다운에서 하나 고른 뒤 숫자를 입력하던 옛 방식은 그 축의 분포를 이미 알고 있어야
// 했다("5% 위"가 상위 3건인지 300건인지). 레일을 다 깔아 두면 어디가 두꺼운지 보면서 자르게 된다.
// 같은 이유로 레일들은 **한 패널에 모여 있어야 한다** — 축마다 패널을 쪼개면 분포 비교도, 순서에 따른
// 한계기여도도 흩어진다(decisions.md 의 종전 기각 그대로).
//
// ⚠ **깔때기 직결 — 이 패널은 제 상태가 없다.** 레일에 컷을 그으면 그 자리에서 집합 편성 보드의 행이
// 되고(레일 하나 = 필터 하나, stageBinding), 컷을 고치는 것이 곧 그 행을 고치는 것이다. 보드와 이 패널은
// 같은 stages 저장소를 다른 렌즈로 그리는 두 화면이라 "동기화"라는 개념 자체가 없다(사본이 없으므로).
// 보드는 요약·순서·정산을, 여기는 분포·컷을 맡는다.
//
// 층위 칸이 곧 선언이다 — 하루 칸에는 하루 축·날짜가, 타점 칸에는 타점 축·시간이 산다. 한 필터는 한
// 층위여야 "하루가 먼저"라는 깔때기 순서가 성립한다(stage.ts 의 층위 규칙).
//
// 레일 순서는 **이름 열을 끌어** 바꾼다(트랙은 조건 긋기라 잡이가 못 된다). 그 순서·서랍은 이 패널의
// 로컬 저장물이다 — 시트 축 서열과 갈라져 있고, 셈은 axisOrder·axisDrawer(순수)에 있다.
import { useEffect, useMemo, useState } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { useAllPoints } from "../../lib/useAllPoints.js";
import { useCandidateDays } from "../../lib/useCandidateDays.js";
import { type AxisRef } from "../../lib/computedAxis.js";
import { chartKeyOf, pointKeyOf } from "../../lib/pointKey.js";
import { useSubject } from "../../lib/subject.js";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { usePersistedState } from "../../store/persist.js";
import { useFunnel } from "./FunnelContext.js";
import { RailEditors, type RailEditor } from "./ConditionEditors.js";
import { RAIL_REVEAL, rowIdOfKey, useBoardReveal, useRevealSignal } from "./boardReveal.js";
import { ComputedAxisRail } from "./rail/AxisRails.js";
import { DateRail, TimeRail } from "./rail/RangeRails.js";
import { GRAIN_TITLE, GrainSection, Note } from "./grain.js";
import { predicateOfKind, stagesFor, type RailKey } from "./stageBinding.js";
import { dropEdge, moveAxis, orderAxes, parseAxisOrder } from "./axisOrder.js";
import { drawerCountsOf, drawerVisible, parseDrawerIds, parseDrawerOpen, pruneDrawer, splitByDrawer } from "./axisDrawer.js";
import { FILTER } from "../../styles/palette.js";
import type { AxisValueRange, FilterPredicate, FilterStage, Grain } from "./stage.js";

const GRAINS: Grain[] = ["day", "point"];

/**
 * 레일 순서·서랍 pref — **이 패널의 로컬 저장물**. 키 이름은 보드에 살던 시절 그대로 둔다(개명 =
 * 사용자가 맞춰 둔 순서·서랍이 이유 없이 리셋). 시트 축 서열(store rankAxisOrder)·시트 숨김 열
 * (`wb.rankSheetHiddenCols`)과는 다른 주머니다 — axisOrder.ts·axisDrawer.ts 참조.
 *
 * ⚠ `usePersistedState` 는 마운트 때 한 번 읽는다 — 이 키들의 **소유 컴포넌트는 하나여야 한다**.
 * 두 화면이 같은 키를 동시에 들면 나중 저장이 앞 편집을 먹는다(그래서 이사는 복사가 아니라 이동이다).
 */
const AXIS_ORDER_KEY = "wb.filterAxisOrder";
const DRAWER_KEY = "wb.filterDrawerAxes";
const DRAWER_OPEN_KEY = "wb.filterDrawerOpen";
/**
 * 순서 드래그의 미디어타입 — 시트 열 헤더의 것(`x-rank-axis`)·필터 행 순서(`x-funnel-stage`)와
 * **일부러 다르다**. 순서 저장물이 갈린 마당에 같은 타입이면 남의 목록을 떨어뜨렸을 때 엉뚱한 순서가 바뀐다.
 */
const AXIS_DND = "application/x-filter-axis";

export function RailPanel({ panelId }: { panelId: string }): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    const ax = useRankAxes(); // 축 재료는 Provider 에서 직접 — 깔때기가 실어 나르지 않는다

    // 조건이 걸린 줄만 보기 — 손잡이는 머리글에 있다(목록 안에 두면 줄의 일부로 읽힌다).
    const [onlyActive, setOnlyActive] = usePanelUi(panelId, "railsOnlyActive", false);
    const [editor, setEditor] = useState<RailEditor | null>(null);

    // 후보 날짜·타점 시각 — 레일의 척도. 둘 다 깔때기와 같은 복제본 재료라 캐시에서 온다(왕복 없음).
    const cand = useCandidateDays();
    const pts = useAllPoints();
    const dates = useMemo(() => [...new Set(cand.candidates.map((c) => c.date))].sort(), [cand.candidates]);
    const times = useMemo(() => pts.points.map((p) => p.time), [pts.points]);

    // 마커(지금 고른 자리) — **subject 계약**을 그대로 쓴다: 타점을 골랐으면 타점, 하루만 골랐으면 그 하루.
    // 키가 곧 층위다(rowKey 규약): 타점 키는 point 축 값 맵에, 차트 키는 day 축 값 맵에 닿는다.
    // 그래서 하루 선택이 분봉 축에서 안 뜨는 건 분기가 아니라 **키 공간이 갈려서**다(조회가 miss).
    const subject = useSubject();
    const markerKey = subject === null ? null
        : subject.time !== null ? pointKeyOf(subject.code, subject.date, subject.time)
            : chartKeyOf(subject.code, subject.date);

    // 선택 집합 오버레이의 재료 — **선택 포인터가 보는 것**(viewOf(null)). 하루 항목은 뷰 계약이 이미
    // 타점으로 전개해 뒀다(∀). 아무것도 안 걸렸으면 null — 전부 멤버인 오버레이는 아무 말도 아니다.
    const selectedView = v.viewOf(null);
    // 오버레이는 **조건/집합/짚음이 걸렸을 때만** — 월 시선만으로도 isFiltering 이 켜지는데, 그때의
    // 멤버는 "그 달의 전부"라 레일에 칠하면 정보가 아니라 바탕색이다.
    const filtersOn = stages.some((st) => st.enabled !== false && st.predicates.length > 0);
    const pointerOn = useWorkbench((s) => s.selectedSetRef !== null || s.funnelSelection !== null) || filtersOn;
    const memberKeys = useMemo<ReadonlySet<string> | null>(
        () => (pointerOn && selectedView.isFiltering && !selectedView.broken
            ? new Set(selectedView.viewedPointRefs.map((p) => pointKeyOf(p.stockCode, p.date, p.time)))
            : null),
        [pointerOn, selectedView],
    );

    // ── 레일 순서 ──
    const [axisOrder, setAxisOrder] = usePersistedState<string[]>(AXIS_ORDER_KEY, parseAxisOrder, []);
    const orderedAxes = useMemo(() => orderAxes(ax.axes, axisOrder), [ax.axes, axisOrder]);
    const orderedIds = useMemo(() => orderedAxes.map((a) => a.key), [orderedAxes]);
    // 끌고 있는 축 — 표시선과 층위 검사에 쓴다. dragover 는 dataTransfer 값을 못 읽어서(브라우저 보안)
    // 미디어타입만 보이므로, **id 는 여기서** 든다.
    const [dragAxis, setDragAxis] = useState<string | null>(null);
    const scopeOf = useMemo(() => new Map(ax.axes.map((a) => [a.key, a.scope])), [ax.axes]);

    // ── 서랍 — 축을 치워 두는 자리(보기 상태, 조건은 안 건드린다). 셈은 axisDrawer(순수)에.
    const [drawerIds, setDrawerIds] = usePersistedState<string[]>(DRAWER_KEY, parseDrawerIds, []);
    const [drawerOpen, setDrawerOpen] = usePersistedState<Partial<Record<Grain, boolean>>>(DRAWER_OPEN_KEY, parseDrawerOpen, {});
    const drawerSet = useMemo(() => new Set(drawerIds), [drawerIds]);
    const toggleDrawer = (axisKey: string): void =>
        setDrawerIds((ids) => (ids.includes(axisKey) ? ids.filter((k) => k !== axisKey) : [...ids, axisKey]));
    // 죽은 축 id 청소 — **로딩 중엔 금지**(아직 안 온 축을 유령으로 오인해 지운다, 시트 열 설정과 같은 함정).
    useEffect(() => {
        if (ax.isLoading || ax.axes.length === 0) return;
        const live = ax.axes.map((a) => a.key);
        setDrawerIds((ids) => pruneDrawer(ids, live));
    }, [ax.isLoading, ax.axes, setDrawerIds]);

    /** 이 축 위에 놓을 수 있나 — **같은 층위 · 같은 편(서랍 안/밖)**. 편이 다르면 안 보이는 자리로 순서가 옮겨진다. */
    const canDropOn = (axisKey: string): boolean =>
        dragAxis !== null && dragAxis !== axisKey && scopeOf.get(dragAxis) === scopeOf.get(axisKey)
        && drawerSet.has(dragAxis) === drawerSet.has(axisKey);
    const dropAxis = (targetKey: string): void => {
        if (dragAxis === null || !canDropOn(targetKey)) return;
        const next = moveAxis(orderedIds, dragAxis, targetKey);
        if (next) setAxisOrder(next);
        setDragAxis(null);
    };

    // 되짚기 — 보드 목록에서 온 신호(패널 경계를 넘는다). 서랍에 든 줄이면 **먼저 펼친다**
    // (접힌 서랍의 줄은 DOM 에 없어 누르면 아무 일도 안 나는 상태가 된다).
    const { reveal } = useRevealSignal(RAIL_REVEAL);
    const { registerRow, flash } = useBoardReveal(reveal, stages, {
        onBeforeScroll: (rowId) => {
            const axisId = rowId.startsWith("axis:") ? rowId.slice("axis:".length) : null;
            if (axisId === null || !drawerSet.has(axisId)) return;
            const g = scopeOf.get(axisId);
            if (g) setDrawerOpen((o) => ({ ...o, [g]: true }));
        },
    });

    // ── 조건 쓰기 — 전부 이 한 줄을 지난다(레일 하나 = 필터 하나) ──
    const write = (key: RailKey, predicate: FilterPredicate | null): void => applyRail(key, predicate);

    /**
     * 조건이 걸린 축들 — **서랍 배지의 재료**. 조건 유무로 서랍 멤버십을 움직이지는 않는다(축 조건을
     * 만드는 손은 이 레일과 저장 집합 적용 둘뿐이라 자동 배출기는 죽은 코드거나 오작동이다 —
     * 서랍 안 조건을 찾아가는 길은 배지 + 되짚기다).
     */
    const conditionedAxes = useMemo(() => {
        const s = new Set<string>();
        for (const st of stages) for (const p of st.predicates) if (p.kind === "axisValue" || p.kind === "axisBand") s.add(p.axisId);
        return s;
    }, [stages]);
    const stageOf = (key: RailKey): FilterStage | undefined => stagesFor(stages, key)[0];

    /** 이 줄을 그릴까 — "걸린 것만"이 켜져 있으면 조건이 있는 줄만. */
    const visible = (has: boolean): boolean => !onlyActive || has;

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "railsOnlyActive", name: "걸린 것만", activeColor: "var(--accent-primary)",
            help: "조건이 걸린 레일만 보기 — 다 펼쳐 두는 게 기본이다(분포를 보고 자르는 일이라)",
            on: onlyActive, set: setOnlyActive,
        },
    ], [onlyActive, setOnlyActive]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>필터 레일</span>
                <span title="그은 컷은 곧바로 집합 편성의 조건이 된다 — 이 패널과 보드는 같은 조건을 다른 렌즈로 본다"
                    style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    긋는 순간 조건
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.filterRails" />
            </PanelHeader>

            {/* 가로 8px — 보드 목록과 같은 여백. 층위 칸(GrainSection)의 세로선이 두 화면에서 같은 자리에 서야 한다. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {/* 사전이 오기 전엔 그리지 않는다 — 빈 레일은 "축이 없다"·"날짜가 없다"고 말하는데 그건 사실이 아니다. */}
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && GRAINS.map((grain) => {
                    const axes = orderedAxes.filter((a) => a.scope === grain);
                    // 서랍 안/밖 — 같은 목록을 두 자리에 나눠 그린다(**한 축이 두 곳에 서면 안 된다**: 레일 하나 = 필터 하나).
                    const { outside, inside } = splitByDrawer(axes, drawerSet);
                    const counts = drawerCountsOf(inside, (k) => conditionedAxes.has(k));
                    const open = drawerOpen[grain] === true;
                    const timeKey: RailKey = grain === "day" ? { kind: "date" } : { kind: "time" };

                    /** 축 줄 하나 — 서랍 안/밖이 **같은 줄**을 쓴다(들여쓰기·바탕은 서랍 본문이 진다). */
                    const axisRow = (axis: AxisRef, inDrawer: boolean): JSX.Element | null => {
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
                                    stow={{ hidden: inDrawer, onToggle: () => toggleDrawer(axis.key) }}
                                    onType={(x, y) => setEditor({ kind: "axisValue", axisId: axis.key, x, y })}
                                    onChange={(ranges) => write(key, ranges ? { kind: "axisValue", axisId: axis.key, ranges } : null)} />
                            </div>
                        );
                    };

                    return (
                        <div key={grain}>
                            <GrainSection grain={grain} footer={drawerVisible(counts, onlyActive) ? (
                                <div style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border-subtle)" }}>
                                    <button onClick={() => setDrawerOpen((o) => ({ ...o, [grain]: !open }))}
                                        title={`${GRAIN_TITLE[grain]} 층위에서 치워 둔 축 — 조건은 서랍 안에서도 그대로 걸립니다`}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 6, width: "100%", height: DRAWER_ROW_H,
                                            padding: "0 8px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                                        }}>
                                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                            {open ? "▾" : "▸"} 서랍 {onlyActive ? counts.conditioned : counts.total}
                                        </span>
                                        {counts.conditioned > 0 && (
                                            <span title="서랍 안에서도 걸려 있는 조건 수" style={{
                                                fontSize: 10, color: FILTER, border: `1px solid ${FILTER}`, borderRadius: 8, padding: "0 6px",
                                            }}>
                                                조건 {counts.conditioned}
                                            </span>
                                        )}
                                    </button>
                                    {/* 들여쓰기·바탕은 **본문 컨테이너**가 진다 — 줄 자체는 밖과 같은 것이라야 격자가 안 갈린다. */}
                                    {open && <div style={{ paddingLeft: 10, borderLeft: "2px solid var(--border-default)", marginLeft: 6 }}>
                                        {inside.map((a) => axisRow(a, true))}
                                    </div>}
                                </div>
                            ) : undefined}>
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

                                {/* "축이 없다"는 **서랍 포함**으로 판단한다 — 전부 치운 칸에서 이 말은 거짓말이다. */}
                                {axes.length === 0 && <Note>이 층위에 축이 없습니다</Note>}
                                {outside.map((axis) => axisRow(axis, false))}
                            </GrainSection>
                        </div>
                    );
                })}
                <div style={{ height: 8 }} />
            </div>

            {/* ── 정밀 입력(팝오버) — 레일 갈래 셋만. 그룹 팔레트는 보드가 연다 ── */}
            <RailEditors editor={editor} stages={stages} write={write} onClose={() => setEditor(null)} />
        </div>
    );
}

// ── 조각들 ────────────────────────────────────────────────────────────────

/** 계산 축 레일 — 재료(값·표시 규격)를 꺼내 꽂는 자리. 값이 없는 축은 어댑터가 이유를 적는다. */
function ComputedAxisRailRow({ axis, stages, markerKey, memberKeys, dragHandle, stow, onType, onChange }: {
    axis: AxisRef;
    stages: readonly FilterStage[];
    markerKey: string | null;
    memberKeys: ReadonlySet<string> | null;
    dragHandle: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
    stow: { hidden: boolean; onToggle: () => void };
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
            stow={stow}
            onType={onType}
            onChange={onChange}
        />
    );
}
const EMPTY_VALUES = new Map<string, number>();

const rowWrap = (stage: FilterStage | undefined, flash: boolean): React.CSSProperties => ({
    opacity: stage && !stage.enabled ? 0.5 : 1,
    background: flash ? "var(--accent-soft)" : "transparent",
    transition: "background .35s ease",
});

/** 서랍 머리 줄 높이 — 레일(46)보다 낮다. 조건이 아니라 **자리 안내**라 목록의 일부처럼 커지면 안 된다. */
const DRAWER_ROW_H = 26;
