// 탐색 후보 패널 — 수동 분류 우선 워크플로(decisions.md 「구조 개편」)의 1차 표면:
// focus.date 하루의 후보(probe)를 시각순으로 세우고, 사람이 w/s 로 빠르게 순회하며
// 우클릭 배정(좌표 라벨)으로 1차 수동 분류를 한다. **좌클릭=시선, 우클릭=라벨** 채널 그대로.
//
// 후보는 진실이 아니라 입구다 — 이 목록의 어떤 값도 저장되지 않고, 노브는 패널 로컬(panelUi)이다.
// 배정된 좌표는 기존 좌표 라벨 어휘(GroupChips)로 행에 표시된다(라벨이 곧 타점).
import { useEffect, useId, useMemo, useRef } from "react";
import { DEFAULT_PROBE_PARAMS, minuteToHms, type ProbeParams, type ProbeTag } from "@trade-data-manager/market/domain";
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
import { useProbes } from "./useProbes.js";

// 태그 표기 — 색은 이 패널 로컬(의미색 계약 없음: 종류 구분만 하면 된다).
const TAG_META: Record<ProbeTag, { label: string; color: string }> = {
    grid: { label: "격자", color: "#16796f" },
    surge: { label: "급등대금", color: "#c0567e" },
    priorHigh: { label: "전고돌파", color: "#be7a00" },
    zoneRise: { label: "존순위", color: "#4a7fc1" },
};

const fmtEok = (won: number | null): string => {
    if (won === null) return "—";
    const eok = won / 1e8;
    return eok >= 10_000 ? `${(eok / 10_000).toFixed(1)}조` : `${Math.round(eok).toLocaleString()}억`;
};

/** DOM 상한 — 노브를 다 열면 하루 후보가 수천이 될 수 있다(가상화 전 임시 그물, 초과는 꼬리 안내). */
const ROW_CAP = 2000;

export function ProbePanel({ panelId }: { panelId: string }): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);
    const originId = useId();

    // ── 노브(패널 로컬 영속 — panelUi 가방, 새 전역 키 없음). 후보는 진실이 아니라 로컬로 충분하다.
    const d = DEFAULT_PROBE_PARAMS;
    const [gridOn, setGridOn] = usePanelUi(panelId, "gridOn", d.gridOn);
    const [surgeOn, setSurgeOn] = usePanelUi(panelId, "surgeOn", d.surgeOn);
    const [surgeRatePct, setSurgeRatePct] = usePanelUi(panelId, "surgeRatePct", d.surgeRatePct);
    const [surgeAmountEok, setSurgeAmountEok] = usePanelUi(panelId, "surgeAmountEok", d.surgeAmountEok);
    const [priorHighOn, setPriorHighOn] = usePanelUi(panelId, "priorHighOn", d.priorHighOn);
    const [priorHighDays, setPriorHighDays] = usePanelUi(panelId, "priorHighDays", d.priorHighDays);
    const [zoneOn, setZoneOn] = usePanelUi(panelId, "zoneOn", d.zoneOn);
    const [zoneMaxRank, setZoneMaxRank] = usePanelUi(panelId, "zoneMaxRank", d.zoneMaxRank);
    const [minCumAmountEok, setMinCumAmountEok] = usePanelUi(panelId, "minCumAmountEok", d.minCumAmountEok);
    const [knobsOpen, setKnobsOpen] = usePanelUi(panelId, "knobsOpen", true);

    // memo 신원 — 스칼라들로만 조립(usePanelUi 원시값이라 안전). useProbes 의 deps 에 통째로 실린다.
    const params = useMemo<ProbeParams>(
        () => ({ gridOn, surgeOn, surgeRatePct, surgeAmountEok, priorHighOn, priorHighDays, zoneOn, zoneMaxRank, minCumAmountEok }),
        [gridOn, surgeOn, surgeRatePct, surgeAmountEok, priorHighOn, priorHighDays, zoneOn, zoneMaxRank, minCumAmountEok],
    );

    const view = useProbes(date, params);
    const groups = useGroups();
    // 순회·렌더가 **같은 목록**을 봐야 한다 — 커서가 hits 전량을 걷고 DOM 이 cap 이면 존재하지 않는
    // 행으로 시선이 간다(리뷰 지적). cap 은 렌더 상한이자 순회 상한이다.
    const shownHits = useMemo(() => (view.hits.length > ROW_CAP ? view.hits.slice(0, ROW_CAP) : view.hits), [view.hits]);

    // ── w/s 순회 — publish 는 패널 최상단(조기 반환보다 위). 커서 = 지금 시선과 일치하는 행.
    const navRef = usePublishRowNav("point-probe");
    navRef.current = (dir): void => {
        const hits = shownHits;
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

    const bodyShown = !view.isLoading && !view.error;
    if (!bodyShown) navRef.current = () => {};

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 12.5 }}>
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <RowNavBadge owner="point-probe" />
                <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                    {date} · {view.hits.length.toLocaleString()} 후보
                </span>
                {zoneOn && !view.themesReady && (
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} title="테마 멤버십 로딩 중 — 존순위 태그는 아직 못 센다">
                        테마 로딩중…
                    </span>
                )}
                <span style={{ flex: 1 }} />
                <TextToggle active={knobsOpen} onClick={() => setKnobsOpen((v) => !v)} title="후보 로직 노브 접기/펴기">
                    노브
                </TextToggle>
            </PanelHeader>

            {knobsOpen && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}>
                    <TextToggle active={gridOn} activeColor={TAG_META.grid.color} onClick={() => setGridOn((v) => !v)} title="격자 파생 Point(기준선 있는 차트) — 현행 판정 그대로">
                        격자
                    </TextToggle>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TextToggle active={surgeOn} activeColor={TAG_META.surge.color} onClick={() => setSurgeOn((v) => !v)} title="등락률 X% 이상에서 세션 누적 대금 N억 첫 도달(하루 1회)">
                            급등대금
                        </TextToggle>
                        <NumField label="등락≥" suffix="%" value={surgeRatePct} min={0} onCommit={setSurgeRatePct} />
                        <NumField label="누적≥" suffix="억" value={surgeAmountEok} min={1} onCommit={(v) => setSurgeAmountEok(Math.round(v))} />
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TextToggle active={priorHighOn} activeColor={TAG_META.priorHigh.color} onClick={() => setPriorHighOn((v) => !v)} title="직전 W거래일 고가를 분봉 고가가 처음 넘는 자리(당일 제외, 하루 1회)">
                            전고돌파
                        </TextToggle>
                        <NumField label="창" suffix="일" value={priorHighDays} min={1} onCommit={(v) => setPriorHighDays(Math.round(v))} />
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TextToggle active={zoneOn} activeColor={TAG_META.zoneRise.color} onClick={() => setZoneOn((v) => !v)} title="테마 존 내 순위 상승 & N위 이내 — 존 정의(N·M·기준)는 테마 노브 공용 사다리. 첫 켬은 분당 단면 전량 계산이라 잠깐 걸린다">
                            존순위
                        </TextToggle>
                        <NumField label="≤" suffix="위" value={zoneMaxRank} min={1} onCommit={(v) => setZoneMaxRank(Math.round(v))} />
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="세션 누적 대금 관찰 시작선(0 = 없음) — 급등대금·전고돌파·존순위는 하한 충족 뒤로 발화가 밀리고, 격자만 좌표 고정이라 미달 좌표가 목록에서 빠진다">
                        <NumField label="하한" suffix="억" value={minCumAmountEok} min={0} onCommit={(v) => setMinCumAmountEok(Math.round(v))} />
                    </span>
                </div>
            )}

            {view.isLoading ? (
                <BoardCenter text={`${date} 후보 계산중…`} />
            ) : view.error ? (
                <BoardCenter text={`후보 오류: ${view.error.message}`} />
            ) : view.hits.length === 0 ? (
                <BoardCenter text="후보 없음 — 노브를 열거나 로직을 켜 보세요" />
            ) : (
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {shownHits.map((h) => {
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
                                    {h.tags.map((t) => (
                                        <span key={t} style={{ fontSize: 10, fontWeight: 700, color: TAG_META[t].color, border: `1px solid ${TAG_META[t].color}55`, borderRadius: 3, padding: "0 3px", lineHeight: 1.5 }}>
                                            {TAG_META[t].label}
                                        </span>
                                    ))}
                                </span>
                                <span className="tabular" style={{ flexShrink: 0, width: 52, textAlign: "right", color: (h.ratePct ?? 0) >= 0 ? "var(--rise)" : "var(--fall)" }}>
                                    {h.ratePct !== null ? `${h.ratePct.toFixed(1)}%` : "—"}
                                </span>
                                <span className="tabular" style={{ flexShrink: 0, width: 64, textAlign: "right", color: "var(--text-secondary)" }}>{fmtEok(h.cumAmount)}</span>
                                {h.zoneRank !== null && (
                                    <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: TAG_META.zoneRise.color }} title={h.zoneTheme ?? undefined}>
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
                    {view.hits.length > ROW_CAP && (
                        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>
                            상위 {ROW_CAP.toLocaleString()}건만 표시 — 하한(억)·로직 노브로 조이세요 (전체 {view.hits.length.toLocaleString()}건)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
