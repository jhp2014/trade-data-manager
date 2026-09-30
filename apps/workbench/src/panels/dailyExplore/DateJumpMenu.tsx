// 거래일 이동 판 — ◀▶ 한 칸 이동 + **연/월/일 세 줄**로 좁혀 가는 점프(2026-09-30 사용자 확정 —
// 평탄한 전체 목록·날짜 입력은 은퇴: 수백 줄 스크롤보다 탭처럼 연 따로 월 따로 일 따로가 빠르다).
// ◀▶ 는 crossing 규칙(빈 날 스킵·날짜 고정·상한)을 그대로 타고, 일 클릭은 **명시 선택**이라
// 그 규칙과 무관하게 곧장 그 날로 간다 — "이 날을 보겠다"고 손으로 집었는데 스킵이 가로채면 안 된다.
// 줄에는 데이터가 있는 연·월만 선다(빈 달을 회색으로 세워 두면 "왜 안 눌리지"만 남는다).
import { useEffect, useMemo, useState } from "react";
import { MENU_PAD, MenuSep } from "../../ui/popover/menu.js";
import { weekdayOf } from "../../lib/date.js";

/** 거래일 목록(오름차순) → 연 → 월 → 날짜들. 순수 색인이라 테스트 표면이다. */
export function indexDates(dates: readonly string[]): Map<string, Map<string, string[]>> {
    const out = new Map<string, Map<string, string[]>>();
    for (const d of dates) {
        const y = d.slice(0, 4);
        const m = d.slice(5, 7);
        const months = out.get(y) ?? new Map<string, string[]>();
        if (!out.has(y)) out.set(y, months);
        const days = months.get(m) ?? [];
        if (!months.has(m)) months.set(m, days);
        days.push(d);
    }
    return out;
}

/** 고른 값이 목록에 없을 때 — 숫자로 가장 가까운 것으로(연을 바꿔도 보던 달 근처에 머물게). */
export function nearestOf(options: readonly string[], want: string): string {
    if (options.length === 0) return want;
    let best = options[0]!;
    for (const o of options) if (Math.abs(Number(o) - Number(want)) < Math.abs(Number(best) - Number(want))) best = o;
    return best;
}

export function DateJumpMenu({ dates, current, seeking, onPick, onStep }: {
    /** 거래일 목록(오름차순 — 분봉 보유일). */
    dates: readonly string[];
    current: string;
    /** 지금 ◀▶ 로 넘기는 중 — 연타로 손짓이 겹치지 않게 화살표만 잠근다(일 클릭은 즉시라 안 잠근다). */
    seeking: boolean;
    onPick: (date: string) => void;
    onStep: (dir: 1 | -1) => void;
}): JSX.Element {
    const byYm = useMemo(() => indexDates(dates), [dates]);
    // 고른 연·월 — null = 지금 보는 날짜를 따른다. ◀▶ 등으로 날짜가 바뀌면 선택을 버리고 다시 따른다
    // (판을 든 채 날짜를 넘겼는데 일 줄이 옛 달에 머물면 "어디를 보고 있나"가 갈린다).
    const [sel, setSel] = useState<{ y: string; m: string } | null>(null);
    useEffect(() => setSel(null), [current]);

    const years = useMemo(() => [...byYm.keys()], [byYm]);
    const wantY = sel?.y ?? current.slice(0, 4);
    const y = byYm.has(wantY) ? wantY : nearestOf(years, wantY);
    const months = useMemo(() => [...(byYm.get(y)?.keys() ?? [])], [byYm, y]);
    const wantM = sel?.m ?? current.slice(5, 7);
    const m = months.includes(wantM) ? wantM : nearestOf(months, wantM);
    const days = byYm.get(y)?.get(m) ?? [];

    return (
        <div style={{ padding: MENU_PAD }}>
            <div style={{ display: "flex", gap: 6, padding: "2px 8px 6px" }}>
                <button onClick={() => onStep(-1)} disabled={seeking} title="이전 거래일 — 빈 날 스킵·날짜 고정 규칙을 따른다(목록 처음에서 w 로도)" style={stepBtn}>◀ 이전</button>
                <button onClick={() => onStep(1)} disabled={seeking} title="다음 거래일 — 빈 날 스킵·날짜 고정 규칙을 따른다(목록 끝에서 s 로도)" style={stepBtn}>다음 ▶</button>
            </div>
            <MenuSep />
            {dates.length === 0 && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>거래일 목록이 아직 없습니다</div>}
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "6px 8px 0" }}>
                {years.map((o) => (
                    <button key={o} onClick={() => setSel({ y: o, m })} title={`${o}년`}
                        style={pickChip(o === y)}>
                        {o}
                    </button>
                ))}
            </div>
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "5px 8px 0" }}>
                {months.map((o) => (
                    <button key={o} onClick={() => setSel({ y, m: o })} title={`${y}년 ${Number(o)}월`}
                        style={pickChip(o === m)}>
                        {Number(o)}월
                    </button>
                ))}
            </div>
            <div style={{ height: 6 }} />
            <MenuSep />
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "6px 8px 2px" }}>
                {days.map((d) => {
                    const cur = d === current;
                    return (
                        <button key={d} onClick={() => onPick(d)}
                            title={`${d} (${weekdayOf(d)})${cur ? " — 지금 보는 날" : " — 이 날로 점프(빈 날 스킵·고정과 무관)"}`}
                            style={{
                                width: 30, padding: "2px 0", textAlign: "center", fontSize: 11, borderRadius: 4,
                                border: "none", cursor: "pointer",
                                background: cur ? "var(--accent-primary)" : "none",
                                color: cur ? "#fff" : "var(--text-secondary)", fontWeight: cur ? 600 : 400,
                            }}>
                            {Number(d.slice(8, 10))}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** 연·월 고르기 칩 — 고른 것 = 옅은 액센트 면(세그먼트의 켜진 칸과 같은 결). */
const pickChip = (on: boolean): React.CSSProperties => ({
    fontSize: 10.5, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", whiteSpace: "nowrap",
    background: on ? "var(--accent-soft)" : "none",
    color: on ? "var(--accent-hover)" : "var(--text-tertiary)", fontWeight: on ? 600 : 400,
});

const stepBtn: React.CSSProperties = {
    flex: 1, fontSize: 11, padding: "2px 0", borderRadius: 4, whiteSpace: "nowrap",
    border: "1px solid var(--border-default)", background: "none", color: "var(--text-secondary)", cursor: "pointer",
};
