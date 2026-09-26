// 테마 술어의 **편집면** — 조건판 테마 줄에서 여는 팝오버(2026-09-26, 옛 "편집면 = 테마 순위 패널·연동"
// 폐지). 값은 술어 payload 에 산다 — 판이 아니라 줄에서 열리므로 "어느 행을 비추나" 주소 문제가 없다.
// 분포를 보며 굵게 잡는 손 = 테마 순위 판의 자유 자 + 「자 값 가져오기」(연동이 아니라 **값 복사**).
import { useMemo, useRef } from "react";
import { THEME_WINDOW_MAX_MIN, type CellPredicate } from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { useDock } from "../../store/dock.js";
import { useWorkbench } from "../../store/workbench.js";
import { useDismiss } from "../../ui/useDismiss.js";
import { parseSlotId } from "../../shell/panelSlots.js";
import { panelTypeOf } from "../../shell/panelCatalog.js";
import { readThemeRuler } from "../themeRank/rulerRead.js";

type ThemePred = Extract<CellPredicate, { kind: "theme" }>;

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11, padding: "2px 0" };
const rowLabel: React.CSSProperties = { width: 52, flexShrink: 0, color: "var(--text-secondary)", fontWeight: 600 };

export function ThemeCondEditor({ at, pred, onWrite, onClose }: {
    at: { x: number; y: number };
    pred: ThemePred;
    onWrite: (next: ThemePred) => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose, true);
    const w = (patch: Partial<ThemePred>): void => onWrite({ ...pred, ...patch });

    // 자 값 가져오기 — 열린 테마 순위 판 중 **최소 슬롯** 하나(카운트 단일 인스턴스의 선례).
    const slots = useDock((s) => s.slots);
    const panelUi = useWorkbench((s) => s.panelUi);
    const ruler = useMemo(() => {
        const scopeIds = slots
            .filter((id) => panelTypeOf(id)?.component === "themeScope")
            .sort((a, b) => (parseSlotId(a)?.n ?? 0) - (parseSlotId(b)?.n ?? 0));
        for (const id of scopeIds) {
            const r = readThemeRuler(panelUi[id]);
            if (r !== null) return r;
        }
        return null;
    }, [slots, panelUi]);

    return (
        <div ref={ref} role="dialog" style={{
            position: "fixed", top: Math.min(at.y + 6, window.innerHeight - 240), left: Math.min(at.x - 6, window.innerWidth - 340),
            zIndex: 300, width: 320, background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "8px 12px 10px",
        }}>
            <div style={row} title="존의 대금 축이 읽는 창 — 당일 누적 또는 최근 T분(자유, 클라 즉석 계산)">
                <span style={rowLabel}>대금 창</span>
                <Seg options={[["day", "당일 누적"], ["win", "최근"]]} value={pred.window === null ? "day" : "win"}
                    onPick={(v) => w({ window: v === "day" ? null : 60 })} />
                {pred.window !== null && (
                    <NumField label="" suffix="분" value={pred.window} min={1}
                        normalize={(v) => Math.min(THEME_WINDOW_MAX_MIN, Math.max(1, Math.round(v)))}
                        onCommit={(v) => w({ window: v })} />
                )}
            </div>
            <div style={row} title="존 = 대금 서수 ≤ N ∧ 등락 축 — 그날 그 분의 상위 무리">
                <span style={rowLabel}>존 정의</span>
                <NumField label="대금 순위 ≤" suffix="" value={pred.zoneAmountN} min={1}
                    normalize={(v) => Math.max(1, Math.round(v))} onCommit={(v) => w({ zoneAmountN: v })} />
                <Seg options={[["rank", "등락 순위 ≤"], ["value", "등락 값 ≥"]]} value={pred.rate.mode}
                    onPick={(v) => w({ rate: v === "rank" ? { mode: "rank", max: pred.rate.mode === "rank" ? pred.rate.max : 30 } : { mode: "value", minPct: pred.rate.mode === "value" ? pred.rate.minPct : 5 } })} />
                {pred.rate.mode === "rank"
                    ? <NumField label="" suffix="" value={pred.rate.max} min={1} normalize={(v) => Math.max(1, Math.round(v))}
                        onCommit={(v) => w({ rate: { mode: "rank", max: v } })} />
                    : <NumField label="" suffix="%" value={pred.rate.minPct}
                        normalize={(v) => Math.round(v * 10) / 10} onCommit={(v) => w({ rate: { mode: "value", minPct: v } })} />}
            </div>
            <CutRow label="재적" hint="존 안 같은 테마 종목 수 ≥ k (자신 포함)" on={pred.countOn} value={pred.countMin} unit="종목"
                onToggle={() => w({ countOn: !pred.countOn })} onValue={(v) => w({ countMin: v })} />
            <CutRow label="존 순위" hint="존에 든 테마 멤버 중 순위 ≤ k — 자신이 존 밖이면 불만족" on={pred.zoneRankOn} value={pred.zoneRankMax} unit="위"
                onToggle={() => w({ zoneRankOn: !pred.zoneRankOn })} onValue={(v) => w({ zoneRankMax: v })} />
            <CutRow label="기본 순위" hint="테마 전 멤버 중 기준 서수 순위 ≤ k (존 무관)" on={pred.baseRankOn} value={pred.baseRankMax} unit="위"
                onToggle={() => w({ baseRankOn: !pred.baseRankOn })} onValue={(v) => w({ baseRankMax: v })} />
            <div style={row} title="순위 컷(존·기본)의 기준 서수 — 등락률 기본, 거래대금 옵션">
                <span style={rowLabel}>기준</span>
                <Seg options={[["rate", "등락"], ["amount", "대금"]]} value={pred.basis} onPick={(v) => w({ basis: v })} />
                <button
                    disabled={ruler === null}
                    onClick={() => {
                        if (ruler === null) return;
                        w({
                            window: ruler.window,
                            ...(ruler.zoneAmountN !== null ? { zoneAmountN: ruler.zoneAmountN } : {}),
                            ...(ruler.rate !== null ? { rate: ruler.rate } : {}),
                        });
                    }}
                    title={ruler === null
                        ? "테마 순위 판에서 자유 자(십자선)를 한 번 움직이면 그 값을 가져올 수 있습니다"
                        : "테마 순위 판의 자 값을 복사 — 창·대금 N·등락 축이 그 자리로(연동이 아니라 복사)"}
                    style={{
                        marginLeft: "auto", fontSize: 10.5, padding: "1px 8px", borderRadius: 4,
                        border: "1px dashed var(--border-strong)", background: "transparent",
                        color: ruler === null ? "var(--text-tertiary)" : "var(--accent-primary)",
                        cursor: ruler === null ? "default" : "pointer",
                    }}>
                    📐 자 값 가져오기
                </button>
            </div>
        </div>
    );
}

function CutRow({ label, hint, on, value, unit, onToggle, onValue }: {
    label: string; hint: string; on: boolean; value: number; unit: string;
    onToggle: () => void; onValue: (v: number) => void;
}): JSX.Element {
    return (
        <div style={row} title={hint}>
            <span style={rowLabel}>{label}</span>
            <button onClick={onToggle} title={on ? "이 컷 끄기(임계값은 남는다)" : "이 컷 켜기"}
                style={{
                    fontSize: 10, padding: "0 7px", borderRadius: 8, lineHeight: "16px", cursor: "pointer",
                    border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                    background: on ? "var(--accent-soft)" : "transparent",
                    color: on ? "var(--accent-primary)" : "var(--text-tertiary)",
                }}>
                {on ? "켬" : "끔"}
            </button>
            <NumField label="≤" suffix={unit} value={value} min={1}
                normalize={(v) => Math.max(1, Math.round(v))} onCommit={onValue} />
        </div>
    );
}

function Seg<T extends string>({ options, value, onPick }: {
    options: readonly (readonly [T, string])[];
    value: T;
    onPick: (v: T) => void;
}): JSX.Element {
    return (
        <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {options.map(([v, text]) => (
                <button key={v} onClick={() => onPick(v)}
                    style={{
                        fontSize: 10.5, padding: "0 8px", border: "none", cursor: "pointer", lineHeight: "18px",
                        background: v === value ? "var(--accent-soft)" : "transparent",
                        color: v === value ? "var(--accent-primary)" : "var(--text-tertiary)",
                    }}>
                    {text}
                </button>
            ))}
        </span>
    );
}
