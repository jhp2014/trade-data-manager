// 기본 차트 「사슬 ▾」 판 — 사슬 층의 **출처 고르기**(보는 집합의 「돌파」 줄) · ① 밴드 선 켜기 · 격자판으로 가기.
// 고치는 곳은 격자판 하나다(여긴 노브가 없다 — 편집면이 둘이면 같은 값을 두 손이 만진다).
import { AnchoredPopover } from "../../ui/Dialog.js";
import { openAndFocus, openPanelExact } from "../../lib/openPanel.js";
import { BREAKOUT_HIGH } from "../../styles/palette.js";
import { DAILY_GRID_BASE } from "../dailyGen/dailyPanelIds.js";
import type { ChainOverlay } from "./useChainOverlay.js";

const head = { fontSize: 10.5, color: "var(--text-tertiary)", padding: "6px 10px 3px" } as const;
const item = {
    display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", border: "none", background: "transparent",
    cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "3px 10px", color: "var(--text-primary)",
} as const;

export function ChainLayerMenu({ anchor, overlay, on, onToggle, showBands, onToggleBands, onPickSource, onClose }: {
    anchor: { x: number; y: number };
    overlay: ChainOverlay;
    on: boolean;
    onToggle: () => void;
    showBands: boolean;
    onToggleBands: () => void;
    onPickSource: (stageId: string) => void;
    onClose: () => void;
}): JSX.Element {
    const src = overlay.source;
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={300} padding={0} placement="beside" offset={6}>
            <div style={{ padding: "2px 0 6px" }}>
                <button onClick={onToggle} style={{ ...item, fontWeight: 600 }} title="사슬 층 켜기/끄기(헤더 「사슬」 칩과 같다)">
                    <span style={{ color: on ? BREAKOUT_HIGH : "var(--text-tertiary)" }}>{on ? "■" : "□"}</span> 사슬 층 — ② 사슬 띠 · ③ 후보 ▼
                </button>
                {overlay.why !== null && (
                    <div style={{ fontSize: 10.5, color: "var(--warning)", padding: "0 10px 3px 28px" }}>{overlay.why}</div>
                )}

                <div style={head}>출처 — 보는 집합의 「돌파」 줄 · ▼ = 그 줄 단독의 후보(다른 조건·전이는 ◇)</div>
                {overlay.rows.length === 0 && <div style={{ ...item, cursor: "default", color: "var(--text-tertiary)" }}>없음 — 생성소에서 「돌파」 줄을 만든다</div>}
                {overlay.rows.map((r) => {
                    const cur = src?.stageId === r.stageId;
                    return (
                        <button key={r.stageId} onClick={() => onPickSource(r.stageId)} style={item} title="이 줄의 노브로 그린다">
                            <span style={{ color: cur ? BREAKOUT_HIGH : "var(--text-tertiary)" }}>{cur ? "●" : "○"}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text}</span>
                            {r.gridPanel !== null && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>▣ 격자판</span>}
                        </button>
                    );
                })}

                <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 0" }} />
                <button onClick={onToggleBands} style={item} title="① 러닝 고가 밴드 상단(실선)·하단(점선), 기준선 밴드 하단(보라 점선)">
                    <span style={{ color: showBands ? BREAKOUT_HIGH : "var(--text-tertiary)" }}>{showBands ? "■" : "□"}</span> ① 밴드 선도 보기
                </button>
                <button
                    onClick={() => {
                        if (src?.gridPanel) openPanelExact(src.gridPanel);
                        else openAndFocus(`${DAILY_GRID_BASE}-1`);
                        onClose();
                    }}
                    style={{ ...item, color: "var(--accent-primary)" }}
                    title={src?.gridPanel ? "이 줄에 연동된 격자판을 연다 — 노브·사슬 필터는 거기서 고친다" : "격자판을 연다 — 연동은 생성소의 「돌파」 줄에서 건다"}>
                    격자판에서 고치기 ▸
                </button>
            </div>
        </AnchoredPopover>
    );
}
