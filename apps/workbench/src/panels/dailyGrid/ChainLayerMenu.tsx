// 기본 차트 「사슬」 판 — 세 가지만: **사슬 ON/OFF · 밴드 ON/OFF · 적용할 격자 고르기**(2026-09-24).
// 설명은 전부 hover(title)로 — 판에 글이 많으면 지저분하다. 고치는 곳은 격자판 하나(여긴 노브가 없다).
// 격자 목록 = 연동된 판 이름(「격자 2」) — ▣ 를 누르면 그 격자판이 열린다.
import { AnchoredPopover } from "../../ui/Dialog.js";
import { openPanelExact } from "../../lib/openPanel.js";
import { BREAKOUT_HIGH } from "../../styles/palette.js";
import type { ChainOverlay } from "./useChainOverlay.js";

const row = {
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent",
    cursor: "pointer", font: "inherit", fontSize: 12, padding: "5px 12px", color: "var(--text-primary)",
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
        <AnchoredPopover anchor={anchor} onClose={onClose} width={240} padding={0} placement="beside" offset={6}>
            <div style={{ padding: "4px 0" }}>
                <button onClick={onToggle} style={row}
                    title={`② 사슬 띠(배경) · 후보 봉 세로 줄 — 사슬 필터 통과는 살짝, ◇ 로 남은 봉은 조금 더 진하게${overlay.why ? `\n지금 안 그리는 이유: ${overlay.why}` : ""}`}>
                    <span style={{ flex: 1 }}>사슬</span>
                    {on && overlay.why !== null && <span style={{ fontSize: 11, color: "var(--warning)" }}>ⓘ</span>}
                    <Switch on={on} />
                </button>
                <button onClick={onToggleBands} style={row} title="① 러닝 고가 밴드(청록)·기준선 밴드(보라)를 테두리 없는 옅은 면으로">
                    <span style={{ flex: 1 }}>밴드</span>
                    <Switch on={showBands} />
                </button>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 12px 2px" }}
                    title="보는 집합의 켜진 「돌파」 줄 중 격자판에 연동된 것(판 이름) — 세로 줄은 그 줄 단독의 후보(다른 조건·전이는 ◇ 가 말한다)">
                    격자
                </div>
                {overlay.rows.length === 0 && (
                    <div style={{ ...row, cursor: "default", color: "var(--text-tertiary)" }} title="생성소에서 「돌파」 줄을 만들고 격자판을 연결한다 — 미연동 줄은 계산하지 않는다">없음</div>
                )}
                {overlay.rows.map((r) => {
                    const cur = src?.stageId === r.stageId;
                    return (
                        <div key={r.stageId} style={{ display: "flex", alignItems: "center" }}>
                            <button onClick={() => onPickSource(r.stageId)} style={{ ...row, flex: 1, minWidth: 0 }} title={`${r.full}\n클릭 = 이 격자로 그린다`}>
                                <span style={{ color: cur ? BREAKOUT_HIGH : "var(--text-tertiary)" }}>{cur ? "●" : "○"}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text}</span>
                            </button>
                            <button onClick={() => { openPanelExact(r.gridPanel); onClose(); }}
                                title="이 격자판 열기 — 격자 정의·사슬 필터는 거기서 고친다"
                                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-tertiary)", padding: "0 12px 0 4px" }}>
                                ▣
                            </button>
                        </div>
                    );
                })}
            </div>
        </AnchoredPopover>
    );
}

function Switch({ on }: { on: boolean }): JSX.Element {
    return (
        <span aria-hidden style={{
            width: 26, height: 14, borderRadius: 7, position: "relative", flexShrink: 0,
            background: on ? BREAKOUT_HIGH : "var(--border-strong)", transition: "background 0.12s",
        }}>
            <span style={{
                position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: "#fff",
                transition: "left 0.12s",
            }} />
        </span>
    );
}
