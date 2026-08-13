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
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RankAxis } from "@trade-data-manager/wire";
import { allPointsQuery, candidateDaysQuery } from "../../api/queries.js";
import { isComputedAxis } from "../../lib/computedAxis.js";
import { pointKeyOf } from "../../lib/pointKey.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useWorkbench } from "../../store/workbench.js";
import type { GroupExpr } from "../rank/groupFilter.js";
import { useFunnel } from "./FunnelContext.js";
import type { FunnelView } from "./useFilterFunnel.js";
import { GroupExprChips, namingOf } from "./GroupExprChips.js";
import { GroupFilterEditor } from "./GroupFilterEditor.js";
import { RangeTextEditor } from "./RangeTextEditor.js";
import { ComputedAxisRail, SlotAxisRail } from "./rail/AxisRails.js";
import { RAIL_LABEL_W, RAIL_ROW_H } from "./rail/Rail.js";
import { DateRail, TimeRail } from "./rail/RangeRails.js";
import { parseDate, parseTime, shortDate } from "../../lib/date.js";
import { GRAIN_TITLE, GrainSection } from "./grain.js";
import { predicateOfKind, stagesFor, type RailKey } from "./stageBinding.js";
import type { AxisValueRange, DateRange, FilterPredicate, FilterStage, Grain, RankBand, TimeRange } from "./stage.js";
import { stageKind } from "./stage.js";

/**
 * 위 목록에서 보드로 데려오는 손짓 — 조건 이름을 누르면 그 조건이 사는 줄로.
 * `at` 은 같은 줄을 다시 눌러도 다시 강조되게 하는 손도장이다.
 */
export interface BoardReveal {
    stageId: string;
    at: number;
}

const GRAINS: Grain[] = ["day", "point"];

type BoardEditor =
    | { kind: "group"; grain: Grain; stageId?: string; x: number; y: number }
    | { kind: "date" | "time"; x: number; y: number }
    | { kind: "axisValue"; axisId: string; x: number; y: number };

export function FilterBoard({ reveal, onlyActive }: {
    reveal: BoardReveal | null;
    /** 조건이 걸린 줄만 보기 — 손잡이는 패널의 컨트롤 바에 있다(보드 안에 두면 목록의 일부로 읽힌다). */
    onlyActive: boolean;
}): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench((s) => s.filterStages);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const activePoint = useWorkbench((s) => s.activePoint);
    const gv = useGroups();

    const [editor, setEditor] = useState<BoardEditor | null>(null);
    const [draft, setDraft] = useState<GroupExpr>({ groups: [] }); // 그룹 생성 흐름의 임시 식

    // 후보 날짜·타점 시각 — 레일의 척도. 둘 다 깔때기가 이미 받아 둔 쿼리라 캐시에서 온다(왕복 없음).
    const candQ = useQuery(candidateDaysQuery());
    const pointsQ = useQuery(allPointsQuery());
    const dates = useMemo(() => [...new Set((candQ.data ?? []).map((c) => c.date))].sort(), [candQ.data]);
    const times = useMemo(() => (pointsQ.data ?? []).map((p) => p.time), [pointsQ.data]);

    const markerKey = activePoint ? pointKeyOf(activePoint.code, activePoint.date, activePoint.time) : null;

    const grainOf = useMemo(() => new Map(v.stagesOrdered.map((e) => [e.stage.id, e.grain])), [v.stagesOrdered]);

    // ── 되짚기 — 그 조건이 사는 줄로 스크롤 + 강조 ──
    const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
    const revealRowId = useMemo(() => {
        if (!reveal) return null;
        const s = stages.find((x) => x.id === reveal.stageId);
        return s ? rowIdOfStage(s) : null;
    }, [reveal, stages]);
    const [flash, setFlash] = useState<string | null>(null);
    useEffect(() => {
        if (!revealRowId) return;
        rowRefs.current.get(revealRowId)?.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlash(revealRowId);
        const t = setTimeout(() => setFlash(null), 1400);
        return () => clearTimeout(t);
    }, [revealRowId, reveal?.at]);

    const registerRow = (id: string) => (el: HTMLElement | null): void => {
        if (el) rowRefs.current.set(id, el);
        else rowRefs.current.delete(id);
    };

    // ── 조건 쓰기 — 전부 이 한 줄을 지난다(레일 하나 = 필터 하나) ──
    const write = (key: RailKey, predicate: FilterPredicate | null): void => applyRail(key, predicate);
    const stageOf = (key: RailKey): FilterStage | undefined => stagesFor(stages, key)[0];

    /** 이 줄을 그릴까 — "걸린 것만"이 켜져 있으면 조건이 있는 줄만. */
    const visible = (has: boolean): boolean => !onlyActive || has;

    const naming = useMemo(() => namingOf(gv), [gv]);

    // 그룹 생성 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다.
    // ⚠ ref 가드: Escape 한 번에 input 핸들러와 팝오버 dismiss 가 **둘 다** onClose 를 부른다 —
    // 같은 이벤트 안이라 state 는 아직 그대로여서, 가드 없이는 draft 가 두 번 커밋돼 필터가 복제된다.
    const draftCommitted = useRef(false);
    const closeGroupCreate = (): void => {
        if (!draftCommitted.current && draft.groups.length > 0) {
            draftCommitted.current = true;
            addStage([{ kind: "group", expr: draft }]);
        }
        setDraft({ groups: [] });
        setEditor(null);
    };
    const openGroupCreate = (grain: Grain, x: number, y: number): void => {
        setDraft({ groups: [] });
        draftCommitted.current = false;
        setEditor({ kind: "group", grain, x, y });
    };

    const editingStage = editor?.kind === "group" && editor.stageId ? stages.find((s) => s.id === editor.stageId) : undefined;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {/* 사전이 오기 전엔 그리지 않는다 — 빈 레일은 "축이 없다"·"날짜가 없다"고 말하는데 그건 사실이 아니다. */}
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && GRAINS.map((grain) => {
                    const groupStages = stages.filter((s) => stageKind(s) === "group" && (grainOf.get(s.id) ?? "day") === grain);
                    const axes = v.axes.axes.filter((a) => a.scope === grain);
                    const timeKey: RailKey = grain === "day" ? { kind: "date" } : { kind: "time" };
                
                    return (
                        <div key={grain}>
                            <GrainSection grain={grain} sticky>
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
                                            <button onClick={(e) => openGroupCreate(grain, e.clientX, e.clientY)}
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
                                                marker={activePoint?.date ?? null}
                                                onType={(x, y) => setEditor({ kind: "date", x, y })}
                                                onChange={(next) => write(timeKey, next ? { kind: "date", ranges: next } : null)}
                                            />
                                        ) : (
                                            <TimeRail
                                                tickTimes={times}
                                                ranges={predicateOfKind(stages, timeKey, "time")?.ranges ?? []}
                                                marker={activePoint?.time ?? null}
                                                onType={(x, y) => setEditor({ kind: "time", x, y })}
                                                onChange={(next) => write(timeKey, next ? { kind: "time", ranges: next } : null)}
                                            />
                                        )}
                                    </div>
                                )}

                                {axes.length === 0 && <Note>이 층위에 축이 없습니다</Note>}
                                {axes.map((axis) => {
                                    const key: RailKey = { kind: "axis", axisId: axis.id };
                                    const stage = stageOf(key);
                                    if (!visible(stage !== undefined)) return null;
                                    const rowId = rowIdOfKey(key);
                                    return (
                                        <div key={axis.id} ref={registerRow(rowId)} style={rowWrap(stage, flash === rowId)}>
                                            {isComputedAxis(axis.id)
                                                ? <ComputedAxisRailRow axis={axis} v={v} stages={stages} markerKey={markerKey}
                                                    onType={(x, y) => setEditor({ kind: "axisValue", axisId: axis.id, x, y })}
                                                    onChange={(ranges) => write(key, ranges ? { kind: "axisValue", axisId: axis.id, ranges } : null)} />
                                                : <SlotAxisRail axis={axis} line={v.axes.linesByAxis.get(axis.id) ?? []}
                                                    band={predicateOfKind(stages, key, "axisBand")?.band ?? {}}
                                                    markerKey={markerKey}
                                                    onChange={(band: RankBand | null) => write(key, band ? { kind: "axisBand", axisId: axis.id, band } : null)} />}
                                        </div>
                                    );
                                })}
                            </GrainSection>
                        </div>
                    );
                })}
                <div style={{ height: 8 }} />
            </div>

            {/* ── 편집기(정밀 입력·그룹 팔레트) ── */}
            {editor?.kind === "group" && (
                editor.stageId && editingStage
                    ? <GroupFilterEditor anchor={editor} scope={editor.grain}
                        expr={(editingStage.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] }}
                        onChange={(next) => {
                            // 식을 다 비우면 조건이 없어진 것 — 빈 필터를 남기지 않는다(레일에서 구간을 다 지운 것과 같다).
                            if (next.groups.length === 0) { removeStage(editor.stageId!); setEditor(null); return; }
                            setPredicates(editor.stageId!, [{ kind: "group", expr: next }]);
                        }}
                        onClose={() => setEditor(null)} />
                    : <GroupFilterEditor anchor={editor} scope={editor.grain} expr={draft} onChange={setDraft} onClose={closeGroupCreate} />
            )}

            {editor?.kind === "date" && (
                <RangeTextEditor anchor={editor} title="날짜 구간" placeholders={["26.07.01", "26.07.31"]} parse={parseDate}
                    rows={(predicateOfKind(stages, { kind: "date" }, "date")?.ranges ?? [])
                        .map((r) => ({ from: shortDate(r.from), to: shortDate(r.to) }))}
                    onCommit={(pairs) => {
                        const ranges: DateRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                        write({ kind: "date" }, ranges.length > 0 ? { kind: "date", ranges } : null);
                    }}
                    onClose={() => setEditor(null)} />
            )}

            {editor?.kind === "time" && (
                <RangeTextEditor anchor={editor} title="시간 구간" placeholders={["09:00", "10:30"]} parse={parseTime}
                    rows={(predicateOfKind(stages, { kind: "time" }, "time")?.ranges ?? [])
                        .map((r) => ({ from: r.from, to: r.to }))}
                    onCommit={(pairs) => {
                        const ranges: TimeRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                        write({ kind: "time" }, ranges.length > 0 ? { kind: "time", ranges } : null);
                    }}
                    onClose={() => setEditor(null)} />
            )}

            {editor?.kind === "axisValue" && (
                <ValueRangeEditor anchor={editor}
                    ranges={predicateOfKind(stages, { kind: "axis", axisId: editor.axisId }, "axisValue")?.ranges ?? []}
                    values={v.axes.computedValues.get(editor.axisId)}
                    onCommit={(ranges) => write({ kind: "axis", axisId: editor.axisId }, ranges ? { kind: "axisValue", axisId: editor.axisId, ranges } : null)}
                    onClose={() => setEditor(null)} />
            )}
        </div>
    );
}

// ── 조각들 ────────────────────────────────────────────────────────────────

/** 계산 축 레일 — 재료(값·표시 규격)를 꺼내 꽂는 자리. 값이 없는 축은 어댑터가 이유를 적는다. */
function ComputedAxisRailRow({ axis, v, stages, markerKey, onType, onChange }: {
    axis: RankAxis;
    v: FunnelView;
    stages: readonly FilterStage[];
    markerKey: string | null;
    onType: (x: number, y: number) => void;
    onChange: (ranges: AxisValueRange[] | null) => void;
}): JSX.Element {
    const meta = v.axes.computedMeta.get(axis.id);
    const key: RailKey = { kind: "axis", axisId: axis.id };
    return (
        <ComputedAxisRail
            axis={axis}
            values={v.axes.computedValues.get(axis.id) ?? EMPTY_VALUES}
            strongerWhen={meta?.strongerWhen ?? "higher"}
            fmtValue={meta?.fmt ?? ((n) => n.toFixed(1))}
            ranges={predicateOfKind(stages, key, "axisValue")?.ranges ?? []}
            markerKey={markerKey}
            onType={onType}
            onChange={onChange}
        />
    );
}
const EMPTY_VALUES = new Map<string, number>();

/** 계산 축 값 구간의 정밀 입력 — 비운 쪽은 끝까지(반열림). 앵커가 아니라 **수치**로 굳는다. */
function ValueRangeEditor({ anchor, ranges, values, onCommit, onClose }: {
    anchor: { x: number; y: number };
    ranges: readonly AxisValueRange[];
    values: Map<string, number> | undefined;
    onCommit: (ranges: AxisValueRange[] | null) => void;
    onClose: () => void;
}): JSX.Element {
    const text = (b: AxisValueRange["from"]): string => {
        if (!b) return "";
        return b.kind === "value" ? String(b.value) : String(values?.get(b.point) ?? "");
    };
    return (
        <RangeTextEditor
            anchor={anchor} title="값 구간" hint="비운 쪽 = 끝까지 · 앵커 대신 수치로 굳습니다"
            placeholders={["이상", "이하"]} allowOpen
            parse={(raw) => (Number.isFinite(Number(raw.trim())) && raw.trim() !== "" ? String(Number(raw.trim())) : null)}
            rows={ranges.map((r) => ({ from: text(r.from), to: text(r.to) }))}
            onCommit={(pairs) => {
                const out: AxisValueRange[] = [];
                for (const p of pairs) {
                    const from = p.from === null ? undefined : ({ kind: "value", value: Number(p.from) } as const);
                    const to = p.to === null ? undefined : ({ kind: "value", value: Number(p.to) } as const);
                    if (from || to) out.push({ from, to });
                }
                onCommit(out.length > 0 ? out : null);
            }}
            onClose={onClose}
        />
    );
}

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

const rowIdOfKey = (k: RailKey): string => (k.kind === "axis" ? `axis:${k.axisId}` : k.kind);

/** 이 필터가 보드의 어느 줄에 사는가 — 되짚기(위 목록 → 보드)의 유일한 대응표. */
function rowIdOfStage(s: FilterStage): string {
    const first = s.predicates[0];
    if (!first) return `group:${s.id}`;
    switch (first.kind) {
        case "group": return `group:${s.id}`;
        case "axisBand":
        case "axisValue": return `axis:${first.axisId}`;
        case "date": return "date";
        case "time": return "time";
    }
}
