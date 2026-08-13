// 지금 보는 집합의 목록 — 깔때기가 네비게이션이 되는 자리(행 클릭 = 그 타점으로).
// 짚은 칸이 없으면 최종 생존, 있으면 그 칸들의 합집합. **모든 구독 패널이 보는 것과 같은 집합**이다.
//
// 세 가지가 이 목록의 규칙이다:
//
// ① **달이 페이지다.** 수천 건을 앞에서 200개만 그리고 "…외 4,905건"으로 접으면 나머지는 볼 방법이
//    아예 없다. 복기는 달 단위로 하는 일이라(그 달에 뭐가 있었나) 달이 자연스러운 페이지 경계다.
//    ⚠ 달 고르기는 **시선이지 조건이 아니다** — 5칸 숫자도, 다른 패널이 구독하는 집합도 안 변한다.
//    그래서 머리글에 `이 달 n / 전체 N` 을 나란히 쓴다(안 그러면 "62건이라며 왜 12건만"이 된다).
//
// ② **같은 (날짜·종목)은 한 덩어리로 보인다.** 타점 해상도에서는 한 차트가 여러 행이 되는데, 날짜와
//    이름이 매 행 반복되면 몇 개의 차트를 보고 있는지가 안 읽힌다. 첫 행에만 쓰고 세로선으로 묶는다.
//
// ③ **선택은 조건이 아니라 시선이다.** 지금 보고 있는 타점은 목록 위 **고정 줄**에 늘 떠 있고(조건 밖이라
//    목록에 없어도), 그 줄을 누르면 그 타점이 있는 달로 옮겨 가 행까지 스크롤한다.
//    ⚠ **따라가기는 누를 때만** 한다. 예전엔 타점이 바뀌면 달이 저절로 따라갔는데, 그러면 5월을 훑는
//    중에 다른 달 타점을 하나 누르는 순간 보던 달을 잃는다 — 고른 달은 사용자의 것이다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { stocksMetaQuery } from "../../api/queries.js";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";
import { pointKeyOf } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { ACTIVE, ACTIVE_SOFT, FAIL, STRONG } from "../../styles/palette.js";
import type { FunnelSelection } from "../../store/filterFunnelSlice.js";
import { cellMeta } from "./cells.js";
import { shortDate } from "../../lib/date.js";
import { groupByChart, monthBuckets, monthLabel, monthOf, sortItems } from "./resultRows.js";
import type { FunnelView } from "./useFilterFunnel.js";

/** 한 달이 이보다 크면 그것대로 못 그린다 — 달이 페이지인 이상 잘림은 예외 상황이라 표시만 남긴다. */
const MAX_ROWS = 1000;

export function ResultList({ v, selection }: { v: FunnelView; selection: FunnelSelection | null }): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const activePoint = useWorkbench((s) => s.activePoint);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const items = v.viewedItems;

    const sorted = useMemo(() => sortItems(items), [items]);
    const { months, countByMonth } = useMemo(() => monthBuckets(sorted), [sorted]);

    const activeKey = activePoint ? pointKeyOf(activePoint.code, activePoint.date, activePoint.time) : null;
    const activeMonth = activePoint ? monthOf(activePoint.date) : null;

    const [picked, setPicked] = useState<string | null>(null);
    // 고른 달이 조건 편집으로 사라졌으면 가장 최근 달로 — 빈 화면을 보여주지 않는다.
    const month = picked !== null && months.includes(picked) ? picked : (months[0] ?? null);

    // 찾아가기 — 달을 바꾸고 **그 다음 렌더에서** 스크롤한다(행은 달이 바뀌어야 존재한다).
    // 그래서 rAF 가 아니라 커밋 뒤에 도는 effect 를 쓴다.
    const [jumpAt, setJumpAt] = useState(0);
    const activeRowRef = useRef<HTMLTableRowElement | null>(null);
    const activeChipRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (jumpAt === 0) return;
        activeChipRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
        activeRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [jumpAt]);

    const monthItems = useMemo(() => (month === null ? [] : sorted.filter((i) => monthOf(i.date) === month)), [sorted, month]);
    const shown = monthItems.slice(0, MAX_ROWS);
    const groups = useMemo(() => groupByChart(shown), [shown]);

    const names = useQuery(stocksMetaQuery(shown.map((i) => i.stockCode)));
    const nameOf = (code: string): string => names.data?.find((m) => m.stockCode === code)?.name ?? code;

    // 활성 타점이 지금 보는 집합 안에 있나 — 없으면 찾아갈 자리가 없다(달을 바꿔도 행이 없다).
    const activeInResult = useMemo(
        () => activeKey !== null && sorted.some((i) => i.time && pointKeyOf(i.stockCode, i.date, i.time) === activeKey),
        [sorted, activeKey],
    );

    const stageIndex = selection ? v.active.findIndex((s) => s.id === selection.stageId) : -1;
    const filterNo = selection ? v.stagesOrdered.findIndex((e) => e.stage.id === selection.stageId) + 1 : 0;
    // 막은 필터는 근접 탈락에서만 뜻이 있다 — 다른 칸은 상류가 안 막았거나 이번 필터가 원인이다.
    const showBlocked = selection !== null && selection.cells.includes("nearMiss") && stageIndex >= 0;

    /** 칸 하나 빼기. 마지막 하나를 빼면 시선 자체가 풀려 최종 생존으로 돌아간다. */
    const dropCell = (cell: FunnelCell): void => {
        if (!selection) return;
        const cells = selection.cells.filter((c) => c !== cell);
        setSelection(cells.length > 0 ? { stageId: selection.stageId, cells } : null);
    };

    const monthWheel = useHorizontalWheel<HTMLDivElement>(true);

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 4px", whiteSpace: "nowrap", overflow: "hidden" }}>
                {selection === null ? (
                    <span style={{ background: STRONG, color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11 }}>최종 생존</span>
                ) : (
                    <>
                        <button onClick={() => setSelection(null)} title="시선 풀기 — 최종 생존으로"
                            style={{ flexShrink: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", font: "inherit", fontSize: 11, padding: "0 6px" }}>
                            필터 {filterNo} ✕
                        </button>
                        {selection.cells.map((c) => {
                            const m = cellMeta(c);
                            return (
                                <button key={c} onClick={() => dropCell(c)} title={`${m.label} 빼기`}
                                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, background: m.color, color: "#fff", border: "none", borderRadius: 4, padding: "1px 6px", fontSize: 11, cursor: "pointer" }}>
                                    {m.label}<span style={{ fontSize: 9, opacity: 0.85 }}>✕</span>
                                </button>
                            );
                        })}
                    </>
                )}
                <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {months.length > 1 && month !== null
                        ? `이 달 ${monthItems.length.toLocaleString("ko-KR")} / 전체 ${items.length.toLocaleString("ko-KR")}건`
                        : `${items.length.toLocaleString("ko-KR")}건`}
                    {selection === null && " — 전 필터 통과(순서 무관)"}
                </span>
            </div>

            {/* 지금 보고 있는 타점 — 조건 밖이라 목록에 없어도 여기엔 남는다(시선은 조건이 아니다). */}
            {activePoint && (
                <button
                    onClick={() => { if (activeInResult && activeMonth) { setPicked(activeMonth); setJumpAt(Date.now()); } }}
                    disabled={!activeInResult}
                    title={activeInResult ? "이 타점으로 — 그 달로 옮기고 목록에서 찾아갑니다" : "지금 조건에는 안 걸린 타점입니다(선택은 조건이 아니라 시선이라 여기 남습니다)"}
                    style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                        margin: "0 0 5px", padding: "3px 10px", border: "none", borderLeft: `3px solid ${activeInResult ? ACTIVE : "var(--border-default)"}`,
                        background: activeInResult ? ACTIVE_SOFT : "var(--bg-secondary)",
                        cursor: activeInResult ? "pointer" : "default", font: "inherit",
                    }}>
                    <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--text-tertiary)" }}>선택</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: activeInResult ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {nameOf(activePoint.code)}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {shortDate(activePoint.date)} {activePoint.time.slice(0, 5)}
                    </span>
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9.5, color: activeInResult ? ACTIVE : "var(--text-tertiary)" }}>
                        {activeInResult ? "찾아가기 →" : "결과 밖"}
                    </span>
                </button>
            )}

            {/* 달 = 페이지. 하나뿐이면 고를 게 없다. */}
            {months.length > 1 && (
                <div ref={monthWheel} className="no-scrollbar" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "0 10px 5px", overflowX: "auto" }}>
                    {months.map((ym) => {
                        const on = ym === month;
                        return (
                            <button key={ym} ref={ym === activeMonth ? activeChipRef : undefined}
                                onClick={() => setPicked(ym)} title={`${monthLabel(ym)} — ${countByMonth.get(ym)?.toLocaleString("ko-KR")}건`}
                                style={{
                                    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
                                    border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 4,
                                    background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-primary)" : "var(--text-secondary)",
                                    font: "inherit", fontSize: 11, fontWeight: on ? 700 : 400, padding: "1px 7px", fontVariantNumeric: "tabular-nums",
                                }}>
                                {monthLabel(ym)}
                                <span style={{ fontSize: 9.5, color: on ? "var(--accent-primary)" : "var(--text-tertiary)" }}>{countByMonth.get(ym)?.toLocaleString("ko-KR")}</span>
                                {ym === activeMonth && <span title="지금 보고 있는 타점이 있는 달" style={{ width: 5, height: 5, borderRadius: "50%", background: ACTIVE }} />}
                            </button>
                        );
                    })}
                </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {items.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>비어 있습니다.</div>}
                {groups.length > 0 && (
                    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                        <thead>
                            <tr style={{ color: "var(--text-tertiary)", fontSize: 10.5, textAlign: "left" }}>
                                <th style={{ width: 74, fontWeight: 400, padding: "3px 10px" }}>날짜</th>
                                {v.grain === "point" && <th style={{ width: 52, fontWeight: 400, padding: "3px 0" }}>시각</th>}
                                <th style={{ fontWeight: 400, padding: "3px 0" }}>종목</th>
                                {showBlocked && <th style={{ width: 110, fontWeight: 400, padding: "3px 0" }}>막은 필터</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((g) => g.items.map((it, i) => {
                                const key = it.time ? pointKeyOf(it.stockCode, it.date, it.time) : null;
                                const active = key !== null && key === activeKey;
                                const tied = g.items.length > 1; // 한 차트에 타점 여럿 — 세로선으로 묶는다
                                return (
                                    <tr key={`${g.key}|${it.time ?? ""}`} ref={active ? activeRowRef : undefined}
                                        onClick={() => it.time && goToPoint({ date: it.date, code: it.stockCode, time: it.time }, "filter-funnel")}
                                        style={{
                                            // 덩어리 안쪽 행은 위 선을 없애 한 블록으로 보이게 한다.
                                            borderTop: i === 0 ? "1px solid var(--border-subtle)" : "none",
                                            background: active ? ACTIVE_SOFT : "transparent",
                                            cursor: it.time ? "pointer" : "default",
                                        }}>
                                        <td style={{
                                            padding: "3px 10px", color: "var(--text-secondary)",
                                            borderLeft: active ? `2px solid ${ACTIVE}` : tied ? "2px solid var(--border-default)" : "2px solid transparent",
                                        }}>
                                            {i === 0 ? shortDate(it.date) : ""}
                                        </td>
                                        {v.grain === "point" && <td style={{ padding: "3px 0", color: active ? ACTIVE : "var(--accent-primary)", fontWeight: active ? 700 : 400 }}>{it.time?.slice(0, 5) ?? "—"}</td>}
                                        <td style={{ padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 700 : 400 }}>
                                            {i === 0 ? nameOf(it.stockCode) : ""}
                                        </td>
                                        {showBlocked && (
                                            <td style={{ padding: "3px 0", color: FAIL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {v.blockedLabels(it, stageIndex).join(" · ")}
                                            </td>
                                        )}
                                    </tr>
                                );
                            }))}
                        </tbody>
                    </table>
                )}
                {monthItems.length > MAX_ROWS && (
                    <div style={{ padding: "4px 10px", color: "var(--text-tertiary)", fontSize: 10.5 }}>
                        이 달만 {monthItems.length.toLocaleString("ko-KR")}건 — 앞 {MAX_ROWS.toLocaleString("ko-KR")}건만 그렸습니다
                    </div>
                )}
            </div>
        </div>
    );
}
