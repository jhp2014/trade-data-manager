import { useMemo, useRef, useState } from "react";
import { useGroupAssign } from "../store/groupAssign.js";
import { useGroups } from "../lib/GroupsContext.js";
import { rowKey } from "../lib/pointKey.js";
import { groupColor } from "../styles/palette.js";
import { canReparent, expandWithAncestors } from "../lib/groupTree.js";
import { AnchoredPopover } from "../ui/Dialog.js";
import { TextInput } from "../ui/controls.js";
import type { Group } from "../api/groups.js";

// 그룹 배정 팝오버 — **그룹을 만지는 유일한 표면**(decisions.md 「그룹 편집 출구」).
// 우클릭(시트/작업대상 행·차트 ◇·타점정보)이 커서 좌표로 연다(store/groupAssign, App 루트 단일 마운트).
//
//  · A안 섹션 스택: 타점 입구 = "이 타점"+"이 날" 두 섹션, day 입구 = "이 날" 하나. 비대칭은 구조적이다
//    (타점→그날은 유일, 날→타점은 다의 — 어느 분인지 알 수 없다).
//  · 그룹당 한 grain 관례를 **목록 필터로 지킨다**: 섹션엔 그 grain 의 그룹 + 빈 그룹(양쪽 후보)만 뜬다.
//  · 정렬은 이름순 고정(사전 순서 그대로) — 토글로 재정렬하지 않는다(연타 중 행 튐 금지).
//  · 인라인 생성 = 생성+즉시 배정. 섹션 꼬리 ＋행이 검색어를 이름으로 쓴다(섹션이 곧 scope).
//  · ⋯ 관리(개명·부모 지정·삭제 2단계)는 **인라인 블록**으로 편다 — 중첩 포털을 안 쓰는 것이
//    바깥클릭 닫힘(useDismiss)과의 사고를 원천 차단한다.
export function GroupAssignPopover(): JSX.Element | null {
    const target = useGroupAssign((s) => s.target);
    const anchor = useGroupAssign((s) => s.anchor);
    if (!target || !anchor) return null;
    // 대상이 바뀌면 remount — 검색어·관리 펼침 같은 로컬 상태를 끌고 가지 않는다(테마 배정과 같은 결).
    return <Body key={rowKey(target)} />;
}

/** 관리 블록 상태 — 한 번에 한 그룹만 펼친다(mode 는 펼친 뒤 고른 동작). */
type Manage = { group: string; mode: "menu" | "rename" | "parent" | "delete" };

function Body(): JSX.Element {
    const target = useGroupAssign((s) => s.target)!;
    const anchor = useGroupAssign((s) => s.anchor)!;
    const close = useGroupAssign((s) => s.close);
    const gv = useGroups();

    const [q, setQ] = useState("");
    const [manage, setManage] = useState<Manage | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const isPointEntry = target.time !== undefined;
    const chartRef = { stockCode: target.stockCode, date: target.date };
    const pointRef = isPointEntry ? { stockCode: target.stockCode, date: target.date, time: target.time! } : null;

    // grain 후보 — 멤버(자손 포함 롤업)가 있으면 그 grain, 어느 쪽도 없으면 빈 그룹 = 양쪽 후보.
    // 직접 멤버만 보면 자식만 멤버인 조상이 "빈 그룹"으로 오판돼 반대 grain 섹션에 뜬다 —
    // 계층은 한 grain 을 공유해야 하므로(그룹당 한 grain 관례) 조상 전개로 묶어서 판정한다.
    const dayGrain = useMemo(() => {
        const s = new Set<string>();
        for (const m of gv.memberships) for (const n of expandWithAncestors(m.groupNames, gv.groupByName)) s.add(n);
        return s;
    }, [gv.memberships, gv.groupByName]);
    const pointGrain = useMemo(() => {
        const s = new Set<string>();
        for (const m of gv.pointMemberships) for (const n of expandWithAncestors(m.groupNames, gv.groupByName)) s.add(n);
        return s;
    }, [gv.pointMemberships, gv.groupByName]);
    const dayGroups = useMemo(
        () => gv.groups.filter((g) => dayGrain.has(g.name) || !pointGrain.has(g.name)),
        [gv.groups, dayGrain, pointGrain],
    );
    const pointGroups = useMemo(
        () => gv.groups.filter((g) => pointGrain.has(g.name) || !dayGrain.has(g.name)),
        [gv.groups, dayGrain, pointGrain],
    );

    const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
    const nq = norm(q);
    const matches = (g: Group): boolean => nq === "" || norm(gv.pathLabel(g.name, g.name)).includes(nq);
    // 생성 가능 판정은 **원문(trim) 기준** — 서버 유니크가 원문이라, norm 으로 재면 "갭 상승"이
    // "갭상승" 때문에 못 만들어지는 가짜 차단이 생긴다. norm 은 검색(matches)에만 쓴다.
    const exactExists = gv.groups.some((g) => g.name === q.trim());

    /** 사전 편집 공통 실행기 — 실패를 그 자리에 남기고(침묵 금지), 성공하면 관리 블록을 접는다. */
    const run = async (op: () => Promise<void>, keepManage = false): Promise<void> => {
        if (busy) return;
        setBusy(true);
        setErr(null);
        try {
            await op();
            if (!keepManage) setManage(null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const create = (item: { stockCode: string; date: string; time?: string }): void => {
        const name = q.trim();
        if (!name || exactExists) return;
        void run(async () => {
            await gv.createGroupAndAttach(name, item);
            setQ("");
        });
    };

    const sectionProps = { gv, q, matches, manage, setManage, busy, run, dayGrain, pointGrain };

    return (
        <AnchoredPopover anchor={anchor} onClose={close} width={264} padding={0} placement="beside" maxHeight="64vh">
            <div style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
                {/* 헤더 — 무엇에 대한 배정인지. */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "8px 10px 6px" }}>
                    <b style={{ color: "var(--text-primary)", fontSize: 13 }}>{target.name || target.stockCode}</b>
                    <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                        {target.date.slice(2)}{target.time ? ` · ${target.time.slice(0, 5)}` : ""}
                    </span>
                </div>
                <div style={{ padding: "0 8px 6px" }}>
                    <TextInput
                        inputRef={searchRef}
                        value={q}
                        autoFocus
                        placeholder="검색 · 새 그룹 이름"
                        onChange={(e) => setQ(e.target.value)}
                        style={{ width: "100%", padding: "4px 8px", fontSize: 12 }}
                    />
                </div>

                {isPointEntry && pointRef && (
                    <Section
                        {...sectionProps}
                        title={`이 타점 · ${pointRef.time.slice(0, 5)}`}
                        groups={pointGroups}
                        checked={gv.pointGroupNamesOf(pointRef)}
                        inheritedVia={(name) => gv.pointInheritedViaOf(pointRef, name)}
                        countOf={(name) => gv.pointCountOf(name)}
                        onToggle={(name) => gv.togglePoint(pointRef, name)}
                        createLabel={exactExists ? null : q.trim() ? `＋ '${q.trim()}' 만들기 — 이 타점에` : "＋ 새 그룹 — 이 타점에"}
                        onCreate={() => (q.trim() ? create(pointRef) : searchRef.current?.focus())}
                    />
                )}
                <Section
                    {...sectionProps}
                    title={isPointEntry ? "이 날 · 그날 전체 적용" : "이 날"}
                    groups={dayGroups}
                    checked={gv.chartGroupNamesOf(chartRef)}
                    inheritedVia={(name) => gv.inheritedViaOf(chartRef, name)}
                    countOf={(name) => gv.countOf(name)}
                    onToggle={(name) => gv.toggleChart(chartRef, name)}
                    createLabel={exactExists ? null : q.trim() ? `＋ '${q.trim()}' 만들기 — 이 날에` : "＋ 새 그룹 — 이 날에"}
                    onCreate={() => (q.trim() ? create(chartRef) : searchRef.current?.focus())}
                />

                {q.trim() !== "" && exactExists && (
                    <div style={{ padding: "4px 10px", color: "var(--text-tertiary)", fontSize: 11 }}>
                        같은 이름의 그룹이 이미 있습니다 — 목록에서 토글하세요
                    </div>
                )}
                {err && <div style={{ padding: "4px 10px 8px", color: "var(--fall)", fontSize: 11 }}>⚠️ {err}</div>}
                {busy && <div style={{ padding: "0 10px 8px", color: "var(--text-tertiary)", fontSize: 11 }}>저장 중…</div>}
                <div style={{ height: 4 }} />
            </div>
        </AnchoredPopover>
    );
}

function Section({
    title, groups, checked, inheritedVia, countOf, onToggle, createLabel, onCreate,
    gv, q, matches, manage, setManage, busy, run, dayGrain, pointGrain,
}: {
    title: string;
    groups: Group[];
    checked: string[];
    inheritedVia: (name: string) => Group | null;
    countOf: (name: string) => number;
    onToggle: (name: string) => void;
    createLabel: string | null;
    onCreate: () => void;
    gv: ReturnType<typeof useGroups>;
    q: string;
    matches: (g: Group) => boolean;
    manage: Manage | null;
    setManage: (m: Manage | null) => void;
    busy: boolean;
    run: (op: () => Promise<void>, keepManage?: boolean) => Promise<void>;
    dayGrain: ReadonlySet<string>;
    pointGrain: ReadonlySet<string>;
}): JSX.Element {
    const visible = groups.filter(matches);
    const checkedSet = new Set(checked);
    return (
        <div>
            {/* sticky 섹션 헤더 — 스크롤 컨테이너는 AnchoredPopover 루트(overflowY:auto). */}
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--bg-primary)", padding: "5px 10px 3px", fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                {title}
            </div>
            {visible.length === 0 && q.trim() === "" && (
                <div style={{ padding: "3px 10px", color: "var(--text-tertiary)", fontSize: 11 }}>그룹 없음</div>
            )}
            {visible.map((g) => {
                const via = inheritedVia(g.name);
                const on = checkedSet.has(g.name);
                const opened = manage?.group === g.name ? manage : null;
                return (
                    <div key={g.name}>
                        <div
                            className="ga-row"
                            onClick={via ? undefined : () => onToggle(g.name)}
                            title={gv.pathLabel(g.name, g.name)}
                            style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "3px 10px",
                                cursor: via ? "default" : "pointer",
                                opacity: via ? 0.45 : 1,
                                background: on ? "var(--bg-active)" : undefined,
                            }}
                        >
                            <span style={{ width: 13, flexShrink: 0, color: "var(--accent-primary)", fontWeight: 700, textAlign: "center" }}>{on ? "✓" : ""}</span>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: groupColor(g.name), flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                                {g.name}
                                {via && <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}> — 하위 {via.name} 경유</span>}
                            </span>
                            <button
                                className="ga-more icon-btn"
                                onClick={(e) => { e.stopPropagation(); setManage(opened ? null : { group: g.name, mode: "menu" }); }}
                                title="그룹 관리"
                                style={{ fontSize: 12, lineHeight: 1, padding: "0 2px" }}
                            >⋯</button>
                            <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 10.5, minWidth: 14, textAlign: "right" }}>{countOf(g.name) || ""}</span>
                        </div>
                        {opened && <ManageBlock group={g} manage={opened} setManage={setManage} gv={gv} busy={busy} run={run} dayGrain={dayGrain} pointGrain={pointGrain} />}
                    </div>
                );
            })}
            {createLabel && (
                <button
                    onClick={onCreate}
                    disabled={busy}
                    style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "3px 10px 5px", color: "var(--text-tertiary)", fontSize: 11.5, cursor: "pointer" }}
                >
                    <span style={{ width: 13 }} />{createLabel}
                </button>
            )}
        </div>
    );
}

/** ⋯ 인라인 관리 블록 — 개명·부모 지정·삭제(2단계). 팝오버 안에서 다 끝낸다(창·중첩 포털 없음). */
function ManageBlock({ group, manage, setManage, gv, busy, run, dayGrain, pointGrain }: {
    group: Group;
    manage: Manage;
    setManage: (m: Manage | null) => void;
    gv: ReturnType<typeof useGroups>;
    busy: boolean;
    run: (op: () => Promise<void>, keepManage?: boolean) => Promise<void>;
    dayGrain: ReadonlySet<string>;
    pointGrain: ReadonlySet<string>;
}): JSX.Element {
    const [newName, setNewName] = useState(group.name);
    const dayN = gv.countOf(group.name);
    const pointN = gv.pointCountOf(group.name);
    // 두 수는 뜻이 달라 **합산하지 않는다**(useGroups 규칙) — 있는 쪽만 이름 붙여 병기.
    const countLabel = [dayN > 0 ? `하루 ${dayN}` : null, pointN > 0 ? `타점 ${pointN}` : null].filter(Boolean).join(" · ");

    const wrap: React.CSSProperties = { margin: "1px 10px 4px 26px", padding: "4px 6px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-secondary)", display: "flex", flexDirection: "column", gap: 3 };
    const btn: React.CSSProperties = { textAlign: "left", padding: "2px 4px", fontSize: 11.5, color: "var(--text-secondary)", cursor: "pointer", borderRadius: 4 };

    if (manage.mode === "rename")
        return (
            <div style={wrap}>
                <TextInput
                    value={newName}
                    autoFocus
                    disabled={busy}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && newName.trim() && newName.trim() !== group.name)
                            void run(() => gv.renameGroup(group.name, newName.trim()));
                        if (e.key === "Escape") {
                            // 전파를 막아야 한다 — 안 막으면 document 의 useDismiss 가 같은 Esc 로 팝오버째 닫는다.
                            e.stopPropagation();
                            setManage(null);
                        }
                    }}
                    style={{ width: "100%", padding: "3px 6px", fontSize: 12 }}
                />
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Enter 개명 · Esc 취소 (소속은 유지된다)</span>
            </div>
        );

    if (manage.mode === "parent") {
        // grain 관례는 계층에도 적용된다 — 반대 grain 밑으로 넣으면 조상 롤업이 두 grain 을 섞어
        // 그 조상이 양쪽 섹션·필터에 동시에 서게 된다. 자기 grain 이 정해져 있으면 반대 grain 부모를 뺀다.
        const inDay = dayGrain.has(group.name);
        const inPoint = pointGrain.has(group.name);
        // 후보 부모의 grain 은 **조상 사슬까지** 본다 — 빈 중간 그룹을 경유하면(중간 자신은 어느 셋에도
        // 없다) 그 위의 반대 grain 조상 밑으로 섞여 들어가는 구멍이 생긴다.
        const chainHas = (set: ReadonlySet<string>, name: string): boolean =>
            set.has(name) || gv.ancestorsOf(name).some((a) => set.has(a.name));
        // 빈 그룹(양쪽 다 아님)·이미 혼합(양쪽 다 — 데이터 잔해)은 제약 없음 — 관례는 막되 수리는 막지 않는다.
        const grainOk = (p: string): boolean =>
            inDay === inPoint || (inDay ? !chainHas(pointGrain, p) : !chainHas(dayGrain, p));
        const candidates = gv.groups.filter((g) => canReparent(group.name, g.name, gv.groupByName) && grainOk(g.name));
        return (
            <div style={wrap}>
                {canReparent(group.name, null, gv.groupByName) && (
                    <button style={btn} disabled={busy} onClick={() => void run(() => gv.setParent(group.name, null))}>최상위로</button>
                )}
                {candidates.map((g) => (
                    <button key={g.name} style={btn} disabled={busy} title={gv.pathLabel(g.name, g.name)}
                        onClick={() => void run(() => gv.setParent(group.name, g.name))}>
                        {g.name} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>밑으로</span>
                    </button>
                ))}
                {candidates.length === 0 && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>넣을 수 있는 부모가 없습니다</span>}
            </div>
        );
    }

    if (manage.mode === "delete")
        return (
            <div style={wrap}>
                <button
                    style={{ ...btn, color: "var(--fall)", fontWeight: 700 }}
                    disabled={busy}
                    onClick={() => void run(() => gv.deleteGroup(group.name))}
                >
                    정말 삭제{countLabel ? ` — ${countLabel} 소속이 함께 지워진다` : ""}
                </button>
                <button style={btn} onClick={() => setManage({ group: group.name, mode: "menu" })}>취소</button>
            </div>
        );

    return (
        <div style={wrap}>
            <button style={btn} onClick={() => setManage({ group: group.name, mode: "rename" })}>개명</button>
            <button style={btn} onClick={() => setManage({ group: group.name, mode: "parent" })}>부모 지정…</button>
            <button style={{ ...btn, color: "var(--fall)" }} onClick={() => setManage({ group: group.name, mode: "delete" })}>
                삭제{countLabel ? ` (${countLabel})` : ""}
            </button>
        </div>
    );
}
