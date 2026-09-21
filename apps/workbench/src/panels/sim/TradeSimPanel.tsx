// 트레이드 시뮬 패널(A안 — 설정 사이드바형) — 왼쪽 노브 열 3그룹(진입/청산/트레일), 오른쪽 결과 스택
// (분류 띠 → 체결률 곡선 → 분포 4종). 규칙: decisions.md 「시그널 결과」 트레이드 시뮬 항목.
//
// **이 패널은 깔때기의 거울(조건 행 1:1)이 아니다** — 노브가 조건이 아니라 정의 payload(pointDef.sim)라
// 비출 행이 없고, 깔때기와는 **모수**(보는 집합의 생존 시그널)로만 이어진다. 본체는 손익 재현이 아니라
// 도달 측정 — 통계도 분포·비율로만 서고 요약 수치(평균·기대값)는 기각됐다(고가 기준 통계가 실현
// 손익처럼 읽히는 위험).
import { useMemo } from "react";
import type { SimStatus, TradeSimParams } from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { useLabelRows, useSimBasis, useTradeSim } from "../../lib/PointGridsContext.js";
import { parseTradeSimParams } from "../../lib/pointDef.js";
import { pointKeyOf } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { FAIL, LEG_HIGH, POINT_DEF, STRONG } from "../../styles/palette.js";
import { useBoundSet } from "../filter/useBoundSet.js";
import { SetBindingLabel } from "../filter/SetBindingLabel.js";
import { setMembersOf } from "../filter/setMembers.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { Note } from "../filter/grain.js";
import { FillRateCurve } from "./FillRateCurve.js";
import { medianOf, SimDistribution } from "./SimDistribution.js";
import { SIM_STATUS_META, SIM_STATUS_ORDER } from "./simStatusMeta.js";

// 분류 라벨·색 = 시트 상태 셀과 같은 출처(simStatusMeta) — 띠와 셀이 딴말을 하지 않게.
const STATUS_META: readonly { status: SimStatus; label: string; color: string }[] =
    SIM_STATUS_ORDER.map((status) => ({ status, ...SIM_STATUS_META[status] }));

/** 노브 그룹 머리 — A안 왼쪽 열의 시각 언어(색 띠 = 상태기계의 단계). */
function KnobGroup({ color, label, children }: { color: string; label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 6, color, fontWeight: 600, fontSize: 11 }}>{label}</div>
            {children}
        </div>
    );
}

const fmtPct = (v: number | null): string => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export function TradeSimPanel({ panelId = "trade-sim" }: { panelId?: string }): JSX.Element {
    const sim = useTradeSim();
    const basis = useSimBasis();
    // 봉 사실 미도착 라벨 — 모수에서 빠진 결손을 화면이 말한다(3치 — 리뷰 B-1, 0이면 침묵).
    const pendingCount = useLabelRows().pendingKeys.size;
    const simParams = useWorkbench((s) => s.pointDef.sim);
    const setDef = useWorkbench((s) => s.setPointDef);
    const setSim = (patch: Partial<TradeSimParams>): void => setDef({ sim: { ...simParams, ...patch } });
    // 클램프의 단일 출처 = parseTradeSimParams — 입력칸 normalize 가 파서와 갈리면 초안 잔상 버그(NumField 주석).
    const normPct = (v: number): number => parseTradeSimParams({ stopPct: v }).stopPct;
    const normEntry = (v: number): number => parseTradeSimParams({ entry: { anchor: "close", pct: v } }).entry.pct;

    // 모수 = **이 패널이 보는 집합**의 생존 시그널(조건·집합이 걸렸을 때) — 아니면 전 시그널.
    // 기본은 연동이고 이 패널에 고정할 수 있다(2026-09-18 단계 ④). 하루 우주면 셀 집합이 그 자리에 온다.
    const bound = useBoundSet(panelId);
    const selectedView = bound.view;
    // ⚠ `broken`(깨진 참조·못 푸는 바인딩)도 **거르는 상태**다 — null 로 떨어뜨리면 모수가 조용히
    //   전 시그널로 넓어져, 고장난 바인딩이 "더 많은 통계"로 보인다(라벨이 이유를 말하고 있는데도).
    const survivorKeys = useMemo<readonly string[] | null>(
        () => (selectedView.isFiltering
            ? selectedView.viewedPointRefs.map((p) => pointKeyOf(p.stockCode, p.date, p.time))
            : null),
        [selectedView],
    );

    // n/N — 시뮬 값은 라벨 좌표에만 굽혀 있다(sim.byKey). 하루 후보는 "표현 안 됨"으로 서서 그 사실을 말한다.
    const boundMembers = useMemo(
        () => setMembersOf(bound.view, "point", (it) => it.time !== undefined && sim.byKey.has(pointKeyOf(it.stockCode, it.date, it.time))),
        [bound.view, sim],
    );
    const controls: ControlSpec[] = [];

    const agg = useMemo(() => {
        const keys = survivorKeys ?? [...sim.byKey.keys()];
        const counts: Record<SimStatus, number> = { shallow: 0, cancelled: 0, expired: 0, stop: 0, take: 0, open: 0 };
        const peaks: number[] = [];
        const troughs: number[] = [];
        const reqUnfilled: number[] = [];
        const missed: number[] = [];
        const curveReq: number[] = [];
        let total = 0;
        for (const key of keys) {
            const r = sim.byKey.get(key);
            if (!r) continue; // 격자 미도착
            total += 1;
            counts[r.status] += 1;
            if (r.status === "take" && r.peakPct !== null) peaks.push(r.peakPct);
            if (r.status === "stop" && r.troughPct !== null) troughs.push(r.troughPct);
            const unfilled = r.status === "shallow" || r.status === "cancelled" || r.status === "expired";
            if (unfilled && r.requiredPct !== null) reqUnfilled.push(r.requiredPct);
            if (unfilled && r.missedRisePct !== null) missed.push(r.missedRisePct);
            const b = basis.byKey.get(key);
            if (b && b.requiredPct !== null) curveReq.push(b.requiredPct);
        }
        const filled = counts.stop + counts.take + counts.open;
        return { counts, peaks, troughs, reqUnfilled, missed, curveReq, total, filled };
    }, [sim, basis, survivorKeys]);

    const med = (vs: readonly number[]): string => {
        const m = medianOf(vs);
        return m === null ? "—" : fmtPct(m);
    };

    return (
        <div style={{ display: "flex", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)", flexDirection: "column" }}>
            <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
                <SetBindingLabel bound={bound} members={boundMembers} />
                <span
                    className="tabular"
                    style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title={survivorKeys === null
                        ? "모수 = 시그널 전부(조건·집합이 걸리면 보는 집합의 생존 시그널로 좁혀집니다)"
                        : "모수 = 보는 집합의 생존 시그널 — 필터 레일을 조이면 여기 통계가 즉시 따라옵니다"}
                >
                    모수 {agg.total.toLocaleString()}{survivorKeys !== null && " (보는 집합)"} · 체결 {agg.filled.toLocaleString()}
                    {agg.total > 0 && ` (${Math.round((agg.filled / agg.total) * 100)}%)`}
                    {pendingCount > 0 && ` · 대기 ${pendingCount.toLocaleString()}`}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }} title="본체는 도달 측정 — 익절 보고값 = 트레일↑ 눌림 전 최고 도달가, 손절 보고값 = 트레일↓ 반등 전 최저 도달가(진단), 청산 체결가 정밀도는 재지 않습니다">
                    도달 측정
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.tradeSim" />
            </PanelHeader>

            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                {/* ── 왼쪽: 노브 열(상태기계 단계 순) ── */}
                <div style={{ width: 152, flexShrink: 0, borderRight: "1px solid var(--border-subtle)", padding: "8px 8px 8px 10px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                    <KnobGroup color={POINT_DEF} label="진입">
                        <NumField label="타점 −" suffix="%" value={simParams.entry.pct} onCommit={(v) => setSim({ entry: { anchor: "close", pct: v } })} normalize={normEntry}
                            title="지정가 = 시그널 종가 ×(1−n%) — 다음 봉부터. 0 = 즉시 체결(기준선 비교용), 0<n<2 는 2로 올림(격자 해상도 밖)" />
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                                onClick={() => setSim({ cancelRisePct: simParams.cancelRisePct === null ? 5 : null })}
                                title="체결 전에 종가×(1+x%)를 먼저 터치하면 주문 취소(상승 이탈) — '10% 갔다가 무너지며 체결'이 실패 케이스로 잡히는 왜곡 방지"
                                style={cancelChip(simParams.cancelRisePct !== null)}
                            >
                                취소↑
                            </button>
                            {simParams.cancelRisePct !== null && (
                                <NumField label="+" suffix="%" value={simParams.cancelRisePct} min={0.1}
                                    onCommit={(v) => setSim({ cancelRisePct: v })}
                                    normalize={(v) => parseTradeSimParams({ cancelRisePct: v }).cancelRisePct ?? 2} />
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                                onClick={() => setSim({ cancelAfterMin: simParams.cancelAfterMin === null ? 60 : null })}
                                title="시그널 후 m분 안에 체결 안 되면 주문 취소(시간 만료) — 경계 스윙은 미체결 처리(비관)"
                                style={cancelChip(simParams.cancelAfterMin !== null)}
                            >
                                취소⏱
                            </button>
                            {simParams.cancelAfterMin !== null && (
                                <NumField label="" suffix="분" value={simParams.cancelAfterMin} min={0.1}
                                    onCommit={(v) => setSim({ cancelAfterMin: v })}
                                    normalize={(v) => parseTradeSimParams({ cancelAfterMin: v }).cancelAfterMin ?? 1} />
                            )}
                        </div>
                    </KnobGroup>
                    <KnobGroup color={FAIL} label="청산">
                        <NumField label="손절" suffix="%" value={simParams.stopPct} onCommit={(v) => setSim({ stopPct: v })} normalize={normPct} title="체결가 −s% 선터치 = 손절 — 익절과 동시각이면 손절이 이깁니다(비관)" />
                        <NumField label="익절" suffix="%" value={simParams.takePct} onCommit={(v) => setSim({ takePct: v })} normalize={normPct} title="체결가 +t% 선터치 = 익절 — 이후 트레일↑ 무장" />
                    </KnobGroup>
                    <KnobGroup color={LEG_HIGH} label="트레일">
                        <NumField label="↑" suffix="%" value={simParams.trailUpPct} onCommit={(v) => setSim({ trailUpPct: v })} normalize={normPct} title="익절 후 러닝 최고가 대비 u% 눌림에서 측정 종료 — 보고값 = 그 전 최고 도달가(미발동 = 잔여 최고가)" />
                        <NumField label="↓" suffix="%" value={simParams.trailDownPct} onCommit={(v) => setSim({ trailDownPct: v })} normalize={normPct} title="손절 후 러닝 최저가 대비 d% 반등에서 측정 종료 — 보고값 = 그 전 최저 도달가(진단: 손절이 피한 것/타이트했나)" />
                    </KnobGroup>
                </div>

                {/* ── 오른쪽: 결과 스택 ── */}
                <div style={{ flex: 1, minWidth: 0, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                    {sim.total === 0 && <Note>시그널(라벨 좌표)이 아직 없습니다 — 탐색 후보에서 그룹을 배정하거나, 격자·봉 사실 로딩을 기다리세요</Note>}
                    {/* 분류 띠 + 범례 — 6분류(체결 3 + 미체결 3). */}
                    <div>
                        <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden" }}>
                            {STATUS_META.map(({ status, label, color }) => {
                                const c = agg.counts[status];
                                if (c === 0 || agg.total === 0) return null;
                                return <div key={status} title={`${label} ${c.toLocaleString()}`} style={{ width: `${(c / agg.total) * 100}%`, background: color }} />;
                            })}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3, fontSize: 10, color: "var(--text-secondary)" }} className="tabular">
                            {STATUS_META.map(({ status, label, color }) => (
                                <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: "inline-block" }} />
                                    {label} {agg.counts[status].toLocaleString()}
                                </span>
                            ))}
                        </div>
                    </div>

                    <FillRateCurve requiredPcts={agg.curveReq} total={agg.total} entryPct={simParams.entry.pct}
                        onCommit={(pct) => setSim({ entry: { anchor: "close", pct } })} normalize={normEntry} />

                    <SimDistribution label="익절 최고 도달" color={STRONG} values={agg.peaks} count={agg.counts.take}
                        note={`중앙 ${med(agg.peaks)} · 분모 체결가`}
                        title="익절 터치 후 트레일↑ 발동 전 최고 도달 %(체결가 분모) — 미발동은 잔여 세션 최고가" />
                    <SimDistribution label="손절 최저 도달" color={FAIL} values={agg.troughs} count={agg.counts.stop}
                        note={`중앙 ${med(agg.troughs)} · 손익 −${simParams.stopPct}% 고정`}
                        title="손절 터치 후 트레일↓ 반등 전 최저 도달 %(체결가 분모) — 진단값: 손절이 피한 것 / 금방 반등이면 타이트했다는 신호" />
                    <SimDistribution label="미체결 요구 타점" color="#8b95a1" values={agg.reqUnfilled} count={agg.counts.shallow + agg.counts.cancelled + agg.counts.expired}
                        note={`눌림부족 ${agg.counts.shallow} · 이탈 ${agg.counts.cancelled} · 시간 ${agg.counts.expired}`}
                        title="미체결 시그널이 체결되려면 타점 n 이 얼마였어야 했나 — (종가 − 취소 전 최저 눌림가)/종가" />
                    <SimDistribution label="미체결 놓친 상승" color={LEG_HIGH} values={agg.missed} count={agg.missed.length}
                        note="분모 시그널 종가(체결가 부재 — 유일한 예외)"
                        title="미체결 시그널이 그 뒤 어디까지 갔나 — 체결 브랜치와 같은 트레일↑ 규칙, 분모만 시그널 종가" />
                </div>
            </div>
        </div>
    );
}

const cancelChip = (on: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "0 6px",
    border: `1px solid ${on ? POINT_DEF : "var(--border-default)"}`,
    borderRadius: 3,
    color: on ? POINT_DEF : "var(--text-tertiary)",
    background: on ? "var(--accent-soft)" : "transparent",
    fontWeight: 600,
});
