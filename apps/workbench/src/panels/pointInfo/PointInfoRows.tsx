// 타점 정보 줄 렌더 — 값 목록 + 드래그 + 서랍 둘. 규칙은 rows.ts/prefs.ts 에 있고 여긴 그리기만.
import { useState, type CSSProperties } from "react";
import { KIND_AXIS, KIND_OUTCOME, KIND_THEME } from "../../styles/palette.js";
import { ROW_DND } from "./prefs.js";
import { slotOf, type PointInfoKind, type PointInfoRow, type PointInfoValue } from "./rows.js";

const DOT: Record<PointInfoKind, string> = { axis: KIND_AXIS, outcome: KIND_OUTCOME, theme: KIND_THEME };
const KIND_LABEL: Record<PointInfoKind, string> = { axis: "축", outcome: "결과", theme: "테마" };

const rowStyle: CSSProperties = {
    display: "flex", alignItems: "center", gap: 5, width: "100%", padding: "0 6px 0 4px",
    height: 20, border: "none", background: "none", font: "inherit", textAlign: "left",
};

function Value({ v }: { v: PointInfoValue }): JSX.Element {
    if (v.badge !== null) {
        return <span style={{ color: v.color, border: `1px solid ${v.badge}`, borderRadius: 3, padding: "0 3px", fontSize: 10, lineHeight: "14px" }}>{v.text}</span>;
    }
    return <span className={v.numeric ? "tabular" : undefined} style={{ color: v.color, fontWeight: 600, whiteSpace: "nowrap" }}>{v.text}</span>;
}

/** 값 줄 하나 — ⠿(드래그) · 색점 · 이름 · 값(+짝) · 숨김 눈(hover). */
function Row({ row, shownKeys, onPick, onHide, onDrop }: {
    row: PointInfoRow;
    shownKeys: readonly string[];
    onPick: (key: string | null) => void;
    onHide: (key: string) => void;
    onDrop: (dragged: string, target: string, shownKeys: readonly string[]) => void;
}): JSX.Element {
    const [over, setOver] = useState(false);
    const [hover, setHover] = useState(false);
    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(ROW_DND, row.key); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(ROW_DND)) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                setOver(false);
                const dragged = e.dataTransfer.getData(ROW_DND);
                if (dragged && dragged !== row.key) { e.preventDefault(); onDrop(dragged, row.key, shownKeys); }
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => onPick(row.revealKey)}
            title={row.title}
            style={{
                ...rowStyle,
                cursor: row.revealKey ? "pointer" : "default",
                background: over ? "var(--bg-active)" : hover ? "var(--bg-tertiary)" : undefined,
            }}
        >
            <span aria-hidden style={{ flexShrink: 0, width: 7, color: hover ? "var(--text-tertiary)" : "transparent", cursor: "grab", fontSize: 10 }}>⠿</span>
            <span aria-hidden title={KIND_LABEL[row.kind]} style={{ flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: DOT[row.kind] }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{row.name}</span>
            {row.value && <Value v={row.value} />}
            {row.extra && <span style={{ color: "var(--text-tertiary)" }}>·</span>}
            {row.extra && <Value v={row.extra} />}
            <button
                onClick={(e) => { e.stopPropagation(); onHide(row.key); }}
                title="이 줄 숨기기"
                style={{ flexShrink: 0, width: 12, padding: 0, color: hover ? "var(--text-tertiary)" : "transparent", fontSize: 10, lineHeight: 1 }}
            >◦</button>
        </div>
    );
}

/** 접이 서랍 머리 — 값 없음(결손)·숨김(내가 치운 것). 성질이 갈려 둘로 둔다. */
function DrawerHead({ open, label, n, onToggle, extra }: { open: boolean; label: string; n: number; onToggle: () => void; extra?: JSX.Element }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", height: 18 }}>
            <button onClick={onToggle} style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{open ? "▾" : "▸"} {label} {n}</button>
            {open && extra}
        </div>
    );
}

export function PointInfoRowList({ rows, hidden, missingOpen, hiddenOpen, onToggleMissing, onToggleHidden, onPick, onHide, onDrop, onUnhideAll }: {
    rows: readonly PointInfoRow[];
    hidden: ReadonlySet<string>;
    missingOpen: boolean;
    hiddenOpen: boolean;
    onToggleMissing: () => void;
    onToggleHidden: () => void;
    onPick: (key: string | null) => void;
    onHide: (key: string) => void;
    onDrop: (dragged: string, target: string, shownKeys: readonly string[]) => void;
    onUnhideAll: (keys: readonly string[]) => void;
}): JSX.Element {
    const body = rows.filter((r) => slotOf(r, hidden) === "body");
    const missing = rows.filter((r) => slotOf(r, hidden) === "missing");
    const hiddenRows = rows.filter((r) => slotOf(r, hidden) === "hidden");
    const shownKeys = body.map((r) => r.key);

    return (
        <div style={{ fontSize: 11 }}>
            {body.map((r) => (
                <Row key={r.key} row={r} shownKeys={shownKeys} onPick={onPick} onHide={onHide} onDrop={onDrop} />
            ))}
            {missing.length > 0 && (
                <>
                    <DrawerHead open={missingOpen} label="값 없음" n={missing.length} onToggle={onToggleMissing} />
                    {missingOpen && missing.map((r) => (
                        <div key={r.key} onClick={() => onPick(r.revealKey)} title={r.title}
                            style={{ ...rowStyle, height: 18, color: "var(--text-tertiary)", opacity: 0.75, cursor: r.revealKey ? "pointer" : "default" }}>
                            <span aria-hidden style={{ flexShrink: 0, width: 7 }} />
                            <span aria-hidden style={{ flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: DOT[r.kind], opacity: 0.6 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                        </div>
                    ))}
                </>
            )}
            {hiddenRows.length > 0 && (
                <>
                    <DrawerHead
                        open={hiddenOpen} label="숨김" n={hiddenRows.length} onToggle={onToggleHidden}
                        extra={<button onClick={() => onUnhideAll(hiddenRows.map((r) => r.key))} style={{ color: "var(--accent-primary)", fontSize: 10 }}>전부 되돌리기</button>}
                    />
                    {hiddenOpen && hiddenRows.map((r) => (
                        <div key={r.key} onClick={() => onHide(r.key)} title="클릭 = 다시 보이기"
                            style={{ ...rowStyle, height: 18, color: "var(--text-tertiary)", opacity: 0.75, cursor: "pointer" }}>
                            <span aria-hidden style={{ flexShrink: 0, width: 7 }} />
                            <span aria-hidden style={{ flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: DOT[r.kind], opacity: 0.6 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            {r.value && <span className={r.value.numeric ? "tabular" : undefined}>{r.value.text}</span>}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
