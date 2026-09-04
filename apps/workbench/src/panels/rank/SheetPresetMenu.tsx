// 열 프리셋 판 — 위는 저장(이름 입력, 같은 이름이면 덮어쓰기), 아래는 붙박이·사용자 프리셋 목록.
// 집합 관리 판(SetRow 의 SetManager)의 문법을 따른다: 이름 클릭 = 적용, 삭제는 두 번 눌러 확정(armed).
// 프리셋은 **보이는 열 스냅샷뿐**이라 적용해도 순서·고정·폭은 안 움직인다(sheetPresets 참고).
import { useState } from "react";
import { AnchoredPopover } from "../../ui/Dialog.js";
import { FAIL } from "../../styles/palette.js";
import { textInput } from "../filter/ui.js";
import { BUILTIN_DAY_PRESETS, BUILTIN_POINT_PRESETS, type SheetPreset } from "./sheetPresets.js";
import type { SheetColumns } from "./useSheetColumns.js";

const smallBtn = (tone: "normal" | "accent" | "danger" = "normal"): React.CSSProperties => ({
    flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 9.5, padding: "0 5px", borderRadius: 3, lineHeight: 1.6,
    border: `1px solid ${tone === "danger" ? FAIL : tone === "accent" ? "var(--accent-primary)" : "var(--border-default)"}`,
    background: "transparent",
    color: tone === "danger" ? FAIL : tone === "accent" ? "var(--accent-primary)" : "var(--text-tertiary)",
    whiteSpace: "nowrap",
});

const sectionHead: React.CSSProperties = { padding: "4px 10px 3px", fontSize: 9.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" };

export function SheetPresetMenu({ anchor, cols, rowMode, onClose }: {
    anchor: { x: number; y: number };
    /** 프리셋 저장물·적용 손잡이 — 열 구성 훅(useSheetColumns)의 것을 그대로 쓴다. */
    cols: SheetColumns;
    rowMode: "point" | "day";
    onClose: () => void;
}): JSX.Element {
    const [name, setName] = useState("");
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const builtin = rowMode === "day" ? BUILTIN_DAY_PRESETS : BUILTIN_POINT_PRESETS;
    const trimmed = name.trim();
    const dup = trimmed !== "" && cols.presets.some((p) => p.name === trimmed);
    const canSave = trimmed !== "";
    const commitSave = (): void => {
        if (!canSave) return;
        cols.savePreset(trimmed);
        setName("");
    };
    const apply = (p: SheetPreset): void => { cols.applyPreset(p); onClose(); };

    const row = (p: SheetPreset, deletable: boolean): JSX.Element => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px 2px 4px" }}>
            <button onClick={() => apply(p)}
                title={`${p.name} — 열 ${p.cols.length}개\n클릭 = 이 열들만 보이기(순서·고정·폭은 그대로)`}
                style={{
                    flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
                    color: "var(--text-primary)", padding: "3px 4px", cursor: "pointer", font: "inherit", fontSize: 11.5,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                {p.name}<span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--text-tertiary)" }}>{p.cols.length}열</span>
            </button>
            {deletable && (armedDelete === p.name
                ? <button onClick={() => cols.deletePreset(p.name)} style={smallBtn("danger")} title="한 번 더 = 정말 삭제">정말?</button>
                : <button onClick={() => setArmedDelete(p.name)} style={smallBtn()} title="삭제(한 번 더 눌러 확정)">삭제</button>)}
        </div>
    );

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={230} padding={0} placement="beside" offset={6}>
            <div style={{ padding: "2px 0", fontFamily: "inherit" }}>
                <div style={sectionHead}>열 프리셋 — 보이는 열 묶음 전환({rowMode === "day" ? "하루" : "타점"} 행 모드 전용 주머니)</div>
                <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 10px" }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="지금 보이는 열들을 저장" autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") commitSave(); }}
                        style={{ ...textInput, flex: 1, fontSize: 11.5 }} />
                    <button onClick={commitSave} disabled={!canSave}
                        title={dup ? `"${trimmed}" 이(가) 이미 있습니다 — 저장하면 그 프리셋의 열 목록이 지금 것으로 바뀝니다`
                            : "지금 보이는 열들의 스냅샷이 저장됩니다(순서·고정·폭은 안 담습니다)"}
                        style={{ ...smallBtn(canSave ? (dup ? "danger" : "accent") : "normal"), fontSize: 10.5, padding: "2px 8px", cursor: canSave ? "pointer" : "default" }}>
                        {dup ? "덮어쓰기" : "저장"}
                    </button>
                </div>
                {builtin.length > 0 && <>
                    <div style={sectionHead}>붙박이</div>
                    {builtin.map((p) => row(p, false))}
                </>}
                <div style={sectionHead}>내 프리셋 {cols.presets.length > 0 ? `${cols.presets.length}개` : "— 아직 없음"}</div>
                {cols.presets.map((p) => row(p, true))}
            </div>
        </AnchoredPopover>
    );
}
