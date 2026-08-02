// 계산 축 셀 우클릭 메뉴 — 시트에서 "이 자리 기준으로 자르기". 판단 축의 AxisBoundMenu 와 같은 자리·같은 문구지만
// 저장하는 게 다르다: slot 앵커가 아니라 **타점 앵커**라, 수식을 고쳐 값이 움직여도 경계가 함께 따라온다.
// 배치 해제·그룹 컷은 없다(계산 축엔 배치가 없고, 컷은 아직 slot 좌표계라서).
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { FILTER } from "../../styles/palette.js";
import type { AxisValueRange } from "../../store/rankFilterSlice.js";

export function ComputedBoundMenu({ anchor, axisName, valueText, rank, pointKey, ranges, onSet, onClear, onClose }: {
    anchor: { x: number; y: number };
    axisName: string;
    /** 이 셀의 값(표시용) — 무엇을 기준 삼는지 눈에 보이게. */
    valueText: string;
    rank?: { rank: number; total: number };
    pointKey: string;
    ranges: AxisValueRange[];
    onSet: (edge: "from" | "to") => void;
    onClear: () => void;
    onClose: () => void;
}): JSX.Element {
    const cur = ranges[0];
    const isFrom = cur?.from?.kind === "point" && cur.from.point === pointKey;
    const isTo = cur?.to?.kind === "point" && cur.to.point === pointKey;
    const has = ranges.length > 0;
    const arrow = { color: FILTER, fontWeight: 700 };
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={186} padding={0} placement="beside" offset={6}>
            <MenuLabel>{axisName} · {valueText}{rank ? ` · ${rank.rank}/${rank.total}` : ""}</MenuLabel>
            <MenuItem onClick={() => onSet("from")}>
                <span style={arrow}>▶</span> {isFrom ? "이상 경계 해제" : "이 값 이상"}
            </MenuItem>
            <MenuItem onClick={() => onSet("to")}>
                <span style={arrow}>◀</span> {isTo ? "이하 경계 해제" : "이 값 이하"}
            </MenuItem>
            {has && (
                <MenuItem onClick={onClear} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
                    이 축 필터 초기화
                </MenuItem>
            )}
        </AnchoredPopover>
    );
}
