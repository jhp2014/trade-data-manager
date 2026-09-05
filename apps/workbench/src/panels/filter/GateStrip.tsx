// 게이트 분포 스트립 — 정의층(모수 선언)에 이식한 레일의 예지 감각(2026-09-06, decisions.md 「깔때기 조건 UI」).
//
// 모수 = **레벨당 최대 자격 대금**(core levelMaxTvOf): 레벨 소멸 조건(max tv < gate)이 게이트에
// 단조라, 정의층에서 정직하게 성립하는 유일한 분포다(등가는 recon:gate-dist 전수 대조로 증명).
// 봉 "이동" 수는 비단조라 표기하지 않고, 슬롯 2 는 모수에서 뺀다(후보 집합이 게이트의 함수) —
// 그래서 "소멸 N"은 시그널 소멸의 **하한**이다. 필터 레일이 아니다: FILTER 빨강 금지, POINT_DEF teal.
//
// 분포 memo 는 게이트 2필드를 **안 본다**(buildGateDistribution 의 PointCandidateDef 계약) —
// 게이트를 바꿔도 막대는 불변, 컷선·색·정산만 움직인다(스트립의 존재 이유 = "드래그 전에 보인다").
// 게이트 커밋은 칸 클릭 한 번(NumField 와 같은 경로 — 전 파생 재계산이라 연속 드래그는 두지 않는다).
import { useMemo } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { buildGateDistribution, gateValueAt } from "../../lib/gateDistribution.js";
import { valueToFrac } from "../../lib/computedAxis.js";
import { clamp01 } from "../../lib/num.js";
import { POINT_DEF } from "../../styles/palette.js";
import { RAIL_LABEL_W, RAIL_PAD } from "./rail/Rail.js";
import { binCenter, HIST_BINS, histogramOf, logHeight } from "./rail/railHistogram.js";

const ROW_H = 54;
const BAR_H = 40;

const eokLabel = (v: number): string => `${Math.round(v).toLocaleString()}억`;

/** 줄의 낟알 어휘 — 돌파 줄과 재돌파 줄이 **다른 자**를 쓴다(라벨·툴팁이 항상 말한다). */
const GRAIN = {
    baseline: {
        label: "돌파",
        unit: "자 = 레벨 0(차트당 ≤1)",
        deadTitle: (gate: number) =>
            `게이트 ${gate}억에서 소멸하는 돌파 시그널(레벨 0) 수 — 차트 자체는 재돌파 시그널로 남을 수 있음. ` +
            `소멸 = 최대 자격 대금 < 게이트(정확값, 등가 정리). 슬롯 2 재돌파는 이 그림에 없음`,
    },
    renewal: {
        label: "재돌파",
        unit: "자 = 마디 레벨",
        deadTitle: (gate: number) =>
            `게이트 ${gate}억에서 소멸하는 마디 레벨(≥1) 수 — 최대 자격 대금 < 게이트(정확값, 등가 정리). ` +
            `슬롯 2 재돌파는 이 그림에 없어 시그널 소멸은 이보다 많을 수 있음`,
    },
} as const;

export function GateStrip(): JSX.Element | null {
    const grids = usePointGrids();
    // 개별 필드 구독 — 통째 s.pointDef 구독이면 T 드래그·게이트 입력마다 분포 memo 의 입력 객체가
    // 갈려 전수 순회가 헛돈다(useAutoPointsValue 와 같은 규율).
    const excludeUptoMin = useWorkbench((s) => s.pointDef.excludeUptoMin);
    const mergeRisePct = useWorkbench((s) => s.pointDef.mergeRisePct);
    const bullOnly = useWorkbench((s) => s.pointDef.bullOnly);
    const approachPct = useWorkbench((s) => s.pointDef.approachPct);
    const baselineGateEok = useWorkbench((s) => s.pointDef.baselineGateEok);
    const renewalGateEok = useWorkbench((s) => s.pointDef.renewalGateEok);
    const setDef = useWorkbench((s) => s.setPointDef);

    const dist = useMemo(
        () => (grids.byDate ? buildGateDistribution(grids.byDate, { excludeUptoMin, mergeRisePct, bullOnly, approachPct }) : null),
        [grids.byDate, excludeUptoMin, mergeRisePct, bullOnly, approachPct],
    );
    if (!dist || dist.domain === null) return null;
    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <StripRow kind="baseline" values={dist.baseline} gateEok={baselineGateEok} onCommit={(v) => setDef({ baselineGateEok: v })} domain={dist.domain} showEndLabels />
            <StripRow kind="renewal" values={dist.renewal} gateEok={renewalGateEok} onCommit={(v) => setDef({ renewalGateEok: v })} domain={dist.domain} />
        </div>
    );
}

function StripRow({ kind, values, gateEok, onCommit, domain, showEndLabels }: {
    kind: keyof typeof GRAIN;
    values: readonly number[];
    gateEok: number;
    onCommit: (v: number) => void;
    domain: { min: number; max: number };
    showEndLabels?: boolean;
}): JSX.Element {
    const g = GRAIN[kind];
    const hist = useMemo(() => histogramOf(values.map((v) => valueToFrac(v, domain, "higher", "log")), undefined), [values, domain]);
    // 정산은 칸이 아니라 **값**으로 센다(비닝 오차 없는 정확한 수) — 등가 정리 그대로: 소멸 ⟺ max < gate.
    const dead = values.reduce((n, v) => n + (v < gateEok ? 1 : 0), 0);
    // 단일값 도메인(span 0)은 valueToFrac 이 무조건 0.5 라 컷선이 게이트와 무관해진다 — 값 비교로 방향만 잡는다.
    const gateFrac = domain.max > domain.min ? valueToFrac(gateEok, domain, "higher", "log") : gateEok <= domain.min ? 0 : 1;
    const at = (f: number): string => `calc(${RAIL_PAD}px + ${clamp01(f)} * (100% - ${2 * RAIL_PAD}px))`;
    return (
        <div style={{ display: "flex", height: ROW_H, background: "var(--bg-secondary)", borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "4px 6px 6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 9, lineHeight: 1.3, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    {g.label} <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>{g.unit}</span>
                </span>
                <span title={g.deadTitle(gateEok)}>
                    소멸 <b style={{ color: "var(--text-secondary)" }}>{dead.toLocaleString()}</b> / 생존 <b style={{ color: POINT_DEF }}>{(values.length - dead).toLocaleString()}</b>
                </span>
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                {showEndLabels && (
                    <>
                        <span style={{ position: "absolute", left: RAIL_PAD, top: 1, fontSize: 8.5, color: "var(--text-tertiary)", pointerEvents: "none" }}>{eokLabel(domain.min)}</span>
                        <span style={{ position: "absolute", right: RAIL_PAD, top: 1, fontSize: 8.5, color: "var(--text-tertiary)", pointerEvents: "none" }}>{eokLabel(domain.max)} (로그)</span>
                    </>
                )}
                <div style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, bottom: 6, height: BAR_H, display: "flex", alignItems: "flex-end" }}>
                    {hist.bins.map((b, i) => {
                        const c = binCenter(i, HIST_BINS);
                        const deadSide = c < gateFrac;
                        const h = logHeight(b.count, hist.max) * BAR_H;
                        // 커밋값 = 칸 왼쪽 끝의 **내림** 정수 억 — floor 라야 "클릭한 칸이 통째로 생존"이
                        // 항상 참이다(round 는 왼끝 23.8 을 24 로 올려 칸 일부를 소멸 쪽에 밀 수 있다).
                        // 툴팁이 이 값을 그대로 말한다(표기값 ≠ 커밋값 불일치 금지).
                        const commitEok = Math.max(1, Math.floor(gateValueAt(i / HIST_BINS, domain)));
                        return (
                            <div
                                key={i}
                                data-bin={i}
                                onClick={() => onCommit(commitEok)}
                                title={`~${eokLabel(gateValueAt(c, domain))} · ${b.count.toLocaleString()}건${deadSide ? " (현재 게이트 아래 — 소멸)" : ""} · 클릭 = 게이트 ${commitEok}억`}
                                style={{ flex: 1, position: "relative", height: "100%", overflow: "hidden", cursor: "pointer" }}
                            >
                                {b.count > 0 && (
                                    <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: deadSide ? "var(--border-default)" : POINT_DEF }} />
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* 컷선 — 손잡이(NumField·칸 클릭)와 같은 자리에 서야 하므로 translateX(-50%) 중심 정렬(0.5px 실측 선례). */}
                <span aria-hidden style={{ position: "absolute", left: at(gateFrac), transform: "translateX(-50%)", top: 3, bottom: 4, width: 1.5, background: POINT_DEF, pointerEvents: "none" }} />
                {/* 게이트 라벨 — 행 위 여백(top 2)에 배경 필로 얹는다(bottom 계산식은 ROW_H 를 넘겨 잘렸었다).
                    끝 라벨(도메인 min/max)과 같은 줄이지만 실도메인에선 컷(30·50억)이 왼끝에서 수십 px 떨어져 안 겹친다. */}
                <span style={{ position: "absolute", left: at(gateFrac), transform: "translateX(-50%)", top: 2, fontSize: 8.5, fontWeight: 700, color: POINT_DEF, background: "var(--bg-secondary)", padding: "0 2px", whiteSpace: "nowrap", pointerEvents: "none" }}>
                    {gateEok}억
                </span>
            </div>
        </div>
    );
}
