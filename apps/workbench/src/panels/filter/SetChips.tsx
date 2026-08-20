// 집합 칩 서랍 — 패널 **위에서 토글로 내려오는** 집합의 자리. 옛 오른쪽 사이드바(232px 상주)를
// 대신한다: 집합을 고르는 일은 가끔이고 보드는 늘 쓰는데, 목록이 상시 폭을 물고 있을 이유가 없었다.
//
//   · 붙박이 둘 — 전체(유니버스)·최종 생존(작업 깔때기). 이름 안 붙여도 늘 있다.
//   · 저장 집합 — 자립 저장물(이름+조건 사본+부위). 칩 클릭 = **선택 포인터**(연동 패널들이 따라온다).
//   · 저장/덮어쓰기 — 부위는 저장하는 순간의 시선에서: 칸을 짚었으면 그 칸, 아니면 생존자.
//   · 열기·삭제는 **우클릭 메뉴**다 — 칩마다 버튼을 달면 칩이 줄이 되고, 그럼 사이드바로 되돌아간다.
//
// 수(멤버 카운트)는 리졸버가 준다 — 칩의 수와 구독 패널의 분모가 같은 한 벌에서 나와야 한다.
// 붙박이 이름은 setRefLabel 한 곳에서 온다(헤더 상주 칩과 같은 출처 — 같은 것을 두 이름으로 부르지 않는다).
import { useState } from "react";
import { GazeChip } from "../../components/ControlChrome.js";
import { AnchoredPopover } from "../../ui/Dialog.js";
import { useWorkbench } from "../../store/workbench.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { FAIL } from "../../styles/palette.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { cellMeta } from "./cells.js";
import { useFunnel } from "./FunnelContext.js";
import { setRefLabel } from "./useSetBinding.js";
import { commitBtn, dashedBtn, listRow } from "./ui.js";

/**
 * 부위의 압축 표기 — 같은 조건에서 나온 형제(생존/칸)를 구분하는 유일한 표식이라 툴팁에 싣는다.
 * 칩 겉면에 배지로 달지 않는 이유: 칩 하나가 두 조각이 되면 줄이 되고, 그럼 사이드바로 되돌아간다.
 */
const partHint = (set: SavedSet): string =>
    set.part.kind === "survivors" ? "생존자" : `짚은 칸(${set.part.cells.map((c) => cellMeta(c).label).join("+")})`;

/** 집합 칩 하나의 표시 — 이름 + 수. 깨진 참조는 수 대신 —(모르는 것을 0 으로 적지 않는다). */
function chipLabel(name: string, count: { n: number; broken: boolean }): JSX.Element {
    return (
        <>
            {count.broken ? "⚠ " : ""}{name}
            <span style={{ marginLeft: 5, opacity: 0.62, fontVariantNumeric: "tabular-nums" }}>
                {count.broken ? "—" : count.n.toLocaleString("ko-KR")}
            </span>
        </>
    );
}

export function SetChipDrawer(): JSX.Element {
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

    /** 우클릭 메뉴 — 저장 집합에만 있다(붙박이는 열거나 지울 게 없다). */
    const [menu, setMenu] = useState<{ set: SavedSet; x: number; y: number } | null>(null);

    const selectedKey = selectedSetRef === null ? null : setRefKey(selectedSetRef);
    const opened = openedSetId === null ? undefined : savedSets.find((f) => f.id === openedSetId);
    const nothingToSave = v.active.length === 0;

    const countOf = (ref: SetRef): { n: number; broken: boolean } => {
        const r = v.resolveSet(ref);
        return { n: r.items.length, broken: r.broken };
    };
    // 칩 클릭 = 선택 토글 — 같은 칩을 다시 누르면 작업 깔때기로 돌아온다(선택은 시선이지 상태 전환이 아니다).
    const toggle = (ref: SetRef): void => selectSet(selectedKey === setRefKey(ref) ? null : ref);
    const isOn = (ref: SetRef): boolean => selectedKey === setRefKey(ref);

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

    const universeRef: SetRef = { kind: "universe" };
    const survivorsRef: SetRef = { kind: "survivors" };

    return (
        <div style={{
            flexShrink: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
            padding: "5px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)",
        }}>
            <GazeChip label={chipLabel(setRefLabel(universeRef, savedSets), countOf(universeRef))}
                active={isOn(universeRef)} onClick={() => toggle(universeRef)}
                title="유니버스 — 손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜)" />
            <GazeChip label={chipLabel(setRefLabel(survivorsRef, savedSets), countOf(survivorsRef))}
                active={isOn(survivorsRef)} onClick={() => toggle(survivorsRef)}
                title="작업 깔때기 — 지금 걸린 조건을 전부 통과한 것" />

            {savedSets.length > 0 && <Divider />}
            {savedSets.map((f) => {
                const ref: SetRef = { kind: "saved", setId: f.id };
                const count = countOf(ref);
                return (
                    <GazeChip key={f.id} label={chipLabel(f.name, count)} active={isOn(ref)}
                        onClick={() => toggle(ref)}
                        onContextMenu={(e) => { e.preventDefault(); setMenu({ set: f, x: e.clientX, y: e.clientY }); }}
                        title={count.broken
                            ? `${f.name} — 부위(짚은 칸)의 단계가 조건에서 사라져 깨졌습니다. 열어서 다시 저장하세요.`
                            : `${f.name} — ${partHint(f)} · 필터 ${f.stages.length}개 · ${count.n.toLocaleString("ko-KR")}건${openedSetId === f.id ? " · 보드에 열려 있음" : ""}\n클릭 = 이 집합 보기 · 우클릭 = 열기·삭제`} />
                );
            })}

            <Divider />
            <button onClick={promptSave} disabled={nothingToSave}
                title={nothingToSave
                    ? "걸린 필터가 없습니다 — 저장할 집합이 전체와 같습니다"
                    : "지금 조건이 사본으로 저장됩니다 — 이후 보드를 만져도 저장된 집합은 안 변합니다"}
                style={{ ...dashedBtn, color: nothingToSave ? "var(--text-tertiary)" : "var(--text-secondary)", cursor: nothingToSave ? "default" : "pointer" }}>
                + 저장: {selection ? "짚은 칸" : "생존자"}
            </button>
            {opened && (
                <button onClick={() => overwriteSet(opened.id)} disabled={nothingToSave}
                    title={nothingToSave
                        ? "걸린 필터가 없습니다 — 덮어쓰면 이 집합이 전체와 같아집니다"
                        : `열어 둔 집합 "${opened.name}" 에 지금 조건을 덮어씁니다 — 이 집합 하나만 바뀝니다(부위 유지)`}
                    style={{ ...commitBtn(!nothingToSave), maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    덮어쓰기: {opened.name}
                </button>
            )}

            <span style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 2 }}>
                {savedSets.length === 0
                    ? "조건을 걸고 저장하면 여기 칩으로 섭니다"
                    : "클릭 = 이 집합 보기 · 우클릭 = 열기·삭제"}
            </span>

            {menu && (
                <AnchoredPopover anchor={menu} onClose={() => setMenu(null)} minWidth={150} padding={0}>
                    <button style={listRow}
                        onClick={() => { openSet(menu.set.id); setMenu(null); }}
                        title="깔때기로 열기 — 조건 사본이 보드에 펼쳐집니다(저장물은 덮어쓰기 전까지 안 변함)">
                        보드에 열기
                    </button>
                    <button style={{ ...listRow, color: FAIL }}
                        onClick={() => {
                            if (confirm(`집합 "${menu.set.name}" 삭제 — 이 집합을 보고 있던 패널은 작업 깔때기로 돌아갑니다.`)) deleteSet(menu.set.id);
                            setMenu(null);
                        }}>
                        삭제
                    </button>
                </AnchoredPopover>
            )}
        </div>
    );
}

/** 칩 무리 사이의 세로 실선 — 붙박이·저장물·손짓이 다른 갈래임을 말한다(작업셋 칩 줄과 같은 표기). */
const Divider = (): JSX.Element => (
    <span style={{ flexShrink: 0, width: 1, alignSelf: "stretch", background: "var(--border-default)", margin: "0 3px" }} />
);
