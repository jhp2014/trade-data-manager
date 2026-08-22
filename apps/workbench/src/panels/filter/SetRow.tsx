// 집합 줄 — **집합을 고르는 유일한 자리**(머리글 바로 아래, 상시 한 줄). 옛 "상주 칩 + 위 서랍"을 대신한다.
//
// 왜 서랍이 아니라 줄인가: 서랍은 "지금 보는 집합"을 머리글 상주 칩이 따로 말해야 했다(접히면 답이
// 사라지니까). 줄이 늘 서 있으면 켜진 칩이 곧 그 답이라 같은 것을 두 자리에서 말하지 않는다. 한 줄은
// 가로 스크롤(ScrollRow)이고 자주 쓰는 집합만 고정해 두면 되므로 접을 이유도 없다(사용자 확정).
//
// 줄에 서는 것 = 붙박이 둘(전체·연동) + **고정한 집합** + (고정 안 했어도) 지금 고른 집합. 나머지는
// 줄 끝 **집합 관리** 판에 있다 — 작업셋 칩 줄의 visibleChips 규칙 그대로(선언 순서 고정).
//
// ⚠ 칩은 **고르는 일만** 한다(GazeChip 규약 — 우클릭 없음). 저장·열기·이름변경·덮어쓰기·삭제·고정은
// 전부 집합 관리 판 **하나**에 산다: 판이 둘이면 "핀은 저기, 삭제는 여기"를 외워야 한다.
// 브라우저 prompt/confirm 은 안 쓴다 — 같은 이름이면 저장 버튼이 그 자리에서 "덮어쓰기"로 바뀌고,
// 삭제는 2단계 버튼(삭제 → 정말 삭제)으로 받는다.
//
// 멤버 수는 칩에 안 적는다(사용자 확정) — 전체→생존은 막대 요약이, 보는 집합의 크기는 작업셋 상태
// 텍스트가 말한다. 칩은 이름만, 수는 툴팁에.
//
// 작업셋(작업 대상) 패널은 이 포인터를 **읽기만** 한다(상태 텍스트) — 고르는 손이 두 곳이면 어느 쪽이
// 조종석인지 흐려진다. 기준: 조건(집합을 낳는다)과 집합 고르기는 여기, 시선(월·존재)은 작업셋.
import { useState } from "react";
import { GazeChip } from "../../components/ControlChrome.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePersistedState } from "../../store/persist.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { FAIL, PIN } from "../../styles/palette.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { WorksetRowShell, visibleChips, type ChipItem } from "../WorksetChipRow.js";
import { cellMeta } from "./cells.js";
import { useFunnel } from "./FunnelContext.js";
import { linkedTargetLabel, setRefLabel } from "./useSetBinding.js";
import { textInput } from "./ui.js";

const PINS_KEY = "wb.funnel.setPins";
const parsePins = (o: unknown): string[] | null => (Array.isArray(o) ? o.filter((x): x is string => typeof x === "string") : null);

/** 부위의 압축 표기 — 같은 조건에서 나온 형제(생존/칸)를 구분하는 유일한 표식이라 툴팁에 싣는다. */
const partHint = (set: SavedSet): string =>
    set.part.kind === "survivors" ? "생존자" : `짚은 칸(${set.part.cells.map((c) => cellMeta(c).label).join("+")})`;

const smallBtn = (tone: "normal" | "accent" | "danger" = "normal", on = false): React.CSSProperties => ({
    flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 9.5, padding: "0 5px", borderRadius: 3, lineHeight: 1.6,
    border: `1px solid ${tone === "danger" ? FAIL : tone === "accent" || on ? "var(--accent-primary)" : "var(--border-default)"}`,
    background: on && tone !== "danger" ? "var(--accent-soft)" : "transparent",
    color: tone === "danger" ? FAIL : tone === "accent" || on ? "var(--accent-primary)" : "var(--text-tertiary)",
    fontWeight: on ? 700 : 400, whiteSpace: "nowrap",
});

export function SetRow(): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selectSet = useWorkbench((s) => s.selectSet);
    const selection = useWorkbench((s) => s.funnelSelection);
    const [pins, setPins] = usePersistedState<string[]>(PINS_KEY, parsePins, []);
    const togglePin = (id: string): void => setPins((p) => (p.includes(id) ? p.filter((k) => k !== id) : [...p, id]));

    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);
    const isOn = (ref: SetRef): boolean => selectedKey === setRefKey(ref);
    // 칩 클릭 = 선택 토글 — 같은 칩을 다시 누르면 연동으로 돌아온다(선택은 시선이지 상태 전환이 아니다).
    const toggle = (ref: SetRef): void => selectSet(isOn(ref) ? null : ref);
    const countOf = (ref: SetRef): string => {
        const r = v.resolveSet(ref);
        return r.broken ? "—" : `${r.items.length.toLocaleString("ko-KR")}건`;
    };

    const universeRef: SetRef = { kind: "universe" };
    const linkedRef: SetRef = selection
        ? { kind: "cell", stageId: selection.stageId, cells: selection.cells }
        : { kind: "survivors" };

    const savedItems: ChipItem[] = savedSets.map((f) => {
        const ref: SetRef = { kind: "saved", setId: f.id };
        const broken = v.resolveSet(ref).broken;
        return {
            key: f.id, label: broken ? `⚠ ${f.name}` : f.name, active: isOn(ref), color: PIN,
            title: broken
                ? `${f.name} — 부위(짚은 칸)의 단계가 조건에서 사라져 깨졌습니다. 집합 관리에서 열어 다시 저장하세요.`
                : `${f.name} — ${partHint(f)} · 필터 ${f.stages.length}개 · ${countOf(ref)}\n클릭 = 이 집합 보기(다시 누르면 연동)`,
            onClick: () => toggle(ref),
        };
    });
    const { shown, rest } = visibleChips(savedItems, pins, false);

    return (
        <WorksetRowShell label="집합"
            title={savedSets.length === 0 ? "조건을 걸고 집합 관리에서 저장하면 여기 칩으로 섭니다" : "칩 클릭 = 이 집합 보기 · 줄 끝 ⋯ = 집합 관리(저장·고정·열기·삭제)"}>
            <GazeChip label={setRefLabel(universeRef, savedSets)} active={isOn(universeRef)} color={PIN}
                onClick={() => toggle(universeRef)}
                title={`유니버스 — 손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 조건과 무관 · ${countOf(universeRef)}`} />
            <GazeChip label="연동" active={selectedSetRef === null} color={PIN}
                onClick={() => selectSet(null)}
                title={`이 보드를 따라간다 — 짚은 칸이 있으면 그 칸, 없으면 최종 생존, 조건이 없으면 전체
지금: ${linkedTargetLabel(selection !== null, v.active.length)} · ${countOf(linkedRef)}`} />
            {shown.length > 0 && <Divider />}
            {shown.map((it) => (
                <GazeChip key={it.key} label={it.label} active={it.active} color={PIN}
                    title={pins.includes(it.key) ? `${it.title} (고정됨)` : it.title} onClick={it.onClick} />
            ))}
            <HeaderPopover width={300} align="start" closeOnOutside
                trigger={(_open, toggleOpen) => (
                    <button onClick={toggleOpen}
                        title={`집합 관리 — 저장 · 고정 · 열기 · 이름변경 · 삭제${rest.length > 0 ? ` (줄에 없는 집합 ${rest.length}개)` : ""}`}
                        style={{
                            flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, padding: "1px 7px",
                            borderRadius: 9, border: "0.5px dashed var(--border-strong)", background: "transparent",
                            color: "var(--text-tertiary)", whiteSpace: "nowrap",
                        }}>
                        ⋯{rest.length > 0 ? ` ${rest.length}` : ""}
                    </button>
                )}>
                {(close) => <SetManager pins={pins} onTogglePin={togglePin} onPick={(ref) => { toggle(ref); close(); }} />}
            </HeaderPopover>
        </WorksetRowShell>
    );
}

/** 집합 관리 판 — 위는 저장(이름 입력), 아래는 저장 집합 목록(행마다 고정·열기·이름·덮어쓰기·삭제). */
function SetManager({ pins, onTogglePin, onPick }: {
    pins: readonly string[];
    onTogglePin: (id: string) => void;
    onPick: (ref: SetRef) => void;
}): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selection = useWorkbench((s) => s.funnelSelection);
    const saveSet = useWorkbench((s) => s.saveSet);
    const overwriteSet = useWorkbench((s) => s.overwriteSet);
    const openSet = useWorkbench((s) => s.openSet);
    const renameSet = useWorkbench((s) => s.renameSet);
    const deleteSet = useWorkbench((s) => s.deleteSet);
    const openedSetId = useWorkbench((s) => s.openedSetId);

    const [name, setName] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
    const [armedDelete, setArmedDelete] = useState<string | null>(null);

    const nothingToSave = v.active.length === 0;
    const trimmed = name.trim();
    const dup = trimmed !== "" && savedSets.some((x) => x.name === trimmed);
    const canSave = trimmed !== "" && !nothingToSave;
    const commitSave = (): void => {
        if (!canSave) return;
        saveSet(trimmed);
        setName("");
    };
    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);

    const sectionHead: React.CSSProperties = { padding: "4px 10px 3px", fontSize: 9.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" };

    return (
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "2px 0" }}>
            <div style={sectionHead}>
                집합 저장 — 지금 조건의 사본 · 부위 = {selection ? `짚은 칸(${selection.cells.map((c) => cellMeta(c).label).join("+")})` : "생존자"}
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 10px" }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={nothingToSave ? "걸린 필터가 없습니다" : "집합 이름"}
                    disabled={nothingToSave} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") commitSave(); }}
                    style={{ ...textInput, flex: 1, fontSize: 11.5 }} />
                <button onClick={commitSave} disabled={!canSave}
                    title={nothingToSave ? "걸린 필터가 없습니다 — 저장할 집합이 전체와 같습니다"
                        : dup ? `"${trimmed}" 이(가) 이미 있습니다 — 저장하면 그 집합의 조건과 부위가 지금 것으로 바뀝니다`
                            : "지금 조건이 사본으로 저장됩니다 — 이후 보드를 만져도 저장된 집합은 안 변합니다"}
                    style={{ ...smallBtn(canSave ? (dup ? "danger" : "accent") : "normal"), fontSize: 10.5, padding: "2px 8px", cursor: canSave ? "pointer" : "default" }}>
                    {dup ? "덮어쓰기" : "저장"}
                </button>
            </div>

            <div style={sectionHead}>저장 집합 {savedSets.length > 0 ? `${savedSets.length}개 · 고정 = 줄에 늘 선다` : "— 아직 없음"}</div>
            {savedSets.map((f) => {
                const ref: SetRef = { kind: "saved", setId: f.id };
                const active = selectedKey === setRefKey(ref);
                const pinned = pins.includes(f.id);
                const opened = openedSetId === f.id;
                const editing = renaming?.id === f.id;
                const r = v.resolveSet(ref);
                return (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px 2px 4px", background: active ? "var(--accent-soft)" : "transparent" }}>
                        {editing ? (
                            <input value={renaming.draft} autoFocus
                                onChange={(e) => setRenaming({ id: f.id, draft: e.target.value })}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") { renameSet(f.id, renaming.draft); setRenaming(null); }
                                    if (e.key === "Escape") setRenaming(null);
                                }}
                                onBlur={() => { renameSet(f.id, renaming.draft); setRenaming(null); }}
                                style={{ ...textInput, flex: 1, minWidth: 0, fontSize: 11.5, padding: "2px 6px" }} />
                        ) : (
                            <button onClick={() => onPick(ref)}
                                title={`${f.name} — ${partHint(f)} · 필터 ${f.stages.length}개 · ${r.broken ? "깨진 참조" : `${r.items.length.toLocaleString("ko-KR")}건`}${opened ? " · 보드에 열려 있음" : ""}\n클릭 = 이 집합 보기`}
                                style={{
                                    flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
                                    color: r.broken ? FAIL : "var(--text-primary)", padding: "3px 4px", cursor: "pointer",
                                    font: "inherit", fontSize: 11.5, fontWeight: active ? 700 : 400,
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                }}>
                                {r.broken ? "⚠ " : ""}{f.name}{opened ? <span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--accent-primary)" }}>열림</span> : null}
                            </button>
                        )}
                        <button onClick={() => onTogglePin(f.id)} aria-pressed={pinned} style={smallBtn("normal", pinned)}
                            title={pinned ? `${f.name} — 고정 해제(줄에서 내린다)` : `${f.name} — 줄에 고정(늘 선다)`}>고정</button>
                        <button onClick={() => openSet(f.id)} style={smallBtn()}
                            title="보드에 열기 — 조건 사본이 보드에 펼쳐집니다(저장물은 덮어쓰기 전까지 안 변함)">열기</button>
                        {opened && (
                            <button onClick={() => overwriteSet(f.id)} disabled={nothingToSave} style={{ ...smallBtn(nothingToSave ? "normal" : "accent"), cursor: nothingToSave ? "default" : "pointer" }}
                                title={nothingToSave ? "걸린 필터가 없습니다 — 덮어쓰면 이 집합이 전체와 같아집니다"
                                    : `"${f.name}" 에 지금 조건을 덮어씁니다 — 이 집합 하나만 바뀝니다(부위·이름 유지)`}>덮어쓰기</button>
                        )}
                        <button onClick={() => setRenaming({ id: f.id, draft: f.name })} style={smallBtn()} title="이름 바꾸기">이름</button>
                        {armedDelete === f.id ? (
                            <button onClick={() => { deleteSet(f.id); setArmedDelete(null); }} style={smallBtn("danger", true)}
                                title="정말 삭제 — 이 집합을 보고 있던 패널은 작업 깔때기로 돌아갑니다">정말 삭제</button>
                        ) : (
                            <button onClick={() => setArmedDelete(f.id)} style={smallBtn("danger")} title="삭제(한 번 더 눌러 확정)">삭제</button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** 칩 무리 사이의 세로 실선 — 붙박이·저장물이 다른 갈래임을 말한다. */
const Divider = (): JSX.Element => (
    <span style={{ flexShrink: 0, width: 1, alignSelf: "stretch", background: "var(--border-default)", margin: "0 3px" }} />
);
