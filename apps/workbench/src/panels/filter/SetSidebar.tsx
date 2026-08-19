// 집합 사이드바 — **구현 하나, 인스턴스는 패널마다**. 바인딩 고르기와 멤버 목록이 한 칸에 산다.
// 공용 dockview 패널이 아닌 이유: 패널마다 바인딩이 다르니 공용 패널은 "어느 패널 것인가"라는
// 선택자가 필요해지고, 그 순간 방금 죽인 전역 렌즈가 축소판으로 부활한다.
//
// 내용 셋:
//   · 바인딩 고르기 — 깔때기 시선/전체/최종 생존/저장 필터/그룹. 깨진 참조면 맨 위에 "전체로 전환".
//   · 멤버 목록 — 패널 층위로 변환(setMembers), 달로 훑기(여럿 선택 가능), 줄 클릭=되짚기.
//   · 표현 안 됨 — 이 패널이 못 그린 멤버(결손 목록). 클릭하면 그 항목으로 가서 **채우러 간다**(작업 큐).
import { useMemo, useState, type ReactNode } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { useWorkbench } from "../../store/workbench.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { ScrollRow } from "../../components/ControlChrome.js";
import { ItemRows, type ItemSection, type RowItem } from "../../components/ItemRows.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { ACTIVE, FAIL } from "../../styles/palette.js";
import { monthBuckets, monthLabel, monthOf } from "./resultRows.js";
import { MONTH_PICK_HINT, useMonthPick } from "./monthPick.js";
import type { SetBinding } from "./useSetBinding.js";
import type { SetMembers } from "./setMembers.js";

export const SET_SIDEBAR_W = 240;

export function SetSidebar({ binding, members, showTime, onPick }: {
    binding: SetBinding;
    /** 패널 층위로 변환·판정된 멤버(setMembersOf) — 칩의 n/N 과 같은 재료(패널이 한 번 계산해 나눠 준다). */
    members: SetMembers;
    /** 시각 열을 그릴까 — point 층위 패널만. */
    showTime: boolean;
    /** 행 클릭 = 되짚기(시각 있으면 타점, 없으면 하루로). */
    onPick: (it: RowItem) => void;
}): JSX.Element {
    const gv = useGroups();
    const savedFunnels = useWorkbench((s) => s.savedFunnels);
    const { nameOf } = useStockNames();
    const [pickingSet, setPickingSet] = useState(false);

    // ── 달로 훑기. 달 목록은 전체 멤버 기준(안 됨 포함 — 결손도 그 달의 사실이다).
    const { months, countByMonth } = useMemo(() => monthBuckets(members.members), [members.members]);
    // 여럿 고를 수 있다 — 결과 목록과 **같은 한 벌**(손짓·스테일 처리가 갈리면 두 화면이 다르게 군다).
    // 바인딩을 바꾸면 멤버의 달들이 통째로 갈리는데, 그 훅이 사라진 달을 버리고 하나는 남긴다.
    const pick = useMonthPick(months);
    const inMonth = useMemo(
        () => members.members.filter((m) => pick.picked.has(monthOf(m.date))),
        [members.members, pick.picked],
    );
    const okRows = useMemo(() => inMonth.filter((m) => m.ok), [inMonth]);
    const badRows = useMemo(() => inMonth.filter((m) => !m.ok), [inMonth]);
    // 표현 안 됨 = 집합의 멤버지만 이 패널이 그릴 재료가 없는 것. 클릭하면 그리로 가서 **채우러 간다**.
    // 달을 여럿 고르면 표현된 쪽을 달마다 토막낸다(경계가 없으면 두 달이 한 달처럼 읽힌다).
    const sections = useMemo<ItemSection[]>(() => [
        ...(pick.multi
            ? months.filter((ym) => pick.picked.has(ym))
                .map((ym) => ({ label: monthLabel(ym), items: okRows.filter((m) => monthOf(m.date) === ym) }))
            : [{ items: okRows }]),
        { label: `표현 안 됨 ${badRows.length}`, warn: true, items: badRows },
    ], [okRows, badRows, pick.multi, pick.picked, months]);

    const options = useMemo(() => {
        // 셋 다 한 줄씩 갖는다 — 셋의 차이가 "짚은 칸을 따라가나 / 필터를 거치나" 둘로 갈리는데,
        // 이름만 봐서는 그 축이 안 보인다("최종 생존"과 "깔때기 시선"은 아무것도 안 짚었으면 같다).
        const fixed: { ref: SetRef | null; label: string; hint?: string }[] = [
            { ref: null, label: "깔때기 시선", hint: "짚은 칸까지 따라간다 (기본)" },
            { ref: { kind: "universe" }, label: "전체", hint: "필터 이전 후보 전부" },
            { ref: { kind: "filter", filterId: null }, label: "최종 생존", hint: "짚은 칸을 안 따라간다" },
        ];
        const filters = savedFunnels.map((f) => ({ ref: { kind: "filter", filterId: f.id } as SetRef, label: f.name }));
        const groups = gv.groups.map((g) => ({ ref: { kind: "group", name: g.name } as SetRef, label: g.name, scope: g.scope }));
        return { fixed, filters, groups };
    }, [savedFunnels, gv.groups]);
    const currentKey = binding.ref === null ? null : setRefKey(binding.ref);
    const choose = (ref: SetRef | null): void => { binding.setRef(ref); setPickingSet(false); };

    return (
        <div style={{
            width: SET_SIDEBAR_W, flex: "none", borderLeft: "1px solid var(--border-default)",
            display: "flex", flexDirection: "column", minHeight: 0, fontSize: 11,
        }}>
            {/* 머리 — 지금 바인딩과 n/N. 이름 클릭 = 고르는 판 접기/펼치기. */}
            <button onClick={() => setPickingSet((v) => !v)} title="보는 집합 바꾸기"
                style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "none",
                    borderBottom: "1px solid var(--border-default)", background: "transparent", cursor: "pointer",
                    font: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left",
                    color: binding.broken ? FAIL : "var(--text-primary)",
                }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {binding.broken ? "⚠ " : ""}{binding.label}
                </span>
                <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontWeight: 400, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {members.okCount}/{members.total} {pickingSet ? "▴" : "▾"}
                </span>
            </button>

            {pickingSet && (
                <div style={{ overflowY: "auto", maxHeight: "45%", flex: "none", borderBottom: "1px solid var(--border-default)", padding: "3px 0" }}>
                    {binding.broken && (
                        <OptionRow onClick={() => choose({ kind: "universe" })}>
                            <span style={{ color: FAIL }}>⚠ 참조가 깨짐 — <b>전체로 전환</b></span>
                        </OptionRow>
                    )}
                    {options.fixed.map((o) => (
                        <OptionRow key={o.ref === null ? "@linked" : setRefKey(o.ref)}
                            active={(o.ref === null ? null : setRefKey(o.ref)) === currentKey && !binding.broken}
                            onClick={() => choose(o.ref)}>
                            <span>{o.label}</span>
                            {o.hint && <Hint>{o.hint}</Hint>}
                        </OptionRow>
                    ))}
                    {options.filters.length > 0 && <Head>저장 필터</Head>}
                    {options.filters.map((o) => (
                        <OptionRow key={setRefKey(o.ref)} active={setRefKey(o.ref) === currentKey} onClick={() => choose(o.ref)}>
                            {o.label}
                        </OptionRow>
                    ))}
                    {options.groups.length > 0 && <Head>그룹</Head>}
                    {options.groups.map((o) => (
                        <OptionRow key={setRefKey(o.ref)} active={setRefKey(o.ref) === currentKey} onClick={() => choose(o.ref)}>
                            <span>{o.label}</span>
                            <Hint>{o.scope === "day" ? "하루" : "타점"}</Hint>
                        </OptionRow>
                    ))}
                </div>
            )}

            {/* 월 칩 — 결과 목록과 같은 문법(달=페이지). 한 달이면 칩을 안 그린다. */}
            {months.length > 1 && (
                <ScrollRow gap={4} style={{ padding: "5px 8px", flex: "none", borderBottom: "1px solid var(--border-default)" }}>
                    {months.map((ym) => {
                        const on = pick.picked.has(ym);
                        return (
                            <button key={ym} onClick={(e) => pick.click(ym, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                                title={`${monthLabel(ym)} — ${countByMonth.get(ym)?.toLocaleString("ko-KR")}건 · ${MONTH_PICK_HINT}`}
                                style={{
                                    border: "1px solid var(--border-default)", borderRadius: 999, padding: "0 7px",
                                    background: on ? "var(--bg-tertiary)" : "transparent", cursor: "pointer",
                                    font: "inherit", fontSize: 10.5, whiteSpace: "nowrap", flexShrink: 0,
                                    color: on ? ACTIVE : "var(--text-secondary)", fontWeight: on ? 700 : 400,
                                }}>
                                {monthLabel(ym)}
                            </button>
                        );
                    })}
                </ScrollRow>
            )}

            {/* 목록 하나에 토막 둘 — "표현 안 됨" 머리는 목록 **안의 구분줄**이다. 밖에 두면 목록이
                둘로 갈려 스크롤 상자도 둘이 되고, 가상화가 그 자리를 계산에 못 넣는다. */}
            {members.total === 0
                ? <Note>{binding.broken ? "참조가 깨져 빈 집합입니다" : "멤버가 없습니다"}</Note>
                : <ItemRows sections={sections} showTime={showTime} nameOf={nameOf} onPick={onPick} extra={extraOf(okRows)} />}
        </div>
    );
}

/** day 층위의 낱알 병기 — 투영은 손실이라, 접힌 타점 수를 마지막 열로 보인다(하나도 없으면 열 자체가 없다). */
function extraOf(rows: readonly { pointCount?: number }[]): { header: string; width: number; render: (it: RowItem) => ReactNode } | undefined {
    if (!rows.some((r) => (r.pointCount ?? 0) > 0)) return undefined;
    const byKey = new Map(rows.map((r) => [`${(r as RowItem).stockCode}|${(r as RowItem).date}`, r.pointCount ?? 0]));
    return {
        header: "타점", width: 34,
        render: (it) => {
            const n = byKey.get(`${it.stockCode}|${it.date}`) ?? 0;
            return n > 0 ? <span style={{ color: "var(--text-tertiary)" }}>{n}</span> : null;
        },
    };
}

function OptionRow({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
    return (
        <button onClick={onClick} style={{
            display: "flex", width: "100%", alignItems: "center", gap: 6, textAlign: "left",
            border: "none", background: active ? "var(--bg-tertiary)" : "transparent", cursor: "pointer",
            padding: "3px 10px", font: "inherit", fontSize: 11.5,
            color: active ? ACTIVE : "var(--text-primary)", fontWeight: active ? 600 : 400,
        }}>
            {children}
        </button>
    );
}

const Head = ({ children }: { children: ReactNode }): JSX.Element => (
    <div style={{ padding: "5px 10px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>{children}</div>
);

const Hint = ({ children }: { children: ReactNode }): JSX.Element => (
    <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>{children}</span>
);

const Note = ({ children }: { children: ReactNode }): JSX.Element => (
    <div style={{ padding: "8px 10px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>{children}</div>
);
