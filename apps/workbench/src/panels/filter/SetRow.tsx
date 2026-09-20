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
// 멤버 수는 칩에 안 적는다(사용자 확정) — 전체→생존은 머리글이, 보는 집합의 크기는 작업셋 상태
// 텍스트가 말한다. 칩은 이름만, 수는 툴팁에.
//
// 작업셋(작업 대상) 패널은 이 포인터를 **읽기만** 한다(상태 텍스트) — 고르는 손이 두 곳이면 어느 쪽이
// 조종석인지 흐려진다. 기준: 조건(집합을 낳는다)과 집합 고르기는 여기, 시선(월·존재)은 작업셋.
import { useState } from "react";
import { InlineRename } from "../../ui/InlineRename.js";
import { GazeChip } from "../../components/ControlChrome.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { selectFilterUniverse, useWorkbench } from "../../store/workbench.js";
import { usePersistedState } from "../../store/persist.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { FAIL, PIN } from "../../styles/palette.js";
import { WorksetRowShell, visibleChips, type ChipItem } from "../WorksetChipRow.js";
import { useFunnel } from "./FunnelContext.js";
import type { ResolvedSet } from "./resolveSet.js";
import { effectiveUniverse, UNIVERSE_LABEL } from "./universe.js";
import { leafCount, refsOf } from "./expr.js";
import { setDisplayName } from "./label.js";
import { linkedTargetLabel, setRefLabel } from "./useSetBinding.js";
import { textInput } from "./ui.js";

const PINS_KEY = "wb.funnel.setPins";
const parsePins = (o: unknown): string[] | null => (Array.isArray(o) ? o.filter((x): x is string => typeof x === "string") : null);

/**
 * 건수 표기 한 곳 — 칩 줄과 관리 판이 **같은 말**을 해야 한다(두 자리가 다른 수를 적으면 어느 쪽이
 * 진짜냐가 생긴다). 이 리졸버는 **종단 집합만** 푼다 — 하루 집합의 건수는 여기서 셀 수 없다(날짜가
 * 있어야 하고 평가가 5.7초다). "0건"이라고 적으면 조건이 아무것도 못 걸었다는 거짓말이 된다.
 */
const countLabel = (r: ResolvedSet): string =>
    r.otherUniverse ? "하루 · 셀" : r.broken ? "—" : `${r.items.length.toLocaleString("ko-KR")}건`;

const sectionHead: React.CSSProperties = { padding: "4px 10px 3px", fontSize: 9.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" };

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
    const [pins, setPins] = usePersistedState<string[]>(PINS_KEY, parsePins, []);
    const togglePin = (id: string): void => setPins((p) => (p.includes(id) ? p.filter((k) => k !== id) : [...p, id]));

    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);
    const isOn = (ref: SetRef): boolean => selectedKey === setRefKey(ref);
    // 칩 클릭 = 선택 토글 — 같은 칩을 다시 누르면 연동으로 돌아온다(선택은 시선이지 상태 전환이 아니다).
    const toggle = (ref: SetRef): void => selectSet(isOn(ref) ? null : ref);
    const countOf = (ref: SetRef): string => countLabel(v.resolveSet(ref));

    const universeRef: SetRef = { kind: "universe" };
    const linkedRef: SetRef = { kind: "survivors" };

    const savedItems: ChipItem[] = savedSets.map((f) => {
        const ref: SetRef = { kind: "saved", setId: f.id };
        const nm = setDisplayName(f, v.labelLook);
        // ⚠ 표식이 없는 이유: 저장 집합의 깨짐은 **집합이 없을 때**뿐인데(resolveSaved) 이 목록은
        // savedSets 를 도므로 늘 존재한다. 깨진 참조를 말하는 자리는 패널 바인딩과 조립 부품 줄이다.
        return {
            key: f.id, label: nm, active: isOn(ref), color: PIN,
            title: `${nm} — 조건 ${leafCount(f.expr)}개 · ${countOf(ref)}\n클릭 = 이 집합 보기(다시 누르면 연동)`,
            onClick: () => toggle(ref),
        };
    });
    const { shown, rest } = visibleChips(savedItems, pins, false);

    return (
        <WorksetRowShell label="집합"
            title={savedSets.length === 0 ? "조건을 걸고 집합 관리에서 저장하면 여기 칩으로 섭니다" : "칩 클릭 = 이 집합 보기 · 줄 끝 ⋯ = 집합 관리(저장·고정·열기·삭제)"}>
            <GazeChip label={setRefLabel(universeRef, savedSets, v.labelLook)} active={isOn(universeRef)} color={PIN}
                onClick={() => toggle(universeRef)}
                title={`유니버스 — 손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 조건과 무관 · ${countOf(universeRef)}`} />
            <GazeChip label="연동" active={selectedSetRef === null} color={PIN}
                onClick={() => selectSet(null)}
                title={`이 보드를 따라간다 — 조건이 있으면 최종 생존, 없으면 전체
지금: ${linkedTargetLabel(v.viewOf(null).isFiltering)} · ${countOf(linkedRef)}`} />
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

/**
 * 목록의 구획 — **쓰는 곳**으로 가른다(2026-09-20). 숨기는 게 아니라 나누기만 한다.
 * 0 칸이 청소 창구고, 2+ 칸이 "고치면 여럿이 같이 바뀐다"를 미리 말한다.
 */
const SECTIONS: readonly { key: string; title: string; has: (n: number) => boolean }[] = [
    { key: "shared", title: "여럿이 쓰는 집합 — 고치면 같이 바뀝니다 ·", has: (n) => n >= 2 },
    { key: "one", title: "한 곳에서 쓰는 집합 ·", has: (n) => n === 1 },
    { key: "free", title: "아무도 안 쓰는 집합 — 지워도 안전합니다 ·", has: (n) => n === 0 },
];

/** 집합 관리 판 — 위는 ＋ 새 집합, 아래는 집합 목록(쓰는 곳으로 구획, 행마다 고정·편집·이름·삭제). */
function SetManager({ pins, onTogglePin, onPick }: {
    pins: readonly string[];
    onTogglePin: (id: string) => void;
    onPick: (ref: SetRef) => void;
}): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const editSet = useWorkbench((s) => s.editSet);
    const createSet = useWorkbench((s) => s.createSet);
    const renameSet = useWorkbench((s) => s.renameSet);
    const deleteSet = useWorkbench((s) => s.deleteSet);
    const editingSetId = useWorkbench((s) => s.editingSetId);
    // 우주는 **파생**이다 — 고르는 토글도, 우주를 넘기는 ⧉ 복제도 없다(2026-09-19 9단계).
    const setUniverse = effectiveUniverse(useWorkbench(selectFilterUniverse));

    /** 쓰는 곳 — 이 집합을 참조하는 저장 집합 수. 구획과 배지가 같은 자를 쓴다. */
    const usedByOf = (id: string): number => savedSets.filter((x) => refsOf(x.expr).includes(id)).length;
    const [renaming, setRenaming] = useState<string | null>(null); // 이름 편집 중인 집합 id — draft 는 InlineRename 이 든다
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);

    return (
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "2px 0" }}>
            {/* 「저장」 버튼이 없다 — **편집이 곧 저장**이다(2026-09-20). 새 집합을 만드는 손만 남는다. */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 10px" }}>
                <button onClick={() => createSet()} style={{ ...smallBtn("accent"), fontSize: 10.5, padding: "2px 8px" }}
                    title="빈 집합을 만들고 그걸 편집합니다 — 이름은 나중에 붙여도 됩니다(그때까지 자동 이름)">＋ 새 집합</button>
            </div>

            {/* ⚠ **구획만 나눈다 — 숨기지 않는다.** 안 보이는 내부 집합을 두면 익명 묶음이 이름만 바꿔
                돌아온다(2026-09-19 기각분이 예고한 함정). 쓰는 곳 0 칸이 자연스러운 청소 창구다. */}
            {SECTIONS.map(({ key, title, has }) => {
                const rows = savedSets.filter((f) => has(usedByOf(f.id)));
                if (rows.length === 0) return null;
                return (
                    <div key={key}>
                        <div style={sectionHead}>{title} {rows.length}개</div>
                        {rows.map(renderRow)}
                    </div>
                );
            })}
        </div>
    );

    function renderRow(f: SavedSet): JSX.Element {
                const ref: SetRef = { kind: "saved", setId: f.id };
                const active = selectedKey === setRefKey(ref);
                const pinned = pins.includes(f.id);
                const opened = editingSetId === f.id;
                const editing = renaming === f.id;
                const r = v.resolveSet(ref);
                const nm = setDisplayName(f, v.labelLook);
                const other = f.universe !== setUniverse; // 다른 우주 — 숨기지 않고 회색 + 뱃지
                return (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px 2px 4px", background: active ? "var(--accent-soft)" : "transparent" }}>
                        {editing ? (
                            <InlineRename initial={f.name ?? ""}
                                onCommit={(nm) => { renameSet(f.id, nm); setRenaming(null); }}
                                onCancel={() => setRenaming(null)}
                                style={{ ...textInput, flex: 1, minWidth: 0, fontSize: 11.5, padding: "2px 6px" }} />
                        ) : (
                            <button onClick={() => onPick(ref)}
                                title={`${nm} — 조건 ${leafCount(f.expr)}개 · ${countLabel(r)}${opened ? " · 보드에 열려 있음" : ""}\n클릭 = 이 집합 보기`}
                                style={{
                                    flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
                                    color: "var(--text-primary)", padding: "3px 4px", cursor: "pointer",
                                    font: "inherit", fontSize: 11.5, fontWeight: active ? 700 : 400,
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                }}>
                                {nm}{opened ? <span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--accent-primary)" }}>열림</span> : null}
                            </button>
                        )}
                        <button onClick={() => onTogglePin(f.id)} aria-pressed={pinned} style={smallBtn("normal", pinned)}
                            title={pinned ? `${nm} — 고정 해제(줄에서 내린다)` : `${nm} — 줄에 고정(늘 선다)`}>고정</button>
                        {/* 편집 = 저장이라 「열기」와 「덮어쓰기」가 한 손으로 합쳐졌다 — 누르면 그 집합을
                            바로 고치기 시작한다(사본을 안 뜬다). 다른 우주 집합도 숨기지 않는다. */}
                        <button onClick={() => editSet(f.id)} disabled={opened} style={smallBtn(opened ? "accent" : "normal", opened)}
                            title={opened ? "지금 편집 중입니다"
                                : other
                                    ? `다른 우주(${UNIVERSE_LABEL[f.universe]})의 집합입니다 — 편집하면 우주도 그 조건을 따라갑니다`
                                    : "이 집합을 편집합니다 — 고치는 즉시 저장됩니다"}>편집</button>
                        <button onClick={() => setRenaming(f.id)} style={smallBtn()} title="이름 바꾸기">이름</button>
                        {armedDelete === f.id ? (
                            <button onClick={() => { deleteSet(f.id); setArmedDelete(null); }} style={smallBtn("danger", true)}
                                title="정말 삭제 — 이 집합을 참조하던 식에는 깨진 참조가 표식을 달고 남습니다">정말 삭제</button>
                        ) : (
                            <button onClick={() => setArmedDelete(f.id)} style={smallBtn("danger")} title="삭제(한 번 더 눌러 확정)">삭제</button>
                        )}
                    </div>
        );
    }
}

/** 칩 무리 사이의 세로 실선 — 붙박이·저장물이 다른 갈래임을 말한다. */
const Divider = (): JSX.Element => (
    <span style={{ flexShrink: 0, width: 1, alignSelf: "stretch", background: "var(--border-default)", margin: "0 3px" }} />
);
