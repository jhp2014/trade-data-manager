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
// ③ **선택은 조건이 아니라 시선이다.** 지금 보고 있는 선택(subject: 타점 또는 하루)은 목록 위
//    **고정 줄**에 늘 떠 있고(조건 밖이라 목록에 없어도), 그 줄을 누르면 그 선택이 있는 달로 옮겨 가
//    행까지 스크롤한다.
//    ⚠ **따라가기는 누를 때만** 한다. 예전엔 타점이 바뀌면 달이 저절로 따라갔는데, 그러면 5월을 훑는
//    중에 다른 달 타점을 하나 누르는 순간 보던 달을 잃는다 — 고른 달은 사용자의 것이다.
//
// ④ **하루 행도 선택이다.** 타점 해상도가 아니면(또는 타점 없는 하루면) 행에 time 이 없는데, 그걸
//    못 누르게 두면 "필터로 찾은 하루를 보러 간다"가 이 목록에서 성립하지 않는다. time 없는 행 클릭
//    = goToDay(하루 선택 — activePoint 는 풀린다).
import { useEffect, useMemo, useRef, useState } from "react";
import type { FunnelCell, FunnelItem } from "@trade-data-manager/market/domain";
import { ScrollRow } from "../../components/ControlChrome.js";
import { ItemRows, type ItemSection } from "../../components/ItemRows.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { useSubject } from "../../lib/subject.js";
import { useWorkbench } from "../../store/workbench.js";
import { ACTIVE, ACTIVE_SOFT, FAIL, STRONG } from "../../styles/palette.js";
import type { FunnelSelection } from "../../store/filterFunnelSlice.js";
import { cellMeta } from "./cells.js";
import { shortDate } from "../../lib/date.js";
import { monthBuckets, monthLabel, monthOf, sortItems } from "./resultRows.js";
import { MONTH_PICK_HINT, useMonthPick } from "./monthPick.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function ResultList({ v, selection }: { v: FunnelView; selection: FunnelSelection | null }): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const subject = useSubject();
    const items = v.viewedItems;

    const sorted = useMemo(() => sortItems(items), [items]);
    const { months, countByMonth } = useMemo(() => monthBuckets(sorted), [sorted]);

    const activeMonth = subject ? monthOf(subject.date) : null;
    // 이 행이 지금 선택인가 — 타점 선택이면 그 시각의 행(하루 알갱이면 그 하루 행), 하루 선택이면 그 차트의 행 전부.
    const isActiveItem = (it: { stockCode: string; date: string; time?: string }): boolean =>
        subject !== null && it.stockCode === subject.code && it.date === subject.date &&
        (subject.time === null || it.time === undefined || it.time === subject.time);

    // 달 고르기 — 여럿 고를 수 있다(손짓은 monthPick 머리 주석). 사이드바와 같은 한 벌을 쓴다.
    const pick = useMonthPick(months);

    // 찾아가기 — 달을 바꾸고 **그 다음 렌더에서** 옮긴다(줄은 달이 바뀌어야 존재한다).
    // 칩은 아직 DOM 이라 ref 로 밀지만, 목록 줄은 가상화라 안 그려져 있을 수 있어 **키로** 넘긴다.
    const [jumpAt, setJumpAt] = useState(0);
    const activeChipRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (jumpAt === 0) return;
        activeChipRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }, [jumpAt]);
    const jumpTo = jumpAt === 0 ? undefined : { nonce: jumpAt };

    const monthItems = useMemo(() => sorted.filter((i) => pick.picked.has(monthOf(i.date))), [sorted, pick.picked]);
    // ⚠ 앞 N 건으로 자르던 상한(MAX_ROWS)은 없앴다 — 목록이 가상화라 통째로 그려도 DOM 은 보이는 줄
    // 수만큼만 산다. 자르기는 "볼 방법이 아예 없는 나머지"를 만드는 일이었다.
    //
    // 달을 여럿 고르면 **달마다 토막**으로 나눈다 — 안 나누면 경계가 안 보여 두 달이 한 달처럼 읽힌다.
    // 토막 머리는 목록 안에서 위에 붙으므로(ItemRows) 긴 달을 훑는 중에도 "지금 몇 월"이 안 사라진다.
    const sections = useMemo<ItemSection[]>(() => {
        if (!pick.multi) return [{ items: monthItems }];
        return months
            .filter((ym) => pick.picked.has(ym))
            .map((ym) => ({ label: monthLabel(ym), items: monthItems.filter((i) => monthOf(i.date) === ym) }));
    }, [pick.multi, pick.picked, months, monthItems]);

    // 종목명 — 사전 한 벌(전량)에서. 선택이 이 달·이 집합 밖이어도(고정 줄이 있는 이유) 이름이 나온다.
    const { nameOf } = useStockNames();

    // 지금 선택이 보는 집합 안에 있나 — 없으면 찾아갈 자리가 없다(달을 바꿔도 행이 없다).
    // 하루 선택은 그 차트의 행이 하나라도 있으면 찾아간다(타점 해상도라도 그 하루의 타점 행으로).
    const activeInResult = useMemo(() => sorted.some(isActiveItem), [sorted, subject]);

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
                    {months.length > 1
                        ? `${pick.multi ? `고른 달 ${pick.picked.size} · ` : "이 달 "}${monthItems.length.toLocaleString("ko-KR")} / 전체 ${items.length.toLocaleString("ko-KR")}건`
                        : `${items.length.toLocaleString("ko-KR")}건`}
                    {selection === null && " — 전 필터 통과(순서 무관)"}
                </span>
            </div>

            {/* 지금 보고 있는 선택(타점 또는 하루) — 조건 밖이라 목록에 없어도 여기엔 남는다(시선은 조건이 아니다). */}
            {subject && (
                // 찾아가기는 그 달 **하나로** 갈아탄다 — 여러 달을 고른 채로 찾아가면 어디로 갔는지 안 보인다.
                <button
                    onClick={() => { if (activeInResult && activeMonth) { pick.click(activeMonth, { ctrl: false, shift: false }); setJumpAt(Date.now()); } }}
                    disabled={!activeInResult}
                    title={activeInResult ? "이 선택으로 — 그 달로 옮기고 목록에서 찾아갑니다" : "지금 조건에는 안 걸린 선택입니다(선택은 조건이 아니라 시선이라 여기 남습니다)"}
                    style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                        margin: "0 0 5px", padding: "3px 10px", border: "none", borderLeft: `3px solid ${activeInResult ? ACTIVE : "var(--border-default)"}`,
                        background: activeInResult ? ACTIVE_SOFT : "var(--bg-secondary)",
                        cursor: activeInResult ? "pointer" : "default", font: "inherit",
                    }}>
                    <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--text-tertiary)" }}>선택</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: activeInResult ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {nameOf(subject.code)}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {shortDate(subject.date)}{subject.time !== null ? ` ${subject.time.slice(0, 5)}` : ""}
                    </span>
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9.5, color: activeInResult ? ACTIVE : "var(--text-tertiary)" }}>
                        {activeInResult ? "찾아가기 →" : "결과 밖"}
                    </span>
                </button>
            )}

            {/* 달 = 시선(여럿 고를 수 있다). 하나뿐이면 고를 게 없다. */}
            {months.length > 1 && (
                <ScrollRow gap={4} style={{ flexShrink: 0, padding: "0 10px 5px" }}>
                    {months.map((ym) => {
                        const on = pick.picked.has(ym);
                        return (
                            <button key={ym} ref={ym === activeMonth ? activeChipRef : undefined}
                                onClick={(e) => pick.click(ym, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                                title={`${monthLabel(ym)} — ${countByMonth.get(ym)?.toLocaleString("ko-KR")}건 · ${MONTH_PICK_HINT}`}
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
                </ScrollRow>
            )}

            {items.length === 0
                ? <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>비어 있습니다.</div>
                : (
                    // 목록 자체는 공용(ItemRows) — 집합 사이드바의 멤버 목록이 같은 것을 쓴다.
                    // time 있는 줄 = 타점 이동, 없는 줄 = 하루 이동(타점 없는 하루도 선택이다 — 파일 머리 ④).
                    <ItemRows
                        sections={sections}
                        showTime={v.grain === "point"}
                        nameOf={nameOf}
                        isActive={isActiveItem}
                        jumpTo={jumpTo}
                        onPick={(it) => it.time
                            ? goToPoint({ date: it.date, code: it.stockCode, time: it.time }, "filter-funnel")
                            : goToDay({ date: it.date, code: it.stockCode }, "filter-funnel")}
                        extra={showBlocked
                            ? {
                                header: "막은 필터", width: 110,
                                render: (it) => <span style={{ color: FAIL }}>{v.blockedLabels(it as FunnelItem, stageIndex).join(" · ")}</span>,
                            }
                            : undefined}
                    />
                )}
        </div>
    );
}
