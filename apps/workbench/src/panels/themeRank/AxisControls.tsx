// 축 설정 손잡이 — 인스턴스 영속(panelUi "axes", 복제 사본이 같이 간다). 값은 axisModel 이 해석하고,
// 판정 층(컷선·존·카운트)이 서고 접히는 판단도 axisModel(isJudgmentSpace)이 진다 — 여기는 입력만.
import type { CSSProperties } from "react";
import { WINDOW_CHOICES, windowLabel, type AxisMode, type ThemeRankAxes } from "./axisModel.js";

const sel: CSSProperties = {
    fontSize: 10.5,
    color: "var(--text-secondary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: 4,
    padding: "0 2px",
    cursor: "pointer",
};
const grp: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" };

export function AxisControls({ axes, onChange }: { axes: ThemeRankAxes; onChange: (next: ThemeRankAxes) => void }): JSX.Element {
    const mode = (v: string): AxisMode => (v === "value" ? "value" : "rank");
    return (
        <span style={grp} title="이 창의 축 설정 — 인스턴스마다 따로 저장된다(⧉ 복제 시 사본이 같이 간다)">
            <span>대금</span>
            <select style={sel} value={axes.windowMin === null ? "" : String(axes.windowMin)}
                title="대금 창 — 당일 전체 또는 직전 T분 누적(오후 상승주가 아침 상승주와 같은 자로 재이지 않게)"
                onChange={(e) => onChange({ ...axes, windowMin: e.target.value === "" ? null : Number(e.target.value) })}>
                {WINDOW_CHOICES.map((w) => (
                    <option key={w ?? "all"} value={w === null ? "" : String(w)}>{windowLabel(w)}</option>
                ))}
            </select>
            <select style={sel} value={axes.xMode} title="대금 축 모드 — 순위(서수) / 값(로그)"
                onChange={(e) => onChange({ ...axes, xMode: mode(e.target.value) })}>
                <option value="rank">순위</option>
                <option value="value">값</option>
            </select>
            <span>등락</span>
            <select style={sel} value={axes.yMode} title="등락률 축 모드 — 순위(서수) / 값(%)"
                onChange={(e) => onChange({ ...axes, yMode: mode(e.target.value) })}>
                <option value="rank">순위</option>
                <option value="value">값</option>
            </select>
        </span>
    );
}
