// 관찰판 "축 ▾" 팝오버 내용 — 창(임의 분 입력 + 프리셋 지름길)·대금/등락 모드 택. 인스턴스 영속
// (panelUi "axes", ⧉ 복제 시 사본이 같이 간다). 조건판에는 이 손잡이가 없다(창 = 연동 행의 소유).
import { useState, type CSSProperties } from "react";
import { WINDOW_CHOICES, windowLabel, type AxisMode, type ThemeRankAxes } from "./axisModel.js";

export function AxisControls({ axes, onChange }: { axes: ThemeRankAxes; onChange: (next: ThemeRankAxes) => void }): JSX.Element {
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
            {modeRow("등락", "yMode")}
            <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>
                조건으로 걸 수 있는 창은 당일·60분뿐(서버가 구운 공간) — 그건 조건판·편성 보드의 몫이다.
            </span>
        </div>
    );
}

const row: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 };
const chip: CSSProperties = {
    fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)",
    borderRadius: 8, padding: "0 7px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
};
const active: CSSProperties = { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" };
