// 거래일 이동 판 — ◀▶ 한 칸 이동 + 날짜 입력 점프 + 거래일 목록(최신 위). 판형 컨트롤 「거래일 이동」의 속.
// ◀▶ 는 crossing 규칙(빈 날 스킵·날짜 고정·상한)을 그대로 타고, 목록 클릭·입력 점프는 **명시 선택**이라
// 그 규칙과 무관하게 곧장 그 날로 간다 — "이 날을 보겠다"고 손으로 집었는데 스킵이 가로채면 안 된다.
import { useEffect, useMemo, useRef, useState } from "react";
import { MENU_PAD, MenuItem, MenuSep } from "../../ui/popover/menu.js";
import { weekdayOf } from "../../lib/date.js";

/**
 * 입력 → 점프할 거래일. 받는 모양: `YYYY-MM-DD` · `YYYYMMDD` · `MM-DD`/`MMDD`(연도는 지금 보는 해).
 * 그 날이 거래일이 아니면 **그 이전의 가장 가까운 거래일**로 스냅(과거 복기라 "그날 또는 직전"이 자연스럽다).
 * 전부보다 이르면 첫 거래일. 목록이 비었거나 모양이 아니면 null.
 */
export function resolveDateInput(raw: string, current: string, dates: readonly string[]): string | null {
    if (dates.length === 0) return null;
    const t = raw.trim();
    let target: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) target = t;
    else if (/^\d{8}$/.test(t)) target = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    else if (/^\d{2}-\d{2}$/.test(t)) target = `${current.slice(0, 4)}-${t}`;
    else if (/^\d{4}$/.test(t)) target = `${current.slice(0, 4)}-${t.slice(0, 2)}-${t.slice(2, 4)}`;
    if (target === null) return null;
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i]! <= target) return dates[i]!;
    return dates[0]!;
}

export function DateJumpMenu({ dates, current, seeking, onPick, onStep }: {
    /** 거래일 목록(오름차순 — 분봉 보유일). */
    dates: readonly string[];
    current: string;
    /** 지금 ◀▶ 로 넘기는 중 — 연타로 손짓이 겹치지 않게 화살표만 잠근다(목록 점프는 즉시라 안 잠근다). */
    seeking: boolean;
    onPick: (date: string) => void;
    onStep: (dir: 1 | -1) => void;
}): JSX.Element {
    const [q, setQ] = useState("");
    const desc = useMemo(() => [...dates].reverse(), [dates]);
    // 열리면 지금 날짜가 보이게 — 목록이 수백 줄이라 맨 위(최신)부터 찾게 두면 판이 매번 낯설다.
    const curRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => { curRef.current?.scrollIntoView({ block: "center" }); }, []);
    const jump = (): void => {
        const d = resolveDateInput(q, current, dates);
        if (d !== null) onPick(d);
    };
    return (
        <div style={{ padding: MENU_PAD }}>
            <div style={{ display: "flex", gap: 6, padding: "2px 8px 6px" }}>
                <button onClick={() => onStep(-1)} disabled={seeking} title="이전 거래일 — 빈 날 스킵·날짜 고정 규칙을 따른다(목록 처음에서 w 로도)" style={stepBtn}>◀ 이전</button>
                <button onClick={() => onStep(1)} disabled={seeking} title="다음 거래일 — 빈 날 스킵·날짜 고정 규칙을 따른다(목록 끝에서 s 로도)" style={stepBtn}>다음 ▶</button>
            </div>
            <div style={{ padding: "0 8px 6px" }}>
                <input value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") jump(); }}
                    placeholder="MM-DD · YYYY-MM-DD 로 점프"
                    title="Enter = 그 날로(거래일이 아니면 직전 거래일로 스냅) — 명시 선택이라 빈 날 스킵·고정과 무관"
                    className="tabular"
                    style={{
                        width: "100%", fontSize: 11, padding: "3px 8px", color: "var(--text-primary)",
                        background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none",
                    }} />
            </div>
            <MenuSep />
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {desc.length === 0 && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>거래일 목록이 아직 없습니다</div>}
                {desc.map((d) => {
                    const cur = d === current;
                    return (
                        <div key={d} ref={cur ? curRef : undefined}>
                            <MenuItem mark="radio" on={cur} selected={cur} onClick={() => onPick(d)}
                                title={cur ? "지금 보는 날" : "이 날로 점프 — 명시 선택(빈 날 스킵·고정과 무관)"}>
                                <span className="tabular">{d} ({weekdayOf(d)})</span>
                            </MenuItem>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const stepBtn: React.CSSProperties = {
    flex: 1, fontSize: 11, padding: "2px 0", borderRadius: 4, whiteSpace: "nowrap",
    border: "1px solid var(--border-default)", background: "none", color: "var(--text-secondary)", cursor: "pointer",
};
