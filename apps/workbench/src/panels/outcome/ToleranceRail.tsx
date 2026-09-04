// 허용 폭 T 레일 — **구간 필터가 아니라 값 하나(T1) + Δ 관찰 폭(T2)** 이라 Rail 을 안 쓰고 따로 그린다
// (2026-09-04 A안 확정: 옛 "양끝 대칭 구간" UI 를 뒤집음). 범용 Rail/railModel 은 대칭 구간의 손짓
// 대수인데 여기 손짓은 비대칭이다 — 왼끝 2% 는 zigzag 해상도라 못 움직이는 고정점이고, 두 핸들의
// 격도 다르다: **T1 = 주 핸들(기본 허용 — 여기까지의 눌림은 연속 상승으로 흡수, 술어·레일·차트의 기준)**,
// T2 = 보조 핸들(Δ 관찰 구간의 오른끝). 빈 트랙 탭/드래그도 T1 이동이다(컷 레일의 탭 의미론).
//
// 드래그 규칙: **T1 을 끌면 T2 가 Δ폭을 유지한 채 따라온다**(B안의 "상대 폭" 성질을 손짓으로 흡수),
// T2 핸들만 Δ폭을 바꾼다(하한 = T1). 커밋은 손 뗄 때 한 번(Rail 규약 — 드래그 중 store 갱신이면
// 단면 재계산이 프레임마다 돈다). 시각 문법(이름 열 폭·행 높이·스트립 로그 y)은 Rail 과 맞춘다 —
// 같은 패널에 서는 줄들이라 격자가 갈리면 목록으로 안 읽힌다.
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { TOLERANCE_MAX_PCT, TOLERANCE_MIN_PCT } from "@trade-data-manager/market/domain";
import { clamp01 } from "../../lib/num.js";
import { useWorkbench } from "../../store/workbench.js";
import { LEG_HIGH } from "../../styles/palette.js";
import { RAIL_LABEL_W, RAIL_PAD, RAIL_ROW_H } from "../filter/rail/Rail.js";
import { binCenter, HIST_BINS, histogramOf, logHeight } from "../filter/rail/railHistogram.js";

const SPAN = TOLERANCE_MAX_PCT - TOLERANCE_MIN_PCT;
const toFrac = (v: number): number => clamp01((v - TOLERANCE_MIN_PCT) / SPAN);
/** 0.5%p 스냅 — 드래그로 잡을 수 있는 해상도(레일 폭 대비 0.25% 미만은 손으로 못 가른다). */
const fromFrac = (f: number): number => Math.round((TOLERANCE_MIN_PCT + clamp01(f) * SPAN) * 2) / 2;

const HIST_ROW_H = 58;
const HIST_BAR_H = 44;

type TDrag = { kind: "t1"; deltaPct: number } | { kind: "t2" };

export function ToleranceRail({ breakDepths }: {
    /**
     * 모든 breakpoint 깊이(%, 시그널당 여러 개 — 연장 **사건**당 하나, useOutcomes.breakDepths).
     * T 와 무관한 고정 분포라 스트립·누적 곡선을 미리 그려 둔다. 30% 초과는 오른끝에 접힌다(도메인 클램프).
     */
    breakDepths: readonly number[];
}): JSX.Element {
    const t1 = useWorkbench((s) => s.pointDef.toleranceT1Pct);
    const t2 = useWorkbench((s) => s.pointDef.toleranceT2Pct);
    const setDef = useWorkbench((s) => s.setPointDef);

    const trackRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<TDrag | null>(null);
    // 미리보기 — 커밋(setDef)은 손 뗄 때 한 번. 드래그 중엔 이 로컬 값만 그린다.
    const [preview, setPreview] = useState<{ t1: number; t2: number } | null>(null);
    const shown = preview ?? { t1, t2 };

    const fracAt = (clientX: number): number => {
        const el = trackRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        return clamp01((clientX - rect.left - RAIL_PAD) / Math.max(1, rect.width - 2 * RAIL_PAD));
    };

    const applyDrag = (drag: TDrag, frac: number): { t1: number; t2: number } => {
        if (drag.kind === "t2") {
            const cur = preview ?? { t1, t2 };
            return { t1: cur.t1, t2: Math.max(cur.t1, fromFrac(frac)) };
        }
        // T1 이동 — Δ폭(잡은 순간의 t2−t1)을 유지한 채 따라온다. 오른끝에 닿으면 Δ 가 줄어드는 쪽으로 클램프.
        const nt1 = fromFrac(frac);
        return { t1: nt1, t2: Math.min(TOLERANCE_MAX_PCT, nt1 + drag.deltaPct) };
    };

    const beginDrag = (e: ReactPointerEvent, drag: TDrag): void => {
        if (e.button !== 0) return;
        dragRef.current = drag;
        setPreview(applyDrag(drag, fracAt(e.clientX)));
        trackRef.current?.setPointerCapture(e.pointerId);
    };
    // 빈 트랙 = T1 이동(주 값의 탭 의미론). 핸들 라벨은 stopPropagation 으로 제 드래그를 시작한다.
    const onTrackDown = (e: ReactPointerEvent): void => {
        if (e.target !== e.currentTarget) return;
        beginDrag(e, { kind: "t1", deltaPct: t2 - t1 });
    };
    const onMove = (e: ReactPointerEvent): void => {
        const drag = dragRef.current;
        if (!drag) return;
        setPreview(applyDrag(drag, fracAt(e.clientX)));
    };
    const onUp = (): void => {
        const drag = dragRef.current;
        const next = preview;
        dragRef.current = null;
        setPreview(null);
        if (!drag || !next) return;
        setDef({ toleranceT1Pct: next.t1, toleranceT2Pct: next.t2 });
    };

    const at = (f: number): string => `calc(${RAIL_PAD}px + ${clamp01(f)} * (100% - ${2 * RAIL_PAD}px))`;
    const widthOf = (a: number, b: number): string => `calc(${clamp01(b) - clamp01(a)} * (100% - ${2 * RAIL_PAD}px))`;
    const f1 = toFrac(shown.t1);
    const f2 = toFrac(shown.t2);

    // 펼친 분포 — Rail 과 같은 규약(컴포넌트 수명·로그 y). 칸 색이 세 구간을 가르고, 그 위에
    // **누적 곡선**(연장 사건 수 — 막대의 누적합, 선형 척도)을 겹친다. 둘 다 T 무관 고정 그림이라
    // T 를 문질러도 안 움직인다 — 세로 마커(T1/T2)만 그 위를 다닌다.
    const [distOpen, setDistOpen] = useState(false);
    const depthFracs = useMemo(() => breakDepths.map(toFrac), [breakDepths]);
    const hist = useMemo(() => (distOpen && depthFracs.length > 0 ? histogramOf(depthFracs, undefined) : null), [distOpen, depthFracs]);
    // 누적 사건 수(칸 경계 기준) — 곡선의 y. 막대(로그)와 척도가 다르다는 건 이름 열 라벨이 진다.
    const cumPath = useMemo(() => {
        if (!hist) return null;
        const total = hist.bins.reduce((s, b) => s + b.count, 0);
        if (total === 0) return null;
        let acc = 0;
        const pts = hist.bins.map((b, i) => {
            acc += b.count;
            return `${i + 0.5},${100 - (acc / total) * 100}`;
        });
        return { d: `M ${pts.join(" L ")}`, total };
    }, [hist]);

    return (
        <div style={{ borderBottom: "1px solid var(--border-subtle)" }}
            title="결과 걷기의 허용 폭 — 필터가 아니라 정의(아래 레일·시트·차트 표식의 값이 전부 따라 움직임). 기본 허용 T1: 여기까지의 눌림은 연속 상승으로 흡수(술어·표식의 기준). T1~T2: Δ 비교 관찰 구간. 빈 트랙을 끌면 T1 이동(Δ폭 유지), T2 라벨을 끌면 관찰 폭만 조절">
            <div style={{ display: "flex", alignItems: "center", height: RAIL_ROW_H }}>
                <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", minWidth: 0 }}>
                    <div title="허용 폭 T" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        허용 폭 T
                    </div>
                    {depthFracs.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setDistOpen((v) => !v); }}
                            title={distOpen ? "분포 접기" : "깊이별 연장 사건 분포 + 누적 곡선 펼치기(막대 = 로그 척도)"}
                            style={distOpen ? { ...miniLink, color: "var(--accent-primary)", textDecoration: "underline" } : miniLink}>
                            분포
                        </button>
                    )}
                </div>
                <div
                    ref={trackRef}
                    onPointerDown={onTrackDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    title="빈 곳을 끌면 T1 이동(Δ폭 유지) · T1/T2 라벨을 끌면 각각 조정"
                    style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", cursor: "crosshair", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
                >
                    <span style={endLabel(true)}>{TOLERANCE_MIN_PCT}%(고정)</span>
                    <span style={endLabel(false)}>{TOLERANCE_MAX_PCT}%</span>
                    {/* 기준선 + 두 구간: [2, T1] 채움 = 기본 허용 · [T1, T2] 빗금 = Δ 관찰. */}
                    <div aria-hidden style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, top: "50%", height: 2, transform: "translateY(-50%)", background: "var(--border-default)", pointerEvents: "none" }} />
                    <div aria-hidden style={{ position: "absolute", top: "50%", height: 5, transform: "translateY(-50%)", left: RAIL_PAD, width: widthOf(0, f1), background: LEG_HIGH, pointerEvents: "none", zIndex: 1 }} />
                    <div aria-hidden style={{ position: "absolute", top: "50%", height: 5, transform: "translateY(-50%)", left: at(f1), width: widthOf(f1, f2), background: `repeating-linear-gradient(45deg, ${LEG_HIGH} 0 3px, ${LEG_HIGH}40 3px 6px)`, opacity: 0.55, pointerEvents: "none", zIndex: 1 }} />

                    {/* T1 — 주 핸들(굵은 실선 바). 라벨 드래그 = T1 이동(Δ폭 유지). */}
                    <span aria-hidden style={{ position: "absolute", top: "50%", left: at(f1), transform: "translate(-50%,-50%)", width: 4, height: 16, borderRadius: 2, background: LEG_HIGH, pointerEvents: "none", zIndex: 3 }} />
                    <span
                        onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { kind: "t1", deltaPct: shown.t2 - shown.t1 }); }}
                        title="기본 허용 T1 — 끌면 T2 가 Δ폭을 유지한 채 따라옵니다"
                        style={{ position: "absolute", top: "calc(50% + 8px)", left: at(f1), transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 700, color: LEG_HIGH, cursor: "ew-resize", whiteSpace: "nowrap", touchAction: "none", zIndex: 5 }}
                    >T1 {shown.t1}%</span>

                    {/* T2 — 보조 핸들(속 빈 점선 바). 라벨 드래그 = Δ 관찰 폭만 조절(하한 = T1). */}
                    <span aria-hidden style={{ position: "absolute", top: "50%", left: at(f2), transform: "translate(-50%,-50%)", width: 2, height: 13, border: `1px dashed ${LEG_HIGH}`, background: "var(--bg-primary)", pointerEvents: "none", zIndex: 3 }} />
                    <span
                        onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { kind: "t2" }); }}
                        title="Δ 관찰 폭의 오른끝 T2 — 기본 허용은 그대로 두고 비교 구간만 조절합니다"
                        style={{ position: "absolute", top: "calc(50% - 21px)", left: at(f2), transform: "translateX(-50%)", fontSize: 9.5, color: LEG_HIGH, opacity: 0.85, cursor: "ew-resize", whiteSpace: "nowrap", touchAction: "none", zIndex: 5 }}
                    >T2 {shown.t2}%</span>
                </div>
            </div>

            {/* 펼친 분포 — 막대 = 깊이별 연장 **사건** 수(로그, 시그널당 다회), 곡선 = 그 누적(선형 —
                "T 를 x 로 두면 일어나는 연장 사건 수"). 칸 색 = 세 구간(≤T1 흡수됨 · T1~T2 이번 비교 · 밖).
                헤더의 "연장 N"은 **종목** 수(중복 제거)라 곡선 증분과 다를 수 있다 — 사건 ≥ 종목. */}
            {hist && (
                <div style={{ display: "flex", height: HIST_ROW_H, background: "var(--bg-secondary)" }}>
                    <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "4px 6px 7px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 9, lineHeight: 1.3, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden" }}>
                        <span title="누적 곡선(선형) — T 를 그 깊이로 두면 2% 기준 대비 일어나는 연장 사건 수. 한 시그널이 여러 깊이에서 연장되면 여러 번 센다"><b style={{ color: LEG_HIGH, fontWeight: 600 }}>─</b> 누적 연장 사건</span>
                        <span title="막대(로그) — 그 깊이의 눌림이 흡수되며 고점이 연장되는 사건 수">▮ 깊이별(로그) · 최다 {hist.max.toLocaleString()}</span>
                    </div>
                    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                        <div style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, bottom: 7, height: HIST_BAR_H, display: "flex", alignItems: "flex-end" }}>
                            {hist.bins.map((b, i) => {
                                const c = binCenter(i, HIST_BINS);
                                const zone = c <= f1 ? "base" : c <= f2 ? "delta" : "out";
                                const h = logHeight(b.count, hist.max) * HIST_BAR_H;
                                return (
                                    <div key={i} data-bin={i}
                                        title={`~${fromFrac(c)}% · 연장 사건 ${b.count.toLocaleString()}건${zone === "base" ? " (기본 허용에 흡수됨)" : zone === "delta" ? " (Δ 구간 — 이번 비교에서 연장)" : ""}`}
                                        style={{ flex: 1, position: "relative", height: "100%", overflow: "hidden" }}>
                                        {b.count > 0 && (
                                            <span aria-hidden style={{
                                                position: "absolute", left: 0, right: 0, bottom: 0, height: h,
                                                background: zone === "out" ? "var(--border-default)" : LEG_HIGH,
                                                opacity: zone === "delta" ? 0.45 : 1,
                                            }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* 누적 곡선 — 막대와 같은 x 상자 위 오버레이. 바탕색 밑줄로 어느 막대 위에서도 읽힌다. */}
                        {cumPath && (
                            <svg aria-hidden viewBox={`0 0 ${HIST_BINS} 100`} preserveAspectRatio="none"
                                style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, bottom: 7, height: HIST_BAR_H, width: `calc(100% - ${2 * RAIL_PAD}px)`, pointerEvents: "none" }}>
                                <path d={cumPath.d} fill="none" stroke="var(--bg-primary)" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
                                <path d={cumPath.d} fill="none" stroke={LEG_HIGH} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                            </svg>
                        )}
                        {cumPath && (
                            <span style={{ position: "absolute", right: RAIL_PAD + 2, top: 2, fontSize: 9, color: "var(--text-tertiary)", pointerEvents: "none" }}>
                                ↑ 전체 {cumPath.total.toLocaleString()} 사건
                            </span>
                        )}
                        <span aria-hidden style={{ position: "absolute", left: at(f1), transform: "translateX(-50%)", top: 0, bottom: 5, width: 1, background: LEG_HIGH, opacity: 0.7, pointerEvents: "none" }} />
                        <span aria-hidden style={{ position: "absolute", left: at(f2), transform: "translateX(-50%)", top: 0, bottom: 5, width: 1, background: LEG_HIGH, opacity: 0.35, pointerEvents: "none" }} />
                    </div>
                </div>
            )}
        </div>
    );
}

const miniLink: CSSProperties = {
    border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 9.5,
    color: "var(--text-tertiary)", cursor: "pointer", textDecoration: "underline dotted",
};

const endLabel = (left: boolean): CSSProperties => ({
    position: "absolute", top: "calc(50% - 19px)", [left ? "left" : "right"]: 2,
    fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap", pointerEvents: "none",
});
