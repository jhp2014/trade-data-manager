// 집합 줄 — **줄 쌓임의 맨 위(줄 0)**. 지금 열려 있는 집합 하나가 서고, 목록은 그 칩의 판(`▾`) 안에 있다.
//
// ## 왜 목록이 아니라 칩 하나인가 (2026-09-22)
// 아래 드릴다운 줄들과 **모양이 같은데 뜻이 다른 줄**이 두 개 쌓이는 것이 문제였다: 위는 "집합 고르기",
// 아래는 "조건"인데 둘 다 칩 줄이고, 우클릭 메뉴까지 다르다(위는 이름/삭제, 아래는 NOT/괄호).
// 칩 하나면 줄 쌓임의 규칙("위 줄의 열린 칩이 아랫줄의 이름")이 **맨 위까지 그대로** 연장된다 —
// 줄 0 의 칩이 줄 1 의 이름이고, 그게 곧 경로의 뿌리이자 구독 패널이 보는 것이다.
//
// ⚠ **줄 0 은 테두리만 액센트**다. 채움(`--accent-primary`)은 "내려가서 열려 있다" 전용으로 예약한다
// (ExprRow 의 `openChip`) — 그래야 `▾`(목록 펼치기)와 `▼`(내려간 상태)가 색으로도 갈린다.
//
// ## 여기 없는 것들
//  · **「전체」·「연동」 붙박이 칩** — 선택 포인터가 죽으면서 같이 갔다. 조건이 0이면 「연동」이 곧
//    전량이라 같은 수를 두 자리가 적고 있었다.
//  · **줄 고정(핀)** — 줄에 칩이 하나뿐이라 고정할 것이 없다.
//  · **「보기」** — 「열기」 하나다. 열면 그게 뿌리가 되고 구독 패널이 전부 따라온다.
//
// ⚠ 판은 **지금 모드의 집합만** 세운다(+ 지금 자리는 늘). 모드가 장부를 가른다(2026-09-22).
import { useMemo, useState } from "react";
import { InlineRename } from "../../ui/InlineRename.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { selectObservedSetId, useWorkbench } from "../../store/workbench.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { FAIL } from "../../styles/palette.js";
import { LinkIcon, PencilIcon, TrashIcon } from "../../components/icons.js";
import { useFunnel } from "./FunnelContext.js";
import type { ResolvedSet } from "./resolveSet.js";
import { UNIVERSE_LABEL } from "./universe.js";
import { leafCount, refsOf } from "./expr.js";
import { setDisplayName } from "./label.js";
import { textInput } from "./ui.js";

/**
 * 건수 표기 한 곳 — 줄과 관리 판이 **같은 말**을 해야 한다(두 자리가 다른 수를 적으면 어느 쪽이
 * 진짜냐가 생긴다). 이 리졸버는 **종단 집합만** 푼다 — 하루 집합의 건수는 여기서 셀 수 없다(날짜가
 * 있어야 한다). "0건"이라고 적으면 조건이 아무것도 못 걸었다는 거짓말이 된다.
 */
const countLabel = (r: ResolvedSet): string =>
    r.otherUniverse ? "하루 · 셀" : r.broken ? "—" : `${r.items.length.toLocaleString("ko-KR")}건`;

const smallBtn = (tone: "normal" | "accent" | "danger" = "normal", on = false): React.CSSProperties => ({
    flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 9.5, padding: "0 5px", borderRadius: 3, lineHeight: 1.6,
    border: `1px solid ${tone === "danger" ? FAIL : tone === "accent" || on ? "var(--accent-primary)" : "var(--border-default)"}`,
    background: on && tone !== "danger" ? "var(--accent-soft)" : "transparent",
    color: tone === "danger" ? FAIL : tone === "accent" || on ? "var(--accent-primary)" : "var(--text-tertiary)",
    fontWeight: on ? 700 : 400, whiteSpace: "nowrap",
});

/** 줄 0 의 칩 — **테두리만** 액센트(채움은 드릴다운 열림 전용). 높이는 ExprRow 와 같은 결. */
const rootChip: React.CSSProperties = {
    flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 12, padding: "2px 9px", borderRadius: 4,
    border: "1px solid var(--accent-primary)", background: "transparent", color: "var(--accent-primary)",
    whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis",
};

export function SetRow(): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const observedId = useWorkbench(selectObservedSetId);
    const mode = useWorkbench((s) => s.filterMode);

    const observed = savedSets.find((x) => x.id === observedId);
    const name = observed
        ? setDisplayName(observed, v.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)")
        : "(지워진 집합)";
    const count = observed ? countLabel(v.resolveSet(observed.id)) : "—";

    return (
        <div style={{ display: "flex", alignItems: "center", height: 30, padding: "0 8px", flexShrink: 0 }}>
            <HeaderPopover width={320} align="start" closeOnOutside
                trigger={(open, toggleOpen) => (
                    <button onClick={toggleOpen} style={rootChip}
                        title={`집합 목록 — ${name} · 조건 ${observed ? leafCount(observed.expr) : 0}개 · ${count}\n누르면 ${UNIVERSE_LABEL[mode]} 집합만 섭니다`}>
                        {name} {open ? "▴" : "▾"}
                    </button>
                )}>
                {(close) => <SetManager onClose={close} />}
            </HeaderPopover>
        </div>
    );
}

/**
 * 목록 정렬 — **한 목록**(2026-09-25, 옛 "쓰는 곳 0/1/2+ 구획"을 개정): 열린 집합 → 손 이름 → 자동 이름(묶음).
 * 쓰는 곳은 구획이 아니라 줄 끝 **정보**(🔗N — 비어 있음 = 아무도 안 씀)다. 구획 머리 두 줄이 서너 개짜리 목록만큼
 * 자리를 먹었다(사용자). 자동 이름 묶음이 불어나도 손 이름 집합이 위에 선다(옛 "전용 부품 기본 접힘"의 몫).
 * "열린" = **뿌리**(관측 집합)다 — 드릴인 중 편집 대상인 묶음은 뿌리가 아니라 자동 이름 무리에 선다(의도: 이 판은
 * 뿌리를 고르는 곳이고, 묶음 안으로는 식 줄이 데려간다).
 */
export function orderSets<T extends { id: string; name?: string }>(sets: readonly T[], openedId: string): T[] {
    const rank = (f: T): number => (f.id === openedId ? 0 : f.name !== undefined ? 1 : 2);
    return sets.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);
}

const iconBtn = (danger = false): React.CSSProperties => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 18,
    border: "none", borderRadius: 3, background: "transparent", cursor: "pointer", padding: 0,
    color: danger ? FAIL : "var(--text-tertiary)",
});

/** 집합 관리 판 — 위는 ＋ 새 집합, 아래는 **지금 모드의** 집합 한 목록(행 = 열기 · 🔗쓰는 곳 · hover 에 ✎·🗑). */
function SetManager({ onClose }: { onClose: () => void }): JSX.Element {
    const v = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const editSet = useWorkbench((s) => s.editSet);
    const createSet = useWorkbench((s) => s.createSet);
    const renameSet = useWorkbench((s) => s.renameSet);
    const deleteSet = useWorkbench((s) => s.deleteSet);
    const observedId = useWorkbench(selectObservedSetId);
    const editingSetId = useWorkbench((s) => s.editingSetId);
    const mode = useWorkbench((s) => s.filterMode);

    /**
     * 이 모드의 집합들 — **지금 자리는 늘 낀다**(완충).
     * ⚠ `persistSavedSets` 의 재조정이 파생 우주로 저장값을 덮으므로, 레일 주입·옛 저장물·참조 승계로
     *   편집 중인 집합의 우주가 뒤집히면 **목록에서 증발**한다. 자리만은 보이는 편이 정직하다.
     */
    const mine = useMemo(
        () => orderSets(savedSets.filter((f) => f.universe === mode || f.id === observedId || f.id === editingSetId), observedId),
        [savedSets, mode, observedId, editingSetId],
    );

    /** 쓰는 곳 — 이 집합을 참조하는 저장 집합 수. 줄 끝 🔗 와 삭제 확인이 같은 자를 쓴다. */
    const usedByOf = (id: string): number => savedSets.filter((x) => refsOf(x.expr).includes(id)).length;
    const [renaming, setRenaming] = useState<string | null>(null); // 이름 편집 중인 집합 id — draft 는 InlineRename 이 든다
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    /**
     * 손잡이(✎·🗑)가 서는 줄 — hover 또는 포커스가 안에 있는 줄에만(늘 떠 있으면 눈이 분산된다). 버튼은 DOM 에 늘
     * 있고 흐리기만 한다. ⚠ 둘을 **따로** 든다 — 한 값으로 합치면 마우스가 떠난 줄에 키보드 포커스가 투명한 버튼
     * 위에 남는다.
     */
    const [hovered, setHovered] = useState<string | null>(null);
    const [focused, setFocused] = useState<string | null>(null);

    return (
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "2px 0" }}>
            {/* 「저장」 버튼이 없다 — **편집이 곧 저장**이다(2026-09-20). 새 집합을 만드는 손만 남는다. */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                <button onClick={() => { createSet(); onClose(); }} style={{ ...smallBtn("accent"), fontSize: 10.5, padding: "2px 8px" }}
                    title={`${UNIVERSE_LABEL[mode]} 빈 집합을 만들고 그걸 엽니다 — 이름은 나중에 붙여도 됩니다(그때까지 자동 이름)`}>＋ 새 집합</button>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{UNIVERSE_LABEL[mode]} 집합만</span>
            </div>

            {/* ⚠ **숨기지 않는다.** 안 보이는 내부 집합을 두면 익명 묶음이 이름만 바꿔 돌아온다
                (2026-09-19 기각분이 예고한 함정). 🔗 가 없는 줄이 자연스러운 청소 창구다. */}
            {mine.map(renderRow)}
        </div>
    );

    function renderRow(f: SavedSet): JSX.Element {
        const opened = observedId === f.id;
        const editing = renaming === f.id;
        const armed = armedDelete === f.id;
        const usedBy = usedByOf(f.id);
        const showTools = hovered === f.id || focused === f.id;
        const nm = setDisplayName(f, v.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)");
        const other = f.universe !== mode; // 완충으로 낀 자리 — 숨기지 않고 뱃지로 말한다
        return (
            <div key={f.id} onMouseEnter={() => setHovered(f.id)} onMouseLeave={() => setHovered((h) => (h === f.id ? null : h))}
                onFocus={() => setFocused(f.id)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused((x) => (x === f.id ? null : x)); }}
                style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px 2px 4px", background: opened ? "var(--accent-soft)" : "transparent" }}>
                {editing ? (
                    <InlineRename initial={f.name ?? ""}
                        onCommit={(next) => { renameSet(f.id, next); setRenaming(null); }}
                        onCancel={() => setRenaming(null)}
                        style={{ ...textInput, flex: 1, minWidth: 0, fontSize: 11.5, padding: "2px 6px" }} />
                ) : (
                    // 편집 = 저장이라 「열기」와 「덮어쓰기」가 한 손으로 합쳐졌다 — 누르면 그 집합이
                    // 뿌리가 되고 구독 패널이 전부 따라온다(사본을 안 뜬다).
                    <button onClick={() => { editSet(f.id); onClose(); }} disabled={opened}
                        title={opened ? "지금 열려 있는 집합입니다"
                            : other ? `다른 우주(${UNIVERSE_LABEL[f.universe]})의 집합입니다 — 지금 모드와 어긋나 있습니다`
                                : `${nm} — 조건 ${leafCount(f.expr)}개 · ${countLabel(v.resolveSet(f.id))}\n클릭 = 이 집합 열기`}
                        style={{
                            flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
                            // 자동 이름(묶음)은 흐리게 — 손 이름 집합이 먼저 눈에 걸린다.
                            color: other || f.name === undefined ? "var(--text-tertiary)" : "var(--text-primary)",
                            padding: "3px 4px", cursor: opened ? "default" : "pointer",
                            font: "inherit", fontSize: 11.5, fontWeight: opened ? 700 : 400,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                        {nm}
                        {opened ? <span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--accent-primary)" }}>열림</span> : null}
                        {other ? <span style={{ marginLeft: 5, fontSize: 9.5, color: FAIL }}>{UNIVERSE_LABEL[f.universe]}</span> : null}
                    </button>
                )}
                {/* 쓰는 곳 = 🔗N — 비어 있음이 곧 "아무도 안 씀"(낱말을 안 쓴다). */}
                {usedBy > 0 && !armed && (
                    <span title={`이 집합을 쓰는 집합 ${usedBy}개 — 고치면 같이 바뀝니다`}
                        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "var(--text-tertiary)", padding: "0 3px" }}>
                        <LinkIcon />{usedBy}
                    </span>
                )}
                {armed ? (
                    // ⚠ 삭제는 **늘 두 번**이다 — 🔗 가 없는(= 아무도 안 쓰는) 집합이 곧 맨 위 집합들이라 한 번에 지우면
                    //   작업 중인 집합이 한 손에 사라진다. 쓰는 곳이 있으면 확인이 깨지는 수를 말한다.
                    <>
                        <button onClick={() => { deleteSet(f.id); setArmedDelete(null); }} style={smallBtn("danger", true)}
                            title="정말 삭제 — 이 집합을 참조하던 식에는 깨진 참조가 표식을 달고 남습니다">
                            {usedBy > 0 ? `${usedBy}곳이 깨집니다 · 삭제` : "정말 삭제"}
                        </button>
                        <button onClick={() => setArmedDelete(null)} style={smallBtn()} title="취소">취소</button>
                    </>
                ) : (
                    <span style={{ display: "inline-flex", opacity: showTools ? 1 : 0, transition: "opacity 0.1s" }}>
                        <button onClick={() => setRenaming(f.id)} style={iconBtn()} title="이름 바꾸기" aria-label="이름 바꾸기"><PencilIcon /></button>
                        <button onClick={() => setArmedDelete(f.id)} style={iconBtn(true)} title="삭제(한 번 더 눌러 확정)" aria-label="삭제"><TrashIcon /></button>
                    </span>
                )}
            </div>
        );
    }
}
