// 구간 **정밀 입력** — 레일의 보조다. 기본 손짓은 그리기지만, `09:00~09:30` 처럼 자리가 정해진 값은
// 드래그로 정확히 맞출 수 없다(5분 스냅도 09:03 을 못 준다). 그래서 같은 조건에 입구를 둘 둔다.
//
// 날짜·시각·수치가 파싱 규칙만 다르고 구조가 같아서 한 컴포넌트다 — 셋으로 나뉘어 있던 시절엔
// "구간 추가" 버튼과 유효성 표시가 파일마다 조금씩 달랐다.
//
// ⚠ **못 읽은 줄을 조용히 넘기지 않는다.** 빨갛게 남기고 적용에서도 빠진다 — 오타가 조건에서 사라지면
// 사용자는 그 조건이 걸린 줄 안다.
import { useState } from "react";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { commitBtn, dashedBtn, numInput, xBtn } from "./ui.js";

/** 한 줄의 판정 결과. `open` 이면 한쪽만 있어도 유효(그 방향 무제한). */
export interface ParsedRow {
    from: string | null;
    to: string | null;
    valid: boolean;
    touched: boolean;
}

/**
 * 표준값 둘의 순서 — 수치 편집기(계산 축 값)의 표준값은 숫자 **문자열**이라 사전순이 틀린다
 * ("5" ≤ "30" 이 거짓). 둘 다 수로 읽히면 수로, 아니면(날짜·시각) 사전순 — 그 표기들은 사전순이 곧 순서다.
 */
const inOrder = (from: string, to: string): boolean => {
    const a = Number(from);
    const b = Number(to);
    return Number.isFinite(a) && Number.isFinite(b) ? a <= b : from <= to;
};

/** 줄 판정(순수) — 컴포넌트와 테스트가 같은 규칙을 본다. */
export function parseRangeRow(
    r: { from: string; to: string },
    parse: (raw: string) => string | null,
    allowOpen: boolean,
): ParsedRow {
    const blankFrom = r.from.trim() === "";
    const blankTo = r.to.trim() === "";
    const from = blankFrom ? null : parse(r.from);
    const to = blankTo ? null : parse(r.to);
    const touched = !blankFrom || !blankTo;
    const readable = (blankFrom || from !== null) && (blankTo || to !== null);
    const enough = allowOpen ? from !== null || to !== null : from !== null && to !== null;
    const ordered = from === null || to === null || inOrder(from, to);
    return { from, to, valid: readable && enough && ordered, touched };
}

export function RangeTextEditor({ anchor, title, hint, rows: initial, placeholders, parse, allowOpen = false, onCommit, onClose }: {
    anchor: { x: number; y: number };
    title: string;
    hint?: string;
    /** 초기 표시 문자열(표기 형식 그대로). 없으면 빈 줄 하나. */
    rows?: { from: string; to: string }[];
    placeholders: [string, string];
    /** 표기 → 표준값(YYYY-MM-DD · HH:MM · 수치 문자열). 못 읽으면 null. */
    parse: (raw: string) => string | null;
    /** 한쪽이 비어도 되나(반열림). 날짜·시간은 양끝 필수, 계산 축 값은 허용. */
    allowOpen?: boolean;
    onCommit: (ranges: { from: string | null; to: string | null }[]) => void;
    onClose: () => void;
}): JSX.Element {
    const [rows, setRows] = useState<{ from: string; to: string }[]>(
        initial && initial.length > 0 ? initial.map((r) => ({ ...r })) : [{ from: "", to: "" }],
    );

    const parsed: ParsedRow[] = rows.map((r) => parseRangeRow(r, parse, allowOpen));
    const canCommit = parsed.some((p) => p.valid);

    const setCell = (i: number, edge: "from" | "to", value: string): void =>
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [edge]: value } : x)));

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={240} maxWidth={300} padding={0} placement="beside" offset={8}>
            <MenuLabel>{title} · 여러 구간 = 또는</MenuLabel>
            {hint && <div style={{ padding: "0 10px 6px", fontSize: 10.5, color: "var(--text-tertiary)" }}>{hint}</div>}
            <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                {rows.map((r, i) => {
                    const bad = parsed[i]!.touched && !parsed[i]!.valid;
                    return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <input value={r.from} onChange={(e) => setCell(i, "from", e.target.value)}
                                placeholder={placeholders[0]} style={{ ...numInput, ...(bad ? { borderColor: "var(--rise)" } : {}) }} />
                            <span style={{ color: "var(--text-tertiary)" }}>~</span>
                            <input value={r.to} onChange={(e) => setCell(i, "to", e.target.value)}
                                placeholder={placeholders[1]} style={{ ...numInput, ...(bad ? { borderColor: "var(--rise)" } : {}) }} />
                            <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length <= 1} title="이 구간 제거" style={xBtn}>✕</button>
                        </div>
                    );
                })}
                <button onClick={() => setRows((rs) => [...rs, { from: "", to: "" }])} style={{ ...dashedBtn, alignSelf: "flex-start" }}>+ 구간(또는)</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "6px 10px 9px", borderTop: "1px solid var(--border-subtle)" }}>
                <button onClick={onClose} style={dashedBtn}>취소</button>
                <button
                    onClick={() => { onCommit(parsed.filter((p) => p.valid).map((p) => ({ from: p.from, to: p.to }))); onClose(); }}
                    disabled={!canCommit} style={commitBtn(canCommit)}
                >적용</button>
            </div>
        </AnchoredPopover>
    );
}
