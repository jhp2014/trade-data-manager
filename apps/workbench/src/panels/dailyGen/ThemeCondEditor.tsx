// 테마 술어의 **편집면** — 조건판 테마 줄에서 여는 팝오버(2026-09-26, 옛 "편집면 = 테마 순위 패널·연동"
// 폐지). 값은 술어 payload 에 산다 — 판이 아니라 줄에서 열리므로 "어느 행을 비추나" 주소 문제가 없다.
// 분포를 보며 굵게 잡는 손 = 시장 단면 판의 자유 자 + 「자 값 가져오기」(연동이 아니라 **값 복사**).
//
// ## 구획 셋(2026-09-27 A안) — 뜻이 다른 것끼리 섞지 않는다
// · 존 정의 — 창·대금 N·등락 축. 「자 값」이 복사하는 게 정확히 이 셋이라 버튼이 이 머리에 산다.
// · 컷 — 재적·존 순위·기본 순위, 각각 체크 + [하한] ~ [상한](빈칸 = 제한 없음). 「기준」(순위 서수)은 순위 컷
//   에만 걸리므로 이 머리에 산다. 옛 모양은 부호가 한 벌(≤)이라 재적(실제 ≥)이 거꾸로 적혔다.
// · 발화 — 상시 / 진입 시만.
// 표는 열을 맞춘 grid 라 폭 안에서 줄바꿈이 없다(옛 flex-wrap 은 「존 정의」 줄이 넘쳐 값이 다음 줄로 떨어졌다).
import { useMemo, type ReactNode, type RefObject } from "react";
import { THEME_WINDOW_MAX_MIN, type CellPredicate, type ThemeCut } from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { RangePair } from "../../components/RangePair.js";
import { useDock } from "../../store/dock.js";
import { useWorkbench } from "../../store/workbench.js";
import { AnchoredPopover } from "../../ui/popover/AnchoredPopover.js";
import { parseSlotId } from "../../shell/panelSlots.js";
import { panelTypeOf } from "../../shell/panelCatalog.js";
import { readThemeRuler } from "../themeRank/rulerRead.js";

type ThemePred = Extract<CellPredicate, { kind: "theme" }>;

const lbl: React.CSSProperties = { color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" };
const grid = (cols: string): React.CSSProperties => ({ display: "grid", gridTemplateColumns: cols, alignItems: "center", columnGap: 6, rowGap: 4 });

export function ThemeCondEditor({ at, pred, onWrite, onClose, footer, insideRefs }: {
    at: { x: number; y: number };
    pred: ThemePred;
    onWrite: (next: ThemePred) => void;
    onClose: () => void;
    /** 판 밑에 덧붙는 줄 — 사슬 필터 테마 칩의 「칩 순번」(조건판 테마 줄엔 없다). 나머지는 조건판과 한 벌. */
    footer?: ReactNode;
    /** 판을 연 칩 — 판의 "안"(다시 누르면 토글로 닫히게). */
    insideRefs?: RefObject<Element | null>[];
}): JSX.Element {
    const w = (patch: Partial<ThemePred>): void => onWrite({ ...pred, ...patch });

    // 자 값 가져오기 — 열린 시장 단면 판 중 **최소 슬롯** 하나(카운트 단일 인스턴스의 선례).
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

    const W = 340;
    return (
        <AnchoredPopover anchor={at} onClose={onClose} role="dialog" width={W} padding="8px 12px 10px"
            placement="beside" offset={6} shiftX={-6} maxHeight="100vh" style={{ fontSize: 11 }} insideRefs={insideRefs}>
            <Section title="존 정의" hint="존 = 대금 서수 ≤ N ∧ 등락 축 — 그날 그 분의 상위 무리"
                right={
                    <button
                        disabled={ruler === null}
                        onClick={() => {
                            if (ruler === null) return;
                            // 자는 등락 값의 **하한 한 선**만 안다 — 팝오버에서 잡은 상한은 그 위에 있을 때 남긴다
                            // (조용히 지우면 5~15% 가 ≥5% 로 번진다 — 리뷰 지적).
                            const keepMax = ruler.rate?.mode === "value" && pred.rate.mode === "value" && pred.rate.maxPct !== undefined
                                && (ruler.rate.minPct === undefined || pred.rate.maxPct >= ruler.rate.minPct)
                                ? pred.rate.maxPct : undefined;
                            w({
                                window: ruler.window,
                                ...(ruler.zoneAmountN !== null ? { zoneAmountN: ruler.zoneAmountN } : {}),
                                ...(ruler.rate !== null ? { rate: keepMax !== undefined ? { ...ruler.rate, maxPct: keepMax } as typeof ruler.rate : ruler.rate } : {}),
                            });
                        }}
                        title={ruler === null
                            ? "시장 단면 판에서 자유 자(십자선)를 한 번 움직이면 그 값을 가져올 수 있습니다"
                            : "시장 단면 판의 자 값을 복사 — 창·대금 N·등락 축이 그 자리로(연동이 아니라 복사)"}
                        style={{
                            fontSize: 10, padding: "0 6px", borderRadius: 4, lineHeight: "16px",
                            border: "1px dashed var(--border-strong)", background: "transparent",
                            color: ruler === null ? "var(--text-tertiary)" : "var(--accent-primary)",
                            cursor: ruler === null ? "default" : "pointer",
                        }}>
                        📐 자 값
                    </button>
                }>
                <div style={grid("52px auto 1fr")}>
                    <span style={lbl} title="존의 대금 축이 읽는 창 — 당일 누적 또는 최근 T분(자유, 클라 즉석 계산)">대금 창</span>
                    <Seg options={[["day", "당일 누적"], ["win", "최근"]]} value={pred.window === null ? "day" : "win"}
                        onPick={(v) => w({ window: v === "day" ? null : 60 })} />
                    <span>
                        {pred.window !== null && (
                            <NumField label="" suffix="분" value={pred.window} min={1}
                                normalize={(v) => Math.min(THEME_WINDOW_MAX_MIN, Math.max(1, Math.round(v)))}
                                onCommit={(v) => w({ window: v })} />
                        )}
                    </span>

                    <span style={lbl}>대금</span>
                    <NumField label="순위 ≤" suffix="" value={pred.zoneAmountN} min={1}
                        title="대금 서수 ≤ N — 존은 상위 무리라 상한만"
                        normalize={(v) => Math.max(1, Math.round(v))} onCommit={(v) => w({ zoneAmountN: v })} />
                    <span />

                    <span style={lbl}>등락</span>
                    <Seg options={[["rank", "순위 ≤"], ["value", "값 %"]]} value={pred.rate.mode}
                        onPick={(v) => w({
                            rate: v === "rank"
                                ? { mode: "rank", max: pred.rate.mode === "rank" ? pred.rate.max : 30 }
                                : pred.rate.mode === "value" ? pred.rate : { mode: "value", minPct: 5 },
                        })} />
                    <span>
                        {pred.rate.mode === "rank"
                            ? <NumField label="" suffix="" value={pred.rate.max} min={1} normalize={(v) => Math.max(1, Math.round(v))}
                                onCommit={(v) => w({ rate: { mode: "rank", max: v } })} />
                            : <RangePair value={{ min: pred.rate.minPct, max: pred.rate.maxPct }} unit="%"
                                onCommit={(r) => w({ rate: { mode: "value", ...(r.min !== undefined ? { minPct: r.min } : {}), ...(r.max !== undefined ? { maxPct: r.max } : {}) } })} />}
                    </span>
                </div>
            </Section>

            <Section title="컷 — 빈칸 = 제한 없음" hint="켜진 컷을 한 테마가 전부 만족해야 통과(테마 단위 AND · 테마 간 ∃)"
                right={
                    <span title="순위 컷(존·기본)의 기준 서수 — 등락률 기본, 거래대금 옵션" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 400 }}>순위 기준</span>
                        <Seg options={[["rate", "등락"], ["amount", "대금"]]} value={pred.basis} onPick={(v) => w({ basis: v })} />
                    </span>
                }>
                <div style={grid("14px 52px auto 1fr")}>
                    <CutRow label="재적" hint="존 안 같은 테마 종목 수(자신 포함) — 3~5 처럼 상한을 주면 번진 날을 뺀다. 빈 하한 = 1(존에 없으면 재적 아님)" unit="종목"
                        cut={pred.count} onWrite={(c) => w({ count: c })} />
                    <CutRow label="존 순위" hint="존에 든 테마 멤버 중 순위 — 자신이 존 밖이면 불만족. 2~ 로 대장을 빼면 후발만" unit="위"
                        cut={pred.zoneRank} onWrite={(c) => w({ zoneRank: c })} />
                    <CutRow label="기본 순위" hint="테마 전 멤버 중 기준 서수 순위(존 무관)" unit="위"
                        cut={pred.baseRank} onWrite={(c) => w({ baseRank: c })} />
                </div>
            </Section>

            <Section title="발화" hint="상시: 판정이 참인 매 분 · 진입 시만: 직전 분에는 아니었던 분만(첫 분은 진입)">
                <Seg options={[["always", "상시"], ["enter", "진입 시만"]]} value={pred.enter === true ? "enter" : "always"}
                    onPick={(v) => w(v === "enter" ? { enter: true } : { enter: undefined })} />
            </Section>
            {footer}
        </AnchoredPopover>
    );
}

function Section({ title, hint, right, children }: { title: string; hint: string; right?: React.ReactNode; children: React.ReactNode }): JSX.Element {
    return (
        <section style={{ marginTop: 6 }}>
            <div title={hint} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)" }}>
                <span style={{ whiteSpace: "nowrap" }}>{title}</span>
                <span style={{ flex: 1, borderTop: "1px solid var(--border-subtle)" }} />
                {right}
            </div>
            {children}
        </section>
    );
}

/** 컷 한 줄 — 체크(켬) · 이름 · [하한] ~ [상한] 단위. 끈 컷도 값을 고칠 수 있다(다시 켤 때 제자리). */
function CutRow({ label, hint, unit, cut, onWrite }: {
    label: string; hint: string; unit: string; cut: ThemeCut; onWrite: (c: ThemeCut) => void;
}): JSX.Element {
    const dim = !cut.on;
    return (
        <>
            <input type="checkbox" checked={cut.on} aria-label={`${label} 켜기`} title={cut.on ? "이 컷 끄기(경계는 남는다)" : "이 컷 켜기"}
                onChange={() => onWrite({ ...cut, on: !cut.on })} style={{ margin: 0, accentColor: "var(--accent-primary)", cursor: "pointer" }} />
            <span style={{ ...lbl, color: dim ? "var(--text-tertiary)" : lbl.color }} title={hint}>{label}</span>
            <RangePair value={cut} unit={unit} int floor={1} dim={dim}
                onCommit={(r) => onWrite({ on: cut.on, ...r })} />
            <span />
        </>
    );
}

function Seg<T extends string>({ options, value, onPick }: {
    options: readonly (readonly [T, string])[];
    value: T;
    onPick: (v: T) => void;
}): JSX.Element {
    return (
        <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden", justifySelf: "start" }}>
            {options.map(([v, text]) => (
                <button key={v} onClick={() => onPick(v)}
                    style={{
                        fontSize: 10.5, padding: "0 8px", border: "none", cursor: "pointer", lineHeight: "18px", whiteSpace: "nowrap",
                        background: v === value ? "var(--accent-soft)" : "transparent",
                        color: v === value ? "var(--accent-primary)" : "var(--text-tertiary)",
                    }}>
                    {text}
                </button>
            ))}
        </span>
    );
}
