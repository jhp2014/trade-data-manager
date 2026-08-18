// 집합 사이드바 — **구현 하나, 인스턴스는 패널마다**. 바인딩 고르기와 멤버 목록이 한 칸에 산다.
// 공용 dockview 패널이 아닌 이유: 패널마다 바인딩이 다르니 공용 패널은 "어느 패널 것인가"라는
// 선택자가 필요해지고, 그 순간 방금 죽인 전역 렌즈가 축소판으로 부활한다.
//
// 내용 셋:
//   · 바인딩 고르기 — 연동/전체/활성 필터/저장 필터/그룹. 깨진 참조면 맨 위에 "전체로 전환".
//   · 멤버 목록 — 패널 층위로 변환(setMembers), 월=페이지(결과 목록 조각 승격), 행 클릭=되짚기.
//   · 표현 안 됨 — 이 패널이 못 그린 멤버(결손 목록). 클릭하면 그 항목으로 가서 **채우러 간다**(작업 큐).
import { useMemo, useState, type ReactNode } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { useWorkbench } from "../../store/workbench.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { ItemRows, type RowItem } from "../../components/ItemRows.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { ACTIVE, FAIL } from "../../styles/palette.js";
import { monthBuckets, monthLabel, monthOf } from "./resultRows.js";
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

    // ── 월=페이지. 달 목록은 전체 멤버 기준(안 됨 포함 — 결손도 그 달의 사실이다).
    const { months, countByMonth } = useMemo(() => monthBuckets(members.members), [members.members]);
    const [monthSel, setMonthSel] = useState<string | null>(null);
    // 고른 달이 지금 집합에 **없으면 버린다**(첫 달로) — 바인딩을 바꾸면 멤버의 달들이 통째로 갈리는데,
    // 스테일 선택을 그대로 쓰면 inMonth 가 빈다. total>0 이라 "멤버가 없습니다"도 안 떠 말없이 빈 목록이 된다.
    const month = monthSel !== null && months.includes(monthSel) ? monthSel : (months[0] ?? null);
    const inMonth = useMemo(
        () => (month === null ? [] : members.members.filter((m) => monthOf(m.date) === month)),
        [members.members, month],
    );
    const okRows = useMemo(() => inMonth.filter((m) => m.ok), [inMonth]);
    const badRows = useMemo(() => inMonth.filter((m) => !m.ok), [inMonth]);

    const options = useMemo(() => {
        const fixed: { ref: SetRef | null; label: string; hint?: string }[] = [
            { ref: null, label: "연동", hint: "짚은 칸·활성 필터를 따라간다 (기본)" },
            { ref: { kind: "universe" }, label: "전체" },
            { ref: { kind: "filter", filterId: null }, label: "활성 필터" },
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
                <div className="no-scrollbar" style={{ display: "flex", gap: 4, padding: "5px 8px", overflowX: "auto", flex: "none", borderBottom: "1px solid var(--border-default)" }}>
                    {months.map((ym) => (
                        <button key={ym} onClick={() => setMonthSel(ym)}
                            title={`${monthLabel(ym)} — ${countByMonth.get(ym)?.toLocaleString("ko-KR")}건`}
                            style={{
                                border: "1px solid var(--border-default)", borderRadius: 999, padding: "0 7px",
                                background: ym === month ? "var(--bg-tertiary)" : "transparent", cursor: "pointer",
                                font: "inherit", fontSize: 10.5, whiteSpace: "nowrap", flexShrink: 0,
                                color: ym === month ? ACTIVE : "var(--text-secondary)", fontWeight: ym === month ? 700 : 400,
                            }}>
                            {monthLabel(ym)}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
                {members.total === 0 && <Note>{binding.broken ? "참조가 깨져 빈 집합입니다" : "멤버가 없습니다"}</Note>}
                {okRows.length > 0 && (
                    <ItemRows items={okRows} showTime={showTime} nameOf={nameOf} onPick={onPick}
                        extra={extraOf(okRows)} />
                )}
                {badRows.length > 0 && (
                    <>
                        <div style={{ padding: "6px 10px 2px", fontSize: 10, fontWeight: 700, color: FAIL }}
                            title="집합의 멤버지만 이 패널이 그릴 재료가 없다 — 클릭해서 채우러 간다">
                            표현 안 됨 {badRows.length}
                        </div>
                        <ItemRows items={badRows} showTime={showTime} nameOf={nameOf} onPick={onPick} />
                    </>
                )}
            </div>
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
