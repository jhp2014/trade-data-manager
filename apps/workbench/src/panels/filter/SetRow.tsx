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

const sectionHead: React.CSSProperties = { padding: "4px 10px 3px", fontSize: 9.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" };

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
 * 목록의 구획 — **쓰는 곳**으로 가른다(2026-09-20). 숨기는 게 아니라 나누기만 한다.
 * 0 칸이 청소 창구고, 2+ 칸이 "고치면 여럿이 같이 바뀐다"를 미리 말한다.
 */
const SECTIONS: readonly { key: string; title: string; has: (n: number) => boolean; foldByDefault: boolean }[] = [
    { key: "shared", title: "여럿이 쓰는 집합 — 고치면 같이 바뀝니다 ·", has: (n) => n >= 2, foldByDefault: false },
    // ⚠ **전용 부품은 기본 접힘**(2026-09-21) — `＋ 묶음` 이 조건 추가의 주 입구가 되면 이 칸이
    //   빠르게 불어난다. 접기는 **숨기기가 아니다**: 머리에 수가 서고 한 번 누르면 펴진다.
    { key: "one", title: "한 곳에서만 쓰는 전용 부품 ·", has: (n) => n === 1, foldByDefault: true },
    { key: "free", title: "아무도 안 쓰는 집합 — 지워도 안전합니다 ·", has: (n) => n === 0, foldByDefault: false },
];

/** 집합 관리 판 — 위는 ＋ 새 집합, 아래는 **지금 모드의** 집합 목록(쓰는 곳으로 구획, 행마다 열기·이름·삭제). */
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
        () => savedSets.filter((f) => f.universe === mode || f.id === observedId || f.id === editingSetId),
        [savedSets, mode, observedId, editingSetId],
    );

    /** 쓰는 곳 — 이 집합을 참조하는 저장 집합 수. 구획과 배지가 같은 자를 쓴다. */
    const usedByOf = (id: string): number => savedSets.filter((x) => refsOf(x.expr).includes(id)).length;
    const [renaming, setRenaming] = useState<string | null>(null); // 이름 편집 중인 집합 id — draft 는 InlineRename 이 든다
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    /** 구획 펼침(세션) — 기본값은 구획이 들고, 손이 닿은 것만 여기 남는다. */
    const [folded, setFolded] = useState<Record<string, boolean>>({});

    return (
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "2px 0" }}>
            {/* 「저장」 버튼이 없다 — **편집이 곧 저장**이다(2026-09-20). 새 집합을 만드는 손만 남는다. */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 10px" }}>
                <button onClick={() => { createSet(); onClose(); }} style={{ ...smallBtn("accent"), fontSize: 10.5, padding: "2px 8px" }}
                    title={`${UNIVERSE_LABEL[mode]} 빈 집합을 만들고 그걸 엽니다 — 이름은 나중에 붙여도 됩니다(그때까지 자동 이름)`}>＋ 새 집합</button>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{UNIVERSE_LABEL[mode]} 집합만</span>
            </div>

            {/* ⚠ **구획만 나눈다 — 숨기지 않는다.** 안 보이는 내부 집합을 두면 익명 묶음이 이름만 바꿔
                돌아온다(2026-09-19 기각분이 예고한 함정). 쓰는 곳 0 칸이 자연스러운 청소 창구다. */}
            {SECTIONS.map(({ key, title, has, foldByDefault }) => {
                const rows = mine.filter((f) => has(usedByOf(f.id)));
                if (rows.length === 0) return null;
                const open = folded[key] ?? !foldByDefault;
                return (
                    <div key={key}>
                        <button onClick={() => setFolded((f) => ({ ...f, [key]: !open }))}
                            title={open ? "접기" : "펴기"}
                            style={{ ...sectionHead, display: "flex", width: "100%", textAlign: "left", border: "none", cursor: "pointer", gap: 4 }}>
                            <span style={{ width: 8 }}>{open ? "▾" : "▸"}</span>{title} {rows.length}개
                        </button>
                        {open && rows.map(renderRow)}
                    </div>
                );
            })}
        </div>
    );

    function renderRow(f: SavedSet): JSX.Element {
        const opened = observedId === f.id;
        const editing = renaming === f.id;
        const nm = setDisplayName(f, v.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)");
        const other = f.universe !== mode; // 완충으로 낀 자리 — 숨기지 않고 뱃지로 말한다
        return (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px 2px 4px", background: opened ? "var(--accent-soft)" : "transparent" }}>
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
                            color: other ? "var(--text-tertiary)" : "var(--text-primary)",
                            padding: "3px 4px", cursor: opened ? "default" : "pointer",
                            font: "inherit", fontSize: 11.5, fontWeight: opened ? 700 : 400,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                        {nm}
                        {opened ? <span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--accent-primary)" }}>열림</span> : null}
                        {other ? <span style={{ marginLeft: 5, fontSize: 9.5, color: FAIL }}>{UNIVERSE_LABEL[f.universe]}</span> : null}
                    </button>
                )}
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
