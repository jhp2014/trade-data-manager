// 탐색 후보 패널 — 하루·셀 우주의 첫 표면(decisions.md 「집합 = (낟알, 우주, 조건)」):
// focus.date 하루의 모든 (종목,분) 셀에 **조건 묶음**을 물려 걸린 셀을 시각순으로 세우고,
// 사람이 w/s 로 순회하며 우클릭 배정(좌표 라벨)으로 1차 수동 분류를 한다. **좌클릭=시선, 우클릭=라벨**.
//
// **후보 로직이라는 개념이 없다 — 칸 하나가 곧 로직이다.** 아래 목록의 칸은 지우면 그냥 사라지고
// (시드는 빌트인이 아니다), 편집은 조건 payload 위에서 이뤄진다. 값은 어디에도 저장되지 않고
// 조건만 패널 로컬(panelUi)에 남는다 — 후보는 진실이 아니라 입구다(진실은 라벨).
import { useEffect, useId, useMemo, useRef } from "react";
import {
    CELL_VALUE_FIELDS,
    minuteToHms,
    seedConditionsOf,
    TRANSITION_LABEL,
    DEFAULT_SEED_KNOBS,
    type CellCondition,
    type CellConditions,
    type CellPredicate,
} from "@trade-data-manager/market/domain";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { useGroupAssign } from "../../store/groupAssign.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { ROW_NAV_ORIGIN, usePublishRowNav } from "../../lib/rowNav.js";
import { RowNavBadge } from "../../components/RowNavBadge.js";
import { PanelHeader, TextToggle } from "../../components/ControlChrome.js";
import { NumField } from "../../components/NumField.js";
import { GroupChips } from "../../components/GroupChips.js";
import { BoardCenter } from "../../components/board/BoardCard.js";
import { seriesColor } from "../../styles/palette.js";
import { useProbes } from "./useProbes.js";
import { CELL_CONDITIONS_KEY, knobsFromLegacy, readCellConditions, withFloor } from "./conditions.js";

const fmtEok = (won: number | null): string => {
    if (won === null) return "—";
    const eok = won / 1e8;
    return eok >= 10_000 ? `${(eok / 10_000).toFixed(1)}조` : `${Math.round(eok).toLocaleString()}억`;
};

/** 칸 색 — 자리 순번으로 돌려쓴다(의미색 계약 없음: 종류 구분만 하면 된다). */
const condColor = (i: number): string => seriesColor(i);

/** 구간 한쪽의 값 — 편집칸이 붙는 자리(양쪽 다 있으면 from 을 쓴다). 첫 구간만 본다. */
function boundOf(p: Extract<CellPredicate, { kind: "cellValue" }>): { side: "from" | "to"; value: number } | null {
    const r = p.ranges[0];
    if (!r) return null;
    if (r.from?.kind === "value") return { side: "from", value: r.from.value };
    if (r.to?.kind === "value") return { side: "to", value: r.to.value };
    return null;
}

/**
 * 편집한 경계만 갈아 끼운다 — **나머지는 보존**한다(반대쪽 경계·두 번째 이후 OR 구간).
 * 통째로 `[{from}]` 으로 갈아치우면 파서·엔진이 이미 지원하는 양끝/다중 구간이 편집 한 번에
 * 복구 불가로 증발한다(② 에서 종단 술어와 합류하면 그런 구간이 일상이 된다).
 */
function withBound(p: Extract<CellPredicate, { kind: "cellValue" }>, side: "from" | "to", value: number): CellPredicate {
    const first = p.ranges[0] ?? {};
    const next = { ...first, [side]: { kind: "value" as const, value } };
    return { ...p, ranges: [next, ...p.ranges.slice(1)] };
}

/** 술어 한 줄의 편집칸 — payload 모양에서 자동으로 고른다(시드 전용 분기를 만들지 않는다). */
function PredicateField({ p, onChange }: { p: CellPredicate; onChange: (next: CellPredicate) => void }): JSX.Element | null {
    if (p.kind === "cellValue") {
        const b = boundOf(p);
        const meta = CELL_VALUE_FIELDS[p.field];
        if (!b) return <span style={{ color: "var(--text-tertiary)" }}>{meta.label}</span>;
        return (
            <NumField
                label={`${meta.label}${b.side === "from" ? "≥" : "≤"}`}
                suffix={meta.suffix}
                value={b.value}
                min={p.field === "zoneRank" ? 1 : undefined}
                onCommit={(v) => onChange(withBound(p, b.side, v))}
            />
        );
    }
    if (p.kind === "priorHighBreak") {
        return <NumField label="창" suffix="일" value={p.days} min={1} onCommit={(v) => onChange({ ...p, days: Math.round(v) })} />;
    }
    if (p.kind === "time") {
        return <span style={{ color: "var(--text-tertiary)" }}>{p.ranges.map((r) => `${r.from}~${r.to}`).join(", ") || "시각"}</span>;
    }
    return null; // gridPoint — 편집할 payload 가 없다
}

export function ProbePanel({ panelId }: { panelId: string }): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);
    const originId = useId();

    // ── 조건 묶음(패널 로컬 영속). **raw 참조로 memo** 한다 — panelUi 가방 전체를 의존으로 걸면
    //    노브 접기 같은 무관한 상태 변경이 전 셀 재평가를 문다.
    const rawConds = useWorkbench((s) => s.panelUi[panelId]?.[CELL_CONDITIONS_KEY]);
    const conditions = useMemo<CellConditions>(
        // 옛 노브(스칼라 9개)는 조건 키가 비어 있을 때만 읽힌다 — 1회 번역(conditions.ts 머리 주석).
        () => readCellConditions({ ...(useWorkbench.getState().panelUi[panelId] ?? {}), [CELL_CONDITIONS_KEY]: rawConds }),
        [panelId, rawConds],
    );
    const [knobsOpen, setKnobsOpen] = usePanelUi(panelId, "knobsOpen", true);
    // 하한 **일괄 손잡이** — 저장물은 칸마다 자기 하한 항을 든다(우주는 조건이 아니다).
    const [floorEok, setFloorEok] = usePanelUi(panelId, "minCumAmountEok", DEFAULT_SEED_KNOBS.minCumAmountEok);

    const setConditions = (next: CellConditions): void => useWorkbench.getState().setPanelUi(panelId, CELL_CONDITIONS_KEY, next);
    const patch = (id: string, fn: (c: CellCondition) => CellCondition): void => setConditions(conditions.map((c) => (c.id === id ? fn(c) : c)));
    const applyFloor = (eok: number): void => {
        setFloorEok(eok);
        setConditions(withFloor(conditions, floorEok, eok));
    };

    const view = useProbes(date, conditions);
    const groups = useGroups();
    const nameOfCond = useMemo(() => new Map(conditions.map((c, i) => [c.id, { name: c.name ?? c.id, color: condColor(i) }])), [conditions]);

    // ── w/s 순회 — publish 는 패널 최상단(조기 반환보다 위). 커서 = 지금 시선과 일치하는 행.
    //    엔진이 이미 상한으로 자른 배열 하나만 존재하므로 "순회와 렌더가 같은 목록"이 자동으로 성립한다.
    const navRef = usePublishRowNav("point-probe");
    navRef.current = (dir): void => {
        const hits = view.hits;
        if (hits.length === 0) return;
        const idx = focusCode && focusTime
            ? hits.findIndex((h) => h.code === focusCode && minuteToHms(h.min) === focusTime)
            : -1;
        const ni = idx < 0 ? (dir > 0 ? 0 : hits.length - 1) : Math.max(0, Math.min(hits.length - 1, idx + dir));
        const t = hits[ni];
        useWorkbench.getState().goToPoint({ date, code: t.code, time: minuteToHms(t.min) }, ROW_NAV_ORIGIN);
    };

    // 도착 행 따라가기 — 순회가 화면 밖으로 나가면 걷는 게 아니다(FlatStockList 의 block:"nearest" 전례).
    const activeRowRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }, [focusCode, focusTime]);

    // 목록이 안 그려지는 상태에선 순회도 멈춘다 — **tooWide 포함**. 안 막으면 "조건이 너무 넓습니다"
    // 화면에서 w/s 가 렌더되지 않은(게다가 그물에 걸려 앞부분만 평가된) 목록을 밟아, 목록엔 없는
    // 좌표로 시선만 혼자 움직인다("순회와 렌더가 같은 목록" 불변식의 유일한 구멍이었다).
    const bodyShown = !view.isLoading && !view.error && !view.tooWide;
    if (!bodyShown) navRef.current = () => {};

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 12.5 }}>
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <RowNavBadge owner="point-probe" />
                <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                    {date} · 조건 {view.matched.toLocaleString()}건
                </span>
                {view.truncated && !view.tooWide && (
                    <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--fall)" }} title="상한을 넘어 앞에서 잘렸다 — 조건을 조이면 전부 보인다">
                        상한 {view.limit.toLocaleString()} 초과 — 잘림
                    </span>
                )}
                {!view.themesReady && (
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} title="테마 멤버십 로딩 중 — 존순위 칸은 아직 못 센다">
                        테마 로딩중…
                    </span>
                )}
                <span style={{ flex: 1 }} />
                <TextToggle active={knobsOpen} onClick={() => setKnobsOpen((v) => !v)} title="조건 칸 목록 접기/펴기">
                    조건
                </TextToggle>
            </PanelHeader>

            {knobsOpen && (
                <div style={{ borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}>
                    {conditions.map((c, i) => {
                        const hit = view.byCondition.get(c.id) ?? 0;
                        const trans = c.transition ?? c.predicates.find((p) => p.transition)?.transition;
                        return (
                            <div key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                                <TextToggle
                                    active={c.enabled}
                                    activeColor={condColor(i)}
                                    onClick={() => patch(c.id, (x) => ({ ...x, enabled: !x.enabled }))}
                                    title="이 칸을 껐다 켜기 — 지우지 않고 빼보는 손짓"
                                >
                                    {c.name ?? c.id}
                                </TextToggle>
                                {c.predicates.map((p, pi) => (
                                    <PredicateField
                                        key={`${p.kind}-${pi}`}
                                        p={p}
                                        onChange={(next) => patch(c.id, (x) => ({ ...x, predicates: x.predicates.map((q, qi) => (qi === pi ? next : q)) }))}
                                    />
                                ))}
                                {trans && (
                                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }} title="전이 수식어 — 값이 참인 매 분이 아니라 그 순간에만 걸린다">
                                        {TRANSITION_LABEL[trans]}
                                    </span>
                                )}
                                <span style={{ flex: 1 }} />
                                <span className="tabular" style={{ fontSize: 10.5, color: c.enabled ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                                    {c.enabled ? hit.toLocaleString() : "—"}
                                </span>
                                <button
                                    onClick={() => setConditions(conditions.filter((x) => x.id !== c.id))}
                                    title="이 칸을 지운다 — 시드는 빌트인이 아니다(복원은 아래 줄)"
                                    style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "0 2px" }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 10px" }}>
                        <span title="세션 누적 대금 하한(0 = 없음) — **모든 칸**의 하한 항을 한 번에 고치는 손잡이다(저장은 칸마다)">
                            <NumField label="하한 일괄" suffix="억" value={floorEok} min={0} onCommit={(v) => applyFloor(Math.round(v))} />
                        </span>
                        <span style={{ flex: 1 }} />
                        <button
                            onClick={() => setConditions(seedConditionsOf(knobsFromLegacy(useWorkbench.getState().panelUi[panelId])))}
                            title="시드 4칸을 다시 심는다(지금 칸은 통째로 대체된다)"
                            style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}
                        >
                            시드 복원
                        </button>
                    </div>
                </div>
            )}

            {view.isLoading ? (
                <BoardCenter text={`${date} 후보 계산중…`} />
            ) : view.error ? (
                <BoardCenter text={`후보 오류: ${view.error.message}`} />
            ) : view.tooWide ? (
                <BoardCenter text={`조건이 너무 넓습니다 — ${view.matched.toLocaleString()}건 이상. 조건을 조여 주세요`} />
            ) : view.hits.length === 0 ? (
                <BoardCenter text={conditions.some((c) => c.enabled) ? "걸린 셀 없음 — 조건을 넓혀 보세요" : "조건 없음 — 칸을 켜거나 시드를 복원하세요"} />
            ) : (
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {view.hits.map((h) => {
                        const time = minuteToHms(h.min);
                        const stock = view.byCode.get(h.code);
                        const active = focusCode === h.code && focusTime === time;
                        const assigned = groups.pointGroupsOf({ stockCode: h.code, date, time });
                        return (
                            <div
                                key={`${h.code}|${h.min}`}
                                ref={active ? activeRowRef : undefined}
                                onClick={() => useWorkbench.getState().goToPoint({ date, code: h.code, time }, originId)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    useGroupAssign.getState().open(
                                        { stockCode: h.code, name: stock?.name ?? undefined, date, time },
                                        { x: e.clientX, y: e.clientY },
                                    );
                                }}
                                title="좌클릭 = 시선 이동 · 우클릭 = 그룹 배정(좌표 라벨)"
                                style={{
                                    display: "flex", alignItems: "center", gap: 8, padding: "3px 10px", cursor: "pointer",
                                    background: active ? "var(--bg-tertiary)" : "transparent",
                                    borderLeft: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
                                    borderBottom: "1px solid var(--border-subtle)",
                                }}
                            >
                                <span className="tabular" style={{ flexShrink: 0, width: 38, color: "var(--text-secondary)" }}>{time.slice(0, 5)}</span>
                                <span style={{ flexShrink: 0, width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                                    {stock?.name ?? h.code}
                                </span>
                                <span style={{ flexShrink: 0, display: "inline-flex", gap: 3 }}>
                                    {h.tags.map((t) => {
                                        const meta = nameOfCond.get(t);
                                        if (!meta) return null;
                                        return (
                                            <span key={t} style={{ fontSize: 10, fontWeight: 700, color: meta.color, border: `1px solid ${meta.color}55`, borderRadius: 3, padding: "0 3px", lineHeight: 1.5 }}>
                                                {meta.name}
                                            </span>
                                        );
                                    })}
                                </span>
                                <span className="tabular" style={{ flexShrink: 0, width: 52, textAlign: "right", color: (h.ratePct ?? 0) >= 0 ? "var(--rise)" : "var(--fall)" }}>
                                    {h.ratePct !== null ? `${h.ratePct.toFixed(1)}%` : "—"}
                                </span>
                                <span className="tabular" style={{ flexShrink: 0, width: 64, textAlign: "right", color: "var(--text-secondary)" }}>{fmtEok(h.cumAmount)}</span>
                                {h.zoneRank !== null && (
                                    <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-secondary)" }} title={h.zoneTheme ?? undefined}>
                                        {h.zoneTheme ? `${h.zoneTheme} ` : ""}{h.zoneRank}위
                                    </span>
                                )}
                                <span style={{ flex: 1 }} />
                                {assigned.length > 0 && (
                                    <GroupChips groups={assigned} pathOf={(n) => groups.pathLabel(n, n)} style={{ flexShrink: 0, maxWidth: 180 }} />
                                )}
                            </div>
                        );
                    })}
                    {view.truncated && (
                        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>
                            상위 {view.limit.toLocaleString()}건만 표시 — 조건을 조이세요 (전체 {view.matched.toLocaleString()}건)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
