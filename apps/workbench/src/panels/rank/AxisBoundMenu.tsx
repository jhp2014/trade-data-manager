// 축 밴드 경계 메뉴 — "이 지점부터(lo, 이상) / 이 지점까지(hi, 이하)" 지정·해제.
// 배치 보드(레인 스팟 우클릭)와 시트(축 셀 우클릭)가 **같은 메뉴**다: 같은 rankBands 상태를 같은 문구로 만진다.
// 예전엔 두 패널이 각자 FilterMenu·BoundMenu 로 들고 있어 문구는 같은데 색·클램프가 따로 놀았다.
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import type { RankBand, RankBoundEdge } from "../../store/rankFilterSlice.js";
import { FILTER } from "../../styles/palette.js";



export function AxisBoundMenu({ anchor, axisName, band, slotId, onSet, onClear, onClose }: {
    anchor: { x: number; y: number };
    axisName: string;
    band: RankBand | undefined;
    /** 우클릭한 그 자리(슬롯) — 이미 그 경계면 메뉴가 '해제'로 바뀐다(토글). */
    slotId: string;
    onSet: (edge: RankBoundEdge) => void;
    onClear: () => void;
    onClose: () => void;
}): JSX.Element {
    const isLo = band?.lo === slotId;
    const isHi = band?.hi === slotId;
    const hasBand = !!(band?.lo || band?.hi);
    const arrow = { color: FILTER, fontWeight: 700 };
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={176} padding={0} placement="beside" offset={6}>
            <MenuLabel>{axisName} · 필터 경계</MenuLabel>
            <MenuItem onClick={() => onSet("lo")}>
                <span style={arrow}>▶</span> {isLo ? "이상 경계 해제" : "이상 경계(이 지점부터)"}
            </MenuItem>
            <MenuItem onClick={() => onSet("hi")}>
                <span style={arrow}>◀</span> {isHi ? "이하 경계 해제" : "이하 경계(이 지점까지)"}
            </MenuItem>
            {hasBand && (
                <MenuItem onClick={onClear} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
                    이 축 필터 초기화
                </MenuItem>
            )}
        </AnchoredPopover>
    );
}
