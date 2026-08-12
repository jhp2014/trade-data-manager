// 필터 깔때기 패널 — 조건의 **목록과 집계**. (이 슬라이스는 읽기 전용: 조건 편집은 다음 차례.)
//
// ⚠ **막대 길이가 전부 같다.** 이게 이 화면의 핵심 결정이다. 순차 깔때기처럼 단계마다 짧아지게 그리면
// 그림이 "앞에서 걸러낸 뒤 남은 것만 평가한다"고 말하는데, 모델은 그 반대다(각 단계가 같은 유니버스를
// 독립 평가). 길이를 고정하면 그 사실이 눈에 박히고, **좁혀지는 느낌은 생존 칸이 줄어드는 것으로** 나온다.
//
// 색은 다섯인데 규칙은 셋이다: 생존(강조) · 근접 탈락(주목 — 배울 게 제일 많은 칸) · 나머지.
// **미배치 두 칸은 같은 회색 계열**이다 — 상류 보류와 이번 미배치는 위치가 다를 뿐 똑같이 "아직 안 한 것"이라,
// 색이 갈리면 "안 맞았다"와 헷갈린다.
//
// 한계 기여도(새로 죽임)가 0 에 가까운 단계는 행 전체를 흐리게 — 겉보기 탈락이 아무리 커도 그건 장식이다.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunnelCell, FunnelItem, StageTally } from "@trade-data-manager/market/domain";
import { stocksMetaQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";
import { TextToggle } from "../components/ControlChrome.js";
import { useFilterFunnel, type FunnelView } from "./filter/useFilterFunnel.js";
import { kindLabel, stageLabel } from "./filter/label.js";
import { stageKind, type FilterStage } from "./filter/stage.js";
import { FAIL, GROUP_PLAIN, HOVER, IGNORED_CANDLE, STRONG } from "../styles/palette.js";

const CELLS: { cell: FunnelCell; label: string; color: string; hint: string }[] = [
    { cell: "survive", label: "생존", color: STRONG, hint: "이번 통과 + 상류 전부 통과" },
    { cell: "nearMiss", label: "근접 탈락", color: HOVER, hint: "이번은 통과인데 앞 단계에서 죽음 — 앞이 과했는지는 여기서만 알 수 있다" },
    { cell: "upstreamPending", label: "상류 보류", color: GROUP_PLAIN, hint: "이번 통과 + 상류에 미배치(탈락은 없음) — 배치하면 생존이 될 수도" },
    { cell: "fail", label: "이번 탈락", color: FAIL, hint: "이 단계가 떨궜다" },
    { cell: "pending", label: "이번 미배치", color: IGNORED_CANDLE, hint: "이 단계로는 판단할 재료가 없다(안 맞은 게 아니다)" },
];

const MAX_ROWS = 200; // 목록은 훑어보는 용도 — 전부 그리면 스크롤만 길어진다

export function FilterFunnelPanel(): JSX.Element {
    const v = useFilterFunnel();
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);
    const setExpand = useWorkbench((s) => s.setFilterExpandToPoints);
    const [picked, setPicked] = useState<{ stageIndex: number; cell: FunnelCell } | null>(null);

    const pickedItems = useMemo<FunnelItem[]>(() => {
        if (!picked || !v.result) return [];
        return v.result.stages[picked.stageIndex]?.cells[picked.cell] ?? [];
    }, [picked, v.result]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <Header v={v} expandToPoints={expandToPoints} setExpand={setExpand} />

            <div style={{ flex: "0 0 auto", maxHeight: "55%", overflowY: "auto", padding: "6px 10px" }}>
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && v.active.length === 0 && (
                    <Note>단계가 없습니다. 조건을 걸면 단계마다 유니버스 {v.universe}건이 다섯 칸으로 갈립니다.</Note>
                )}
                {!v.isLoading && v.result && v.active.map((s, i) => (
                    <StageRow
                        key={s.id}
                        index={i}
                        stage={s}
                        tally={v.result!.stages[i]!}
                        universe={v.universe}
                        label={stageLabel(s, v.labelLook)}
                        dead={v.deadStageIds.includes(s.id)}
                        picked={picked?.stageIndex === i ? picked.cell : null}
                        onPick={(cell) => setPicked((p) => (p?.stageIndex === i && p.cell === cell ? null : { stageIndex: i, cell }))}
                    />
                ))}
            </div>

            <Legend />

            <ResultList v={v} picked={picked} items={pickedItems} />
        </div>
    );
}

function Header({ v, expandToPoints, setExpand }: { v: FunnelView; expandToPoints: boolean; setExpand: (on: boolean) => void }): JSX.Element {
    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>후보</span>
            {/* 분모는 편집에 따라 조용히 변한다(앵커 하나 지우면 그 하루가 빠진다) — 그래서 상시 표시. */}
            <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }} title="손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 편집에 따라 변한다.">
                {v.universe.toLocaleString("ko-KR")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                {v.grain === "day" ? "종목 · 날짜" : "종목 · 날짜 · 시각"}
            </span>
            {v.canExpandToPoints && (
                <TextToggle active={expandToPoints} onClick={() => setExpand(!expandToPoints)}
                    title="결과를 타점까지 펼친다 — 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다. 반대(타점→하루)는 롤업 규칙이 없어 막혀 있다.">
                    타점으로
                </TextToggle>
            )}
            {v.deadStageIds.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAIL }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 단계는 판단 불가(미배치)로 잡힙니다.">
                    죽은 참조 {v.deadStageIds.length}
                </span>
            )}
        </div>
    );
}

function StageRow({ index, stage, tally, universe, label, dead, picked, onPick }: {
    index: number;
    stage: FilterStage;
    tally: StageTally;
    universe: number;
    label: string;
    dead: boolean;
    picked: FunnelCell | null;
    onPick: (cell: FunnelCell) => void;
}): JSX.Element {
    // 장식 판정 — 새로 죽인 게 없으면 이 단계는 겉보기 탈락이 아무리 커도 아무 일도 안 한 것이다.
    const decorative = tally.newlyKilled === 0;
    return (
        <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr) 62px", alignItems: "center", gap: 10, padding: "4px 0", opacity: decorative ? 0.5 : 1 }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
                    <span style={{ color: "var(--text-tertiary)", marginRight: 4 }}>{index + 1}</span>
                    <span style={{ color: dead ? FAIL : undefined }}>{label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{kindLabel(stageKind(stage))}</div>
            </div>

            {/* ⚠ 막대 길이는 언제나 유니버스 전체 — 단계가 늘어도 짧아지지 않는다. */}
            <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", background: "var(--bg-secondary)" }}>
                {CELLS.map(({ cell, label: cl, color, hint }) => {
                    const n = tally.counts[cell];
                    if (n === 0) return null;
                    const pct = universe === 0 ? 0 : (n / universe) * 100;
                    const on = picked === cell;
                    return (
                        <button
                            key={cell}
                            onClick={() => onPick(cell)}
                            title={`${cl} ${n.toLocaleString("ko-KR")} — ${hint}`}
                            style={{
                                width: `${pct}%`, minWidth: 0, border: "none", padding: 0, cursor: "pointer",
                                background: color, color: "#fff", fontSize: 10, lineHeight: 1,
                                fontVariantNumeric: "tabular-nums", overflow: "hidden", whiteSpace: "nowrap",
                                outline: on ? "2px solid var(--text-primary)" : "none", outlineOffset: -2,
                            }}
                        >{pct >= 7 ? n.toLocaleString("ko-KR") : ""}</button>
                    );
                })}
            </div>

            <div style={{ textAlign: "right", fontSize: 10.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}
                title="이 단계가 **새로** 죽인 수(상류 전부 통과였는데 이번에 탈락). 0 이면 장식이다 — 겉보기 탈락과 다를 수 있다.">
                새로 죽임<br />
                <span style={{ fontSize: 12, color: decorative ? "var(--text-tertiary)" : "var(--text-primary)" }}>
                    {tally.newlyKilled.toLocaleString("ko-KR")}
                </span>
            </div>
        </div>
    );
}

function Legend(): JSX.Element {
    return (
        <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: "3px 12px", padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", fontSize: 10.5, color: "var(--text-secondary)" }}>
            {CELLS.map(({ cell, label, color, hint }) => (
                <span key={cell} title={hint} style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: color, verticalAlign: -1, marginRight: 4 }} />
                    {label}
                </span>
            ))}
        </div>
    );
}

function ResultList({ v, picked, items }: { v: FunnelView; picked: { stageIndex: number; cell: FunnelCell } | null; items: FunnelItem[] }): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const shown = items.slice(0, MAX_ROWS);
    const names = useQuery(stocksMetaQuery(shown.map((i) => i.stockCode)));
    const nameOf = (code: string): string => names.data?.find((m) => m.stockCode === code)?.name ?? code;
    const meta = picked ? CELLS.find((c) => c.cell === picked.cell) : null;
    // 근접 탈락에서만 "막힌 단계"가 뜻을 가진다 — 다른 칸은 상류가 안 막았거나 이번 단계가 원인이다.
    const showBlocked = picked?.cell === "nearMiss";

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-strong)" }}>
            {picked === null ? (
                <Note>막대의 칸을 누르면 그 칸의 항목이 여기 나옵니다.</Note>
            ) : (
                <>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", whiteSpace: "nowrap" }}>
                        <span style={{ background: meta?.color, color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11 }}>
                            {picked.stageIndex + 1}단계 · {meta?.label}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {items.length.toLocaleString("ko-KR")}건 — {meta?.hint}
                        </span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                            <thead>
                                <tr style={{ color: "var(--text-tertiary)", fontSize: 10.5, textAlign: "left" }}>
                                    <th style={{ width: 74, fontWeight: 400, padding: "3px 10px" }}>날짜</th>
                                    {v.grain === "point" && <th style={{ width: 52, fontWeight: 400, padding: "3px 0" }}>시각</th>}
                                    <th style={{ fontWeight: 400, padding: "3px 0" }}>종목</th>
                                    {showBlocked && <th style={{ width: 110, fontWeight: 400, padding: "3px 0" }}>막힌 단계</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((it) => (
                                    <tr key={`${it.stockCode}|${it.date}|${it.time ?? ""}`}
                                        onClick={() => it.time && goToPoint({ date: it.date, code: it.stockCode, time: it.time }, "filter-funnel")}
                                        style={{ borderTop: "1px solid var(--border-subtle)", cursor: it.time ? "pointer" : "default" }}>
                                        <td style={{ padding: "3px 10px", color: "var(--text-secondary)" }}>{it.date.slice(2).replace(/-/g, ".")}</td>
                                        {v.grain === "point" && <td style={{ padding: "3px 0", color: "var(--accent-primary)" }}>{it.time?.slice(0, 5) ?? "—"}</td>}
                                        <td style={{ padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(it.stockCode)}</td>
                                        {showBlocked && (
                                            <td style={{ padding: "3px 0", color: FAIL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {v.blockedLabels(it, picked.stageIndex).join(" · ")}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {items.length > MAX_ROWS && (
                            <div style={{ padding: "4px 10px", color: "var(--text-tertiary)", fontSize: 10.5 }}>…외 {(items.length - MAX_ROWS).toLocaleString("ko-KR")}건</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}
