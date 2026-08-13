// 날짜·시간 구간 편집 — 구간 여러 개(OR), 텍스트 입력. 표기는 필터 바 시절과 같다(yy.mm.dd / HH:MM).
// 날짜는 하루 층위, 시간은 타점 층위 — 어느 칸의 + 단계에서 열렸는지가 kind 를 정한다.
import { useState } from "react";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import type { FilterPredicate } from "./stage.js";

// yy.mm.dd ↔ YYYY-MM-DD — 입력 관용(4자리 연도·구분 생략 안 함)은 필터 바의 규칙 그대로.
const dTo = (iso: string): string => (iso ? iso.slice(2).replace(/-/g, ".") : "");
const dFrom = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{2}|\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (!m) return null;
    const yy = m[1]!.length === 4 ? m[1]! : `20${m[1]}`;
    const mo = Number(m[2]), da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return `${yy}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
};
const tFrom = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
};

export function RangeStageEditor({ anchor, kind, initial, onCommit, onClose }: {
    anchor: { x: number; y: number };
    kind: "date" | "time";
    initial?: { from: string; to: string }[];
    onCommit: (p: FilterPredicate) => void;
    onClose: () => void;
}): JSX.Element {
    const [rows, setRows] = useState<{ from: string; to: string }[]>(
        initial && initial.length > 0
            ? initial.map((r) => (kind === "date" ? { from: dTo(r.from), to: dTo(r.to) } : { ...r }))
            : [{ from: "", to: "" }],
    );

    const parse = kind === "date" ? dFrom : tFrom;
    // 유효한 행만 — 못 읽은 행을 조용히 넘기지 않고 빨갛게 남긴다(적용해도 그 행은 안 들어간다).
    const parsed = rows.map((r) => {
        const from = parse(r.from), to = parse(r.to);
        return { valid: from !== null && to !== null && from <= to, from, to, touched: r.from.trim() !== "" || r.to.trim() !== "" };
    });
    const canCommit = parsed.some((p) => p.valid);

    const commit = (): void => {
        const ranges = parsed.filter((p) => p.valid).map((p) => ({ from: p.from!, to: p.to! }));
        onCommit(kind === "date" ? { kind: "date", ranges } : { kind: "time", ranges });
        onClose();
    };

    const ph = kind === "date" ? ["26.07.01", "26.07.31"] : ["09:00", "10:30"];
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={240} maxWidth={300} padding={0} placement="beside" offset={8}>
            <MenuLabel>{kind === "date" ? "날짜 구간" : "시간 구간"} · 여러 구간 = 또는</MenuLabel>
            <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                {rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input value={r.from} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                            placeholder={ph[0]} style={{ ...numStyle, borderColor: parsed[i]!.touched && !parsed[i]!.valid ? "var(--rise)" : undefined }} />
                        <span style={{ color: "var(--text-tertiary)" }}>~</span>
                        <input value={r.to} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                            placeholder={ph[1]} style={{ ...numStyle, borderColor: parsed[i]!.touched && !parsed[i]!.valid ? "var(--rise)" : undefined }} />
                        <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length <= 1} title="이 구간 제거" style={xBtn}>✕</button>
                    </div>
                ))}
                <button onClick={() => setRows((rs) => [...rs, { from: "", to: "" }])} style={{ ...dashedBtn, alignSelf: "flex-start" }}>+ 구간(또는)</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "6px 10px 9px", borderTop: "1px solid var(--border-subtle)" }}>
                <button onClick={onClose} style={dashedBtn}>취소</button>
                <button onClick={commit} disabled={!canCommit} style={{ ...dashedBtn, color: canCommit ? "var(--accent-primary)" : "var(--text-tertiary)", borderColor: canCommit ? "var(--accent-primary)" : undefined }}>적용</button>
            </div>
        </AnchoredPopover>
    );
}

const numStyle: React.CSSProperties = {
    width: 84, boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "3px 6px", fontSize: 12, outline: "none",
    fontVariantNumeric: "tabular-nums",
};
const dashedBtn: React.CSSProperties = {
    fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)",
    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
};
const xBtn: React.CSSProperties = {
    border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
    fontSize: 10, lineHeight: 1, padding: "0 2px",
};
