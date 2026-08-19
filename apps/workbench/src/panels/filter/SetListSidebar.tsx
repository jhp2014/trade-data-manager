// 집합 목록 — 필터 패널의 오른쪽 기둥. **집합의 저자는 필터 패널 하나**라는 재편의 물리적 자리다:
// 여기서 저장(게시)·선택·열기·덮어쓰기·삭제가 전부 일어나고, 다른 패널들은 이 목록을 구독만 한다.
//
//   · 붙박이 둘 — 전체(유니버스)·최종 생존(작업 깔때기). 이름 안 붙여도 늘 있다.
//   · 저장 집합 — 자립 저장물(이름+조건 사본+부위). 행 클릭 = **선택 포인터**(연동 패널들이 따라온다).
//   · 저장 버튼 — 부위는 저장하는 순간의 시선에서: 칸을 짚었으면 그 칸, 아니면 생존자.
//   · 열기 → 보드(활성 슬롯 사본) → **덮어쓰기**를 눌러야 저장물이 실제로 바뀐다(그 집합 하나만).
//
// 수(멤버 카운트)는 리졸버가 준다 — 목록의 수와 구독 패널의 분모가 같은 한 벌에서 나와야 한다.
import { useMemo, type ReactNode } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { ACTIVE, FAIL } from "../../styles/palette.js";
import { cellMeta } from "./cells.js";
import { useFunnel } from "./FunnelContext.js";
import type { SavedSet } from "../../store/filterFunnelSlice.js";

export const SET_LIST_W = 232;

export function SetListSidebar(): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selectSet = useWorkbench((s) => s.selectSet);
    const saveSet = useWorkbench((s) => s.saveSet);
    const overwriteSet = useWorkbench((s) => s.overwriteSet);
    const openSet = useWorkbench((s) => s.openSet);
    const deleteSet = useWorkbench((s) => s.deleteSet);
    const openedSetId = useWorkbench((s) => s.openedSetId);
    const selection = useWorkbench((s) => s.funnelSelection);

    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);
    const opened = openedSetId === null ? undefined : savedSets.find((f) => f.id === openedSetId);

    // 행 클릭 = 선택 토글 — 같은 행을 다시 누르면 작업 깔때기로 돌아온다(선택은 시선이지 상태 전환이 아니다).
    const toggle = (ref: SetRef): void => selectSet(selectedKey === setRefKey(ref) ? null : ref);

    /** 저장 손짓 — 이름을 받고 게시한다. 같은 이름 = 엎어쓰기(saveSet 규칙)라, 덮이기 전에 확인을 받는다. */
    const promptSave = (): void => {
        const name = prompt(
            selection
                ? `짚은 칸(${selection.cells.map((c) => cellMeta(c).label).join("+")})을 집합으로 저장 — 이름:`
                : "생존자를 집합으로 저장 — 이름:",
        )?.trim();
        if (!name) return;
        // 같은 이름은 새 항목이 아니라 그 집합의 교체다 — 조건 사본과 부위가 전부 지금 것으로 갈린다.
        if (savedSets.some((x) => x.name === name)
            && !confirm(`집합 "${name}" 이(가) 이미 있습니다 — 저장하면 그 집합의 조건과 부위가 지금 것으로 바뀝니다. 덮어쓸까요?`)) return;
        saveSet(name);
    };

    const counts = useMemo(() => {
        const of = (ref: SetRef): { n: number; broken: boolean } => {
            const r = v.resolveSet(ref);
            return { n: r.items.length, broken: r.broken };
        };
        return { of };
    }, [v]);

    return (
        <div style={{
            width: SET_LIST_W, flex: "none", borderLeft: "1px solid var(--border-strong)",
            display: "flex", flexDirection: "column", minHeight: 0, fontSize: 11, background: "var(--bg-primary)",
        }}>
            <div style={{
                padding: "6px 10px", borderBottom: "1px solid var(--border-default)", fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "baseline", gap: 6,
            }}>
                집합
                <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text-tertiary)" }}>클릭 = 연동 패널이 본다</span>
            </div>

            {/* 저장(게시) — 부위는 시선에서 온다. 조건이 없으면 생존자 = 전체라 저장할 게 없다. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "7px 10px", borderBottom: "1px solid var(--border-default)" }}>
                <SaveButton onClick={promptSave} disabled={v.active.length === 0}
                    title={v.active.length === 0 ? "걸린 필터가 없습니다 — 저장할 집합이 전체와 같습니다" : "지금 조건이 사본으로 저장됩니다 — 이후 보드를 만져도 저장된 집합은 안 변합니다"}>
                    {selection ? "짚은 칸을 집합으로 저장…" : "생존자를 집합으로 저장…"}
                </SaveButton>
                {opened && (
                    <SaveButton onClick={() => overwriteSet(opened.id)} tone="warn" disabled={v.active.length === 0}
                        title={v.active.length === 0
                            ? "걸린 필터가 없습니다 — 덮어쓰면 이 집합이 전체와 같아집니다"
                            : `열어 둔 집합 "${opened.name}" 에 지금 조건을 덮어씁니다 — 이 집합 하나만 바뀝니다(부위 유지)`}>
                        덮어쓰기: {opened.name}
                    </SaveButton>
                )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {/* 붙박이 — 이름 없는 상수 집합 둘. */}
                <SetRow label="전체" hint="유니버스" count={counts.of({ kind: "universe" })}
                    active={selectedKey === setRefKey({ kind: "universe" })}
                    onClick={() => toggle({ kind: "universe" })} />
                <SetRow label="최종 생존" hint="작업 깔때기" count={counts.of({ kind: "survivors" })}
                    active={selectedKey === setRefKey({ kind: "survivors" })}
                    onClick={() => toggle({ kind: "survivors" })} />

                {savedSets.length > 0 && (
                    <div style={{ padding: "7px 10px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>저장한 집합</div>
                )}
                {savedSets.map((f) => (
                    <SavedRow key={f.id} set={f} opened={openedSetId === f.id}
                        count={counts.of({ kind: "saved", setId: f.id })}
                        active={selectedKey === setRefKey({ kind: "saved", setId: f.id })}
                        onClick={() => toggle({ kind: "saved", setId: f.id })}
                        onOpen={() => openSet(f.id)}
                        onDelete={() => { if (confirm(`집합 "${f.name}" 삭제 — 이 집합에 고정된 패널은 깨진 참조가 됩니다.`)) deleteSet(f.id); }} />
                ))}
                {savedSets.length === 0 && (
                    <div style={{ padding: "10px 10px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                        저장한 집합이 없습니다.<br />조건을 걸고 위 버튼으로 게시하면, 다른 패널이 이 목록에서 골라 봅니다.
                    </div>
                )}
            </div>
        </div>
    );
}

/** 부위 배지 — 같은 조건에서 나온 형제(생존/칸)를 목록에서 구분하는 유일한 표식. */
function partBadge(set: SavedSet): { text: string; title: string } {
    if (set.part.kind === "survivors") return { text: "생존자", title: "전 필터 통과" };
    const cells = set.part.cells.map((c) => cellMeta(c).label).join("+");
    return { text: cells, title: `저장 당시 짚은 칸: ${cells}` };
}

function SavedRow({ set, count, active, opened, onClick, onOpen, onDelete }: {
    set: SavedSet;
    count: { n: number; broken: boolean };
    active: boolean;
    opened: boolean;
    onClick: () => void;
    onOpen: () => void;
    onDelete: () => void;
}): JSX.Element {
    const badge = partBadge(set);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 6, borderBottom: "1px solid var(--border-subtle)" }}>
            <button onClick={onClick}
                title={count.broken
                    ? `${set.name} — 부위(짚은 칸)의 단계가 조건에서 사라져 깨졌습니다. 열어서 다시 저장하세요.`
                    : `${set.name} — 필터 ${set.stages.length}개 · ${count.n.toLocaleString("ko-KR")}건${opened ? " · 보드에 열려 있음" : ""}`}
                style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                    border: "none", background: active ? "var(--accent-soft)" : "transparent", cursor: "pointer",
                    padding: "4px 6px 4px 10px", font: "inherit", fontSize: 11.5,
                    color: count.broken ? FAIL : active ? ACTIVE : "var(--text-primary)", fontWeight: active ? 600 : 400,
                }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {count.broken ? "⚠ " : ""}{set.name}
                </span>
                <span title={badge.title} style={{
                    flexShrink: 0, fontSize: 9, border: "1px solid var(--border-default)", borderRadius: 3,
                    padding: "0 4px", color: "var(--text-tertiary)", fontWeight: 400,
                }}>{badge.text}</span>
                <span style={{ marginLeft: "auto", flexShrink: 0, color: active ? ACTIVE : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>
                    {count.broken ? "—" : count.n.toLocaleString("ko-KR")}
                </span>
            </button>
            <RowAction onClick={onOpen} title="깔때기로 열기 — 조건 사본이 보드에 펼쳐집니다(저장물은 덮어쓰기 전까지 안 변함)">열기</RowAction>
            <RowAction onClick={onDelete} title="이 집합 삭제" color={FAIL}>✕</RowAction>
        </div>
    );
}

function SetRow({ label, hint, count, active, onClick }: {
    label: string;
    hint: string;
    count: { n: number; broken: boolean };
    active: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button onClick={onClick} title={`${label} — ${count.n.toLocaleString("ko-KR")}건`}
            style={{
                display: "flex", width: "100%", alignItems: "center", gap: 6, textAlign: "left",
                border: "none", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer",
                background: active ? "var(--accent-soft)" : "transparent",
                padding: "4px 10px", font: "inherit", fontSize: 11.5,
                color: active ? ACTIVE : "var(--text-primary)", fontWeight: active ? 600 : 400,
            }}>
            <span>{label}</span>
            <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontWeight: 400 }}>{hint}</span>
            <span style={{ marginLeft: "auto", color: active ? ACTIVE : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>
                {count.n.toLocaleString("ko-KR")}
            </span>
        </button>
    );
}

function RowAction({ onClick, title, color, children }: {
    onClick: () => void; title: string; color?: string; children: ReactNode;
}): JSX.Element {
    return (
        <button onClick={onClick} title={title}
            style={{
                flexShrink: 0, border: "none", background: "transparent", cursor: "pointer",
                font: "inherit", fontSize: 10, padding: "2px 3px", color: color ?? "var(--text-tertiary)",
            }}>
            {children}
        </button>
    );
}

function SaveButton({ onClick, disabled = false, tone, title, children }: {
    onClick: () => void; disabled?: boolean; tone?: "warn"; title: string; children: ReactNode;
}): JSX.Element {
    return (
        <button onClick={onClick} disabled={disabled} title={title}
            style={{
                border: `1px solid ${tone === "warn" ? "var(--accent-primary)" : "var(--border-default)"}`,
                borderRadius: 4, background: "transparent", cursor: disabled ? "default" : "pointer",
                font: "inherit", fontSize: 11, padding: "3px 8px", textAlign: "left",
                color: disabled ? "var(--text-tertiary)" : tone === "warn" ? "var(--accent-primary)" : "var(--text-primary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
            {children}
        </button>
    );
}
