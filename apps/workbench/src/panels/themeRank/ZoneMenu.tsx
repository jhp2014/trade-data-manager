// 「존 ▾」 판 — 보는 집합의 테마 조건 전부(묶음 속·꺼진 줄 포함). 고르면 존 정의를 **복사**한다.
// 시장 단면·존 추세 판이 같은 목록을 쓴다 — 고른 뒤의 일(단면 = 축·창까지 맞춤, 존 추세 = zone 만)은
// onPick 호출자의 몫이다(decisions.md 「존 추세 판」).
import { useMemo } from "react";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { selectObservedExpr, useWorkbench } from "../../store/workbench.js";
import { themeZoneLabel } from "../filter/themeLabel.js";
import { MENU_PAD, MenuHead, MenuItem, MenuSep } from "../../ui/popover/menu.js";
import { defaultScopeZone, themeZoneSourcesOf, type ScopeZone } from "./zoneSources.js";

export function ZoneMenu({ zone, onPick }: { zone: ScopeZone | null; onPick: (z: ScopeZone | null) => void }): JSX.Element {
    const expr = useWorkbench(selectObservedExpr);
    const sets = useWorkbench((s) => s.savedSets);
    const sources = useMemo(() => themeZoneSourcesOf(expr, sets), [expr, sets]);
    const def = defaultScopeZone();
    return (
        <div style={{ padding: MENU_PAD }}>
            <MenuHead title="고르면 그 조건의 존 정의(창·대금 순위·등락 축)를 이 판에 복사한다 — 참조가 아니라 원본을 고쳐도 안 따라간다. 컷(재적·순위)은 판정이라 안 가져온다">
                걸린 테마 조건
            </MenuHead>
            {sources.length === 0 && (
                <div style={{ padding: "2px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>보는 집합에 테마 조건이 없다</div>
            )}
            {sources.map((src) => (
                <MenuItem key={src.key} mark="radio" on={zone?.key === src.key} dim={!src.enabled}
                    title={src.enabled ? src.label : `${src.label} — 꺼진 줄(복사는 된다)`}
                    onClick={() => onPick(src.zone)}>
                    {src.label}
                </MenuItem>
            ))}
            <MenuSep />
            <MenuItem mark="radio" on={zone?.key === def.key} onClick={() => onPick(def)}
                title={`테마 조건 기본값의 존 — ${themeZoneLabel(DEFAULT_THEME_ZONE)}`}>
                기본값으로
            </MenuItem>
            <MenuItem mark="radio" on={zone === null} onClick={() => onPick(null)} title="존 선을 안 긋는다">
                끄기
            </MenuItem>
        </div>
    );
}
