// 관찰판 "축 ▾" 팝오버 내용 — 창(임의 분 입력 + 프리셋 지름길)·대금/등락 모드 택. 인스턴스 영속
// (panelUi "axes", ⧉ 복제 시 사본이 같이 간다). 조건판에는 이 손잡이가 없다(창 = 연동 행의 소유).
import { useState, type CSSProperties, type ReactNode } from "react";
import { WINDOW_CHOICES, windowLabel, type AxisMode, type ThemeRankAxes } from "./axisModel.js";
import { RATE_TICK_HI, RATE_TICK_LO, RATE_TICK_MAX, commitRateTicks, fmtTick, parseTickInput } from "./rateTicks.js";
import { AMOUNT_TICK_MAX, commitAmountTicks, fmtAmountTick, parseAmountInput } from "./amountTicks.js";
import { AMOUNT_TICK } from "../../styles/palette.js";

export function AxisControls({ axes, onChange, rateTicks, onRateTicks, amountTicks, onAmountTicks }: {
    axes: ThemeRankAxes;
    onChange: (next: ThemeRankAxes) => void;
    /** 등락 순위 축의 % 눈금 값(정규화된 목록 — 빈 목록 = 끔). */
    rateTicks: readonly number[];
    onRateTicks: (next: number[]) => void;
    /** 대금 순위 축의 억 눈금 값 — **지금 창(windowMin)의** 목록(창별 저장, 기본 = 빈 목록). */
    amountTicks: readonly number[];
    onAmountTicks: (next: number[]) => void;
}): JSX.Element {
    // 입력 초안 — 타이핑 중간값(빈칸·"6")으로 축을 흔들지 않게, 커밋은 blur/Enter 에 한 번.
    const [draft, setDraft] = useState<string | null>(null);
    const commitDraft = (): void => {
        if (draft === null) return;
        const t = draft.trim();
        const n = Number(t);
        onChange({ ...axes, windowMin: t === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n) });
        setDraft(null);
    };
    const modeRow = (name: string, key: "xMode" | "yMode"): JSX.Element => (
        <span style={row}>
            <span style={{ width: 32, color: "var(--text-tertiary)" }}>{name}</span>
            {(["rank", "value"] as const).map((m: AxisMode) => (
                <button key={m} onClick={() => axes[key] !== m && onChange({ ...axes, [key]: m })}
                    style={{ ...chip, ...(axes[key] === m ? active : {}) }}>
                    {m === "rank" ? "순위" : "값"}
                </button>
            ))}
        </span>
    );
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", fontSize: 11 }}>
            <span style={row}>
                <span style={{ width: 32, color: "var(--text-tertiary)" }}>창</span>
                <input
                    value={draft ?? (axes.windowMin === null ? "" : String(axes.windowMin))}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitDraft}
                    onKeyDown={(e) => { if (e.key === "Enter") commitDraft(); }}
                    placeholder="당일"
                    inputMode="numeric"
                    title="대금 창(분) — 빈칸 = 당일 전체. 임의 분 가능(표시는 전부 클라 계산이라 공짜)"
                    style={{ width: 52, fontSize: 11, padding: "1px 5px", border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)" }}
                />
                <span style={{ color: "var(--text-tertiary)" }}>분</span>
                {WINDOW_CHOICES.map((w) => (
                    <button key={w ?? "all"} onClick={() => { setDraft(null); onChange({ ...axes, windowMin: w }); }}
                        style={{ ...chip, ...(axes.windowMin === w ? active : {}) }}>
                        {windowLabel(w)}
                    </button>
                ))}
            </span>
            {modeRow("대금", "xMode")}
            <TickChips
                name="억 선"
                title={`대금 순위 축의 억 경계선 — 그 값 이상 종목 수 자리에 정확히 선다(1억~10조, 최대 ${AMOUNT_TICK_MAX}개). 창마다 따로 저장된다 — 지금은 ${windowLabel(axes.windowMin)} 창의 목록`}
                values={amountTicks} onChange={onAmountTicks} inert={axes.xMode !== "rank"}
                max={AMOUNT_TICK_MAX} inputW={56}
                fmtChip={fmtAmountTick} chipColor={() => AMOUNT_TICK} aria={(v) => `${fmtAmountTick(v)} 선 빼기`}
                parse={parseAmountInput} commit={commitAmountTicks}
                trailing={<span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>{windowLabel(axes.windowMin)} 창 · 창별 저장</span>}
            />
            {modeRow("등락", "yMode")}
            <TickChips
                name="% 선"
                title={`등락 순위 축의 % 경계선 — 그 값 이상 종목 수 자리에 정확히 선다(${RATE_TICK_LO}~${RATE_TICK_HI}%, 최대 ${RATE_TICK_MAX}개, 전부 빼면 끔)`}
                values={rateTicks} onChange={onRateTicks} inert={axes.yMode !== "rank"}
                max={RATE_TICK_MAX} inputW={40}
                fmtChip={fmtTick} chipColor={(v) => (v > 0 ? "var(--rise)" : v < 0 ? "var(--fall)" : "var(--text-secondary)")}
                aria={(v) => `${fmtTick(v)}% 선 빼기`}
                parse={parseTickInput} commit={commitRateTicks}
            />
            <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>
                여기는 보기 축일 뿐 — 조건은 조건판 테마 팝오버에서(창 T 자유, 클라 즉석 계산).
            </span>
        </div>
    );
}

/**
 * 경계선 칩 줄(%·억 공용) — 칩 클릭 = 그 자리 숫자 편집(blur/Enter 커밋, Esc 취소) · × 삭제 · ＋ 추가.
 * 정규화(오름차순·중복 무시·상한·범위 클램프)는 commit 한 곳. 전부 빼면 끔(빈 목록).
 * ⚠ 이 줄은 창 입력 **뒤에** 선다 — 판의 첫 input 이 창 입력이라는 가정이 DOM 테스트에 있다.
 */
function TickChips({ name, title, values, onChange, inert, max, inputW, fmtChip, chipColor, aria, parse, commit, trailing }: {
    name: string;
    title: string;
    values: readonly number[];
    onChange: (next: number[]) => void;
    inert: boolean;
    max: number;
    inputW: number;
    fmtChip: (v: number) => string;
    chipColor: (v: number) => string;
    /** × 버튼의 aria-label — DOM 테스트가 기대는 문구라 줄마다 제 어휘를 가진다. */
    aria: (v: number) => string;
    parse: (text: string) => number | "" | null;
    commit: (next: readonly number[]) => number[];
    trailing?: ReactNode;
}): JSX.Element {
    // 편집 중인 칩 — index(기존 값) 또는 "new"(＋) · 초안 글자.
    const [edit, setEdit] = useState<{ at: number | "new"; text: string } | null>(null);
    const commitEdit = (): void => {
        if (edit === null) return;
        const v = parse(edit.text);
        setEdit(null);
        if (v === null) return; // 못 읽는 글자 = 취소(원래 값 유지 — 조용히 지우지 않는다)
        const next = [...values];
        if (edit.at === "new") { if (v !== "") next.push(v); }
        else if (v === "") next.splice(edit.at, 1); // 비우고 커밋 = 삭제
        else next[edit.at] = v;
        const out = commit(next);
        // 안 바뀌었으면 쓰지 않는다 — 키 없는 판(기본값)을 빈 커밋 한 번이 저장물로 굳히지 않게.
        if (out.length !== values.length || out.some((x, i) => x !== values[i])) onChange(out);
    };
    const input = (
        <input autoFocus value={edit?.text ?? ""} inputMode="decimal"
            onChange={(e) => setEdit((d) => (d ? { ...d, text: e.target.value } : d))}
            onBlur={commitEdit}
            onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") { e.preventDefault(); setEdit(null); }
            }}
            style={{ width: inputW, fontSize: 11, padding: "0 4px", border: "1px solid var(--accent-primary)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)" }} />
    );
    return (
        <span style={{ ...row, flexWrap: "wrap", opacity: inert ? 0.5 : 1 }} title={title}>
            <span style={{ width: 32, color: "var(--text-tertiary)" }}>{name}</span>
            {values.map((v, i) => (edit?.at === i
                ? <span key={v}>{input}</span>
                : (
                    <span key={v} style={{ ...chip, display: "inline-flex", alignItems: "center", gap: 3, padding: "0 4px 0 7px", color: chipColor(v) }}>
                        <button onClick={() => setEdit({ at: i, text: String(v) })} title="클릭 = 값 고치기(비우면 삭제)"
                            style={{ color: "inherit", fontSize: 10.5, padding: 0 }}>{fmtChip(v)}</button>
                        <button onClick={() => onChange(values.filter((_, k) => k !== i))} aria-label={aria(v)}
                            style={{ color: "var(--text-tertiary)", fontSize: 10.5, padding: 0 }}>×</button>
                    </span>
                )))}
            {edit?.at === "new"
                ? input
                : values.length < max && (
                    <button onClick={() => setEdit({ at: "new", text: "" })} style={{ ...chip, color: "var(--text-tertiary)" }} title="선 추가">＋</button>
                )}
            {inert ? <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>값 축에선 안 씀</span> : trailing}
        </span>
    );
}

const row: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 };
const chip: CSSProperties = {
    fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)",
    borderRadius: 8, padding: "0 7px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
};
const active: CSSProperties = { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" };
