// 상태 토큰 복사 — 경로의 (종목, 날짜, 일봉 선)에서 구간을 골라 토큰을 클립보드로(DESIGN 9절 「일봉 선」).
// 선 n 개가 나눈 구간 n+1 개를 가격이 높은 쪽부터 늘어놓는다. 선이 없으면 고를 것이 없다(`종목@날짜`).
import { formatState, lineRef, linePrice, sortLines, type DailyLine } from "../lib/stateToken.js";
import type { LabDailyCandle } from "../market/types.js";
import { MENU_PAD, MenuItem } from "../ui/popover/menu.js";

export interface PricedLine {
    line: DailyLine;
    ref: string;
    price: number | null;
}

/** 경로의 선 → 이름·가격(낮은 선부터). 가격을 모르는 선(그 날 봉이 일봉에 없음)은 맨 뒤·null. */
export function priceLines(daily: readonly LabDailyCandle[], lines: readonly DailyLine[]): PricedLine[] {
    return sortLines(lines.map((line) => ({ line, ref: lineRef(line), price: linePrice(daily, line) })));
}

export interface Zone {
    /** 낮은 선부터 몇 개 위인가(▲ 의 수). */
    k: number;
    label: string;
    token: string;
}

const won = (n: number | null): string => (n == null ? "?" : n.toLocaleString());

/** 구간 목록 — 가격이 높은 구간부터(판에서 위에서 아래로 = 가격 축 그대로). */
export function zonesOf(code: string, date: string, sorted: readonly PricedLine[]): Zone[] {
    const n = sorted.length;
    if (n === 0) return [{ k: 0, label: "선 없음", token: formatState(code, date, [], 0) }];
    const zones: Zone[] = [];
    for (let k = n; k >= 0; k--) {
        const below = k > 0 ? sorted[k - 1] : null;
        const above = k < n ? sorted[k] : null;
        const label =
            below && above ? `${won(below.price)} ~ ${won(above.price)} 사이` : below ? `${won(below.price)} 위 (${below.ref})` : `${won(above!.price)} 아래 (${above!.ref})`;
        zones.push({ k, label, token: formatState(code, date, sorted, k) });
    }
    return zones;
}

/** 복사 판의 속 — 구간 하나를 누르면 그 토큰이 복사된다. */
export function StateCopyMenu({ zones, selected, onPick }: { zones: readonly Zone[]; selected: number | null; onPick: (z: Zone) => void }): JSX.Element {
    return (
        <div style={{ padding: MENU_PAD, minWidth: 220 }}>
            {zones.length === 0 && <div style={{ padding: "4px 12px", fontSize: 11.5, color: "var(--text-3)" }}>차트를 불러오는 중…</div>}
            {zones.map((z) => (
                <MenuItem key={z.k} onClick={() => onPick(z)} selected={z.k === selected} title={z.token}>
                    <span className="tabular">{z.label}</span>
                </MenuItem>
            ))}
        </div>
    );
}
