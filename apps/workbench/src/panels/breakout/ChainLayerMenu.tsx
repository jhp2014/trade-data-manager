// 기본 차트 「사슬」 판 — 세 가지만: **사슬 ON/OFF · 밴드 ON/OFF · 적용할 돌파 줄 고르기**(2026-09-24).
// 설명은 전부 hover(title)로 — 판에 글이 많으면 지저분하다. 고치는 곳은 조건판 돌파 팝오버(여긴 노브가 없다).
// 목록 = 켜진 돌파 줄의 요약 라벨(2026-09-26 — 격자판·연동 은퇴).
import { AnchoredPopover } from "../../ui/Dialog.js";
import { MENU_PAD, MenuHead, MenuItem } from "../../ui/popover/menu.js";
import type { ChainOverlay } from "./useChainOverlay.js";

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
    // 켜고 끄기 둘은 ✓ 칸(메뉴 공용 표식 — 2026-09-28 스위치 은퇴), 돌파 줄 고르기는 ●○(하나 고르기).
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={240} padding={MENU_PAD} placement="beside" offset={6}>
            <MenuItem mark="check" on={on} onClick={onToggle}
                title={`② 사슬 띠(배경) · 후보 봉 세로 줄 — 사슬 필터 통과는 살짝, ◇ 로 남은 봉은 조금 더 진하게${overlay.why ? `\n지금 안 그리는 이유: ${overlay.why}` : ""}`}
                trailing={on && overlay.why !== null ? <span style={{ fontSize: 11, color: "var(--warning)" }}>ⓘ</span> : null}>
                사슬
            </MenuItem>
            <MenuItem mark="check" on={showBands} onClick={onToggleBands} title="① 러닝 고가 밴드(청록)·기준선 밴드(보라)를 테두리 없는 옅은 면으로">
                밴드
            </MenuItem>
            <MenuHead sep title="보는 집합의 켜진 「돌파」 줄 — 세로 줄은 그 줄 단독의 후보(다른 조건·전이는 ◇ 가 말한다)">돌파 줄</MenuHead>
            {overlay.rows.length === 0 && (
                <div style={{ padding: "4px 12px", fontSize: 11.5, color: "var(--text-tertiary)" }} title="조건판에서 「돌파」 줄을 만든다 — 값은 그 줄의 팝오버에서">없음</div>
            )}
            {overlay.rows.map((r) => {
                const cur = src?.stageId === r.stageId;
                return (
                    <MenuItem key={r.stageId} mark="radio" on={cur} selected={cur} dim={!cur} onClick={() => onPickSource(r.stageId)}
                        title={`${r.text}\n클릭 = 이 줄로 그린다 — 값은 조건판 칩의 팝오버에서`}>
                        {r.text}
                    </MenuItem>
                );
            })}
        </AnchoredPopover>
    );
}
