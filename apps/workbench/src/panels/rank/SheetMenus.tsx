// 시트의 팝업·손잡이 조각들 — 열 이름 우클릭 메뉴 · 결과 입력 · 열 폭 손잡이.
//
// 전부 **props 만 보는 표시 조각**이다(시트의 상태를 안 읽는다). 본체에 있을 땐 그 사실이 안 보였고,
// 화면을 읽으려면 팝업 세 벌을 지나쳐야 했다. 여기로 옮기면 본체는 "표를 그리는 일"만 남는다.
import { useRef, useState } from "react";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { outcomeColor } from "../../styles/palette.js";
import { MIN_COL_W } from "./sheetColumns.js";

/**
 * 결과 입력 — **손으로 적는 값**이라 고정 목록이 없다(도메인이 "허용값은 클라"라고만 말한다).
 * 그래서 후보를 **지금까지 쓴 값에서 모아** 보여주고(빈도순), 새 말은 직접 입력한다.
 * 코드에 어휘를 박으면 사용자가 실제로 쓰는 말과 어긋나고, 그때 목록이 방해가 된다.
 */
export function OutcomeMenu({ anchor, current, choices, onPick, onClose }: {
    anchor: { x: number; y: number };
    current?: string;
    choices: readonly string[];
    onPick: (outcome: string) => void;
    onClose: () => void;
}): JSX.Element {
    const [text, setText] = useState(current ?? "");
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={200} maxHeight="min(50vh, 320px)" padding={0} placement="beside" offset={6}>
            <MenuLabel>결과 · 손으로 적는 값</MenuLabel>
            <div style={{ padding: "0 10px 8px" }}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onPick(text.trim()); else if (e.key === "Escape") onClose(); }}
                    placeholder="직접 입력 후 Enter"
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 8px", fontSize: 12.5, outline: "none" }} />
            </div>
            {choices.map((c) => (
                <MenuItem key={c} onClick={() => onPick(c)} style={{ borderTop: "1px solid var(--border-subtle)", color: outcomeColor(c), fontWeight: c === current ? 700 : 400 }}>
                    {c}{c === current ? " ✓" : ""}
                </MenuItem>
            ))}
            {current && (
                <MenuItem onClick={() => onPick("")} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
                    결과 지우기
                </MenuItem>
            )}
        </AnchoredPopover>
    );
}

// 열 이름 우클릭 메뉴 — 왼쪽 고정/해제 · 숨기기 · 정렬 체인에서 빼기.
//  정렬 빼기가 여기 있는 이유: Shift+클릭은 방향 토글이라 뺄 손짓이 없다. 체인이 2단 이상일 때만 뜬다.
export function HeaderMenu({ anchor, label, frozen, canHide, canFreeze, sortStep, onToggleFreeze, onHide, onDropSort, onClose }: {
    anchor: { x: number; y: number }; label: string; frozen: boolean; canHide: boolean; canFreeze: boolean;
    /** 이 열의 정렬 단(1부터). 0 = 체인에 없거나 1단짜리 정렬 → 항목 숨김. */
    sortStep: number;
    onToggleFreeze: () => void; onHide: () => void; onDropSort: () => void; onClose: () => void;
}): JSX.Element {
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={168} padding={0} placement="beside" offset={6}>
            <MenuLabel>{label}</MenuLabel>
            {sortStep > 0 && <MenuItem onClick={onDropSort}>{sortStep}차 정렬에서 빼기</MenuItem>}
            {canFreeze && <MenuItem onClick={onToggleFreeze} style={sortStep > 0 ? { borderTop: "1px solid var(--border-subtle)" } : undefined}>{frozen ? "🔓 고정 해제" : "🔒 왼쪽 고정"}</MenuItem>}
            {canHide && (
                <MenuItem onClick={onHide} style={{ borderTop: canFreeze ? "1px solid var(--border-subtle)" : undefined, color: "var(--text-secondary)" }}>
                    이 열 숨기기
                </MenuItem>
            )}
        </AnchoredPopover>
    );
}

// 열 폭 손잡이 — 헤더 오른쪽 가장자리 5px. 여기서 드래그 이벤트를 끊는 게 핵심이다:
// th 는 이미 draggable(열 재정렬)이라 가장자리를 잡아도 열이 옮겨져 버린다(폭 조절이 아예 안 먹는다).
// 포인터 캡처로 창 밖까지 따라오고, 클릭이 헤더 정렬 토글로 새지 않게 클릭/업에서도 전파를 막는다.
// 이동 중엔 onResize(미리보기 층 — 영속 없음), 손을 뗄 때 onCommit 한 번 — pointermove 마다 영속을
// 쓰면 이벤트 빈도만큼 localStorage 동기 기록이 돌아 드래그가 무거워진다.
export function ResizeHandle({ width, onResize, onCommit }: {
    width: number;
    /** 드래그 중 실시간 폭(미리보기). */
    onResize: (w: number) => void;
    /** 최종 폭 확정(pointerup 1회) — 영속은 여기서만. */
    onCommit: (w: number) => void;
}): JSX.Element {
    const start = useRef<{ x: number; w: number; last: number } | null>(null);
    return (
        <span
            draggable={false}
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); start.current = { x: e.clientX, w: width, last: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { const s = start.current; if (s) { s.last = Math.max(MIN_COL_W, Math.round(s.w + (e.clientX - s.x))); onResize(s.last); } }}
            onPointerUp={(e) => { const s = start.current; start.current = null; if (s) onCommit(s.last); e.currentTarget.releasePointerCapture(e.pointerId); e.stopPropagation(); }}
            title="드래그 = 열 폭 조절"
            style={{ position: "absolute", top: 0, right: 0, width: 5, height: "100%", cursor: "col-resize", touchAction: "none", zIndex: 1 }}
        />
    );
}
