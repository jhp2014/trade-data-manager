import { useMemo, useRef, useState, useEffect, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { scaleLinear } from "d3-scale";
import { skeletonsQuery } from "../api/queries.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { normalizeSkeleton, trimmedBounds, polylinePoints, pct, lineOpacity, dimOpacity, labelPointOf, clusterLabels, type NormalizedSkeleton, type OverlayBounds, type SkeletonAnchor } from "./skeleton/skeletonOverlay.js";
import { useOverlayZoom } from "./skeleton/useOverlayZoom.js";
import { pointKey, pointKeyOf } from "../lib/pointKey.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { ACTIVE, HOVER, PRICE_LINE, outcomeColor } from "../styles/palette.js";
import type { SkeletonWireEntry, SkeletonWireLevel } from "../api/skeletons.js";

// 골격 겹쳐 그리기 — 차트를 골격으로 축약해 **한 화면에서 서로 비교**하는 주 작업면.
//
// 왜 대표 골격을 역산해 그리지 않는가: 축 값 → 골격은 역함수가 없다(같은 기울기·기간을 내는 골격이 여럿).
// 남는 자유도를 규범값으로 채우면 그림은 나오지만 실제로 존재하는 상황인지 아무도 모른다. 그래서 실물을 겹친다.
//
// ## 척도는 공통이다 — 셀별/골격별로 다시 늘리지 않는다
// 크기가 곧 비교 기준인데 각자 화면에 꽉 채우면 20% 되돌림과 60% 되돌림이 같은 그림이 된다.
// 작은 골격이 납작해 보이는 건 손실이 아니라 **그게 정보**다. 공통 척도의 유일한 실질 문제(이상치 하나가
// 나머지를 바닥에 누름)는 **초기 범위를 분위수로 좁히고 확대·이동으로 닿게** 해서 푼다(자르지 않는다).
//
// ## 얹는 값의 갈래 — 좌표는 선으로, 스칼라는 색·라벨로
// 기준선·D선은 가격 좌표라 골격과 **같은 % 환산**(pct)을 타고 그림에 얹힌다. 등락률 같은 스칼라는 얹을
// 기하가 없어 색·라벨·정렬로 붙는다(계산 축이 이미 낸다). 이 갈래를 안 지키면 값 하나마다 전용 렌더가 붙는다.
// 얹는 선은 **강조된 골격에만** 그린다 — 500개에 다 그리면 화면이 죽는다.
const ANCHOR_KEY = "wb.skeletonOverlayAnchor";
const GRAIN_KEY = "wb.skeletonOverlayGrain";
const LEVELS_KEY = "wb.skeletonOverlayLevels";
const LABELS_KEY = "wb.skeletonOverlayLabels";

const PAD = { left: 46, right: 14, top: 12, bottom: 24 };
/**
 * 피벗 점 예산 — **원 개수**로 센다(골격 수가 아니라). 비용은 골격 수 × 피벗 수의 곱이고,
 * 골격당 피벗은 3~6개로 제각각이라 골격 수로 세면 같은 임계가 어떤 화면에선 두 배 무겁다.
 * 넘으면 강조된 골격에만 찍는다.
 */
const DOT_BUDGET = 1200;
/** 라벨 격자 한 칸(화면 px) — 글자 하나가 차지하는 자리. 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
const LABEL_CELL = { w: 74, h: 13 };
/** 뱃지 한 번 누를 때 확대 배율 — 뭉친 것이 두어 번에 풀리는 정도. */
const BADGE_ZOOM = 2.5;
/** 초기 범위에서 뺄 양끝 분위수. 자르는 게 아니라 초기 뷰만 좁히는 것 — 확대·이동으로 그대로 닿는다. */
const TRIM_Q = 0.01;

export function SkeletonOverlayPanel(): JSX.Element {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(ANCHOR_KEY, (o) => (o === "first" || o === "last" ? o : null), "last");
    const [grain, setGrain] = usePersistedState<"daily" | "minute">(GRAIN_KEY, (o) => (o === "daily" || o === "minute" ? o : null), "daily");
    const [showLevels, setShowLevels] = usePersistedState<boolean>(LEVELS_KEY, (o) => (typeof o === "boolean" ? o : null), true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(LABELS_KEY, (o) => (typeof o === "boolean" ? o : null), true);

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const activePoint = useWorkbench((s) => s.activePoint);
    const activeKey = activePoint ? pointKeyOf(activePoint.code, activePoint.date, activePoint.time) : null;
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);

    const feedQ = useQuery(skeletonsQuery());
    const r = useRankFilterResult();

    // 선택된 타점 → 골격. 일봉 골격은 **차트 소유**라 같은 차트의 두 타점이 같은 폴리라인을 공유한다 —
    // 그래도 타점마다 한 줄씩 그린다(결과 색이 타점의 것이라, 합치면 두 결과 중 하나를 버리게 된다).
    const shapes = useMemo<NormalizedSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed) return [];
        const byKey = new Map<string, SkeletonWireEntry>();
        for (const e of grain === "daily" ? feed.daily : feed.minute) {
            byKey.set(grain === "daily" ? `${e.stockCode}|${e.date}` : `${e.stockCode}|${e.date}|${e.time ?? ""}`, e);
        }
        const out: NormalizedSkeleton[] = [];
        for (const p of r.points) {
            const pk = pointKey(p);
            const entry = byKey.get(grain === "daily" ? `${p.stockCode}|${p.date}` : pk);
            if (!entry) continue;
            const n = normalizeSkeleton(entry.pivots, anchor, { ...p, key: pk });
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, r.points, grain, anchor]);

    // 선은 언제나 차트 소유 — 일봉·분봉 골격이 같은 목록을 본다.
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(`${l.stockCode}|${l.date}`, l.levels);
        return m;
    }, [feedQ.data]);

    const missing = r.points.length - shapes.length;

    // ── 척도: 자동(현재 선택에서 매번) vs 고정(그 순간의 범위를 붙든다).
    //    고정이 필요한 이유는 필터를 좁힐 때마다 척도가 따라 움직이면 **좁히기 전후를 비교할 수가 없기** 때문.
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(() => trimmedBounds(shapes, TRIM_Q), [shapes]);
    const bounds = locked ?? autoBounds;

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
    const drawable = bounds !== null && box.width > 0 && box.height > 0;
    const { transform, reset, scaleAt, zoomed } = useOverlayZoom(svgRef, drawable);

    // 척도가 바뀌면(필터 변경 등) 뷰포트를 원위치 — 안 그러면 옛 변환이 남아 빈 공간을 보게 된다.
    // 고정 중에는 척도가 안 바뀌므로 이 효과가 돌 일이 없다(= 확대한 채로 필터를 좁혀도 시야가 유지된다).
    const boundsKey = bounds ? `${bounds.minX}|${bounds.maxX}|${bounds.minY}|${bounds.maxY}` : "";
    useEffect(() => { reset(); }, [boundsKey, reset]);

    // 변환은 그림이 아니라 **스케일**에 건다 — 선 굵기가 안 늘어나고 눈금이 확대에 맞춰 다시 찍힌다.
    const scales = useMemo(() => {
        if (!bounds) return null;
        const x = scaleLinear().domain([bounds.minX, bounds.maxX]).range([box.left, box.left + box.width]);
        const y = scaleLinear().domain([bounds.minY, bounds.maxY]).range([box.top + box.height, box.top]);
        return { x: transform.rescaleX(x), y: transform.rescaleY(y) };
    }, [bounds, box.left, box.top, box.width, box.height, transform]);

    const unit = grain === "daily" ? "거래일" : "분";
    const highlightKey = hoveredPoint ?? activeKey;
    const dimming = highlightKey !== null && shapes.some((s) => s.key === highlightKey);
    const clipId = "skeleton-overlay-clip";
    // 예산 판정은 화면당 한 번 — 골격마다 다시 세면 렌더가 O(n²)이 된다.
    const dotsForAll = useMemo(() => shapes.reduce((n, s) => n + s.points.length, 0) <= DOT_BUDGET, [shapes]);
    // 잉크는 개수를 따라간다 — 고정값이면 소수일 땐 흐리고 수백 개면 화면이 까맣게 찬다.
    const baseOpacity = lineOpacity(shapes.length);
    const dimmed = dimOpacity(shapes.length);
    const labelAtStart = anchor === "last"; // 라벨이 붙는 쪽(앵커 반대) — 텍스트 정렬 방향이 여기서 갈린다.
    const byKey = useMemo(() => new Map(shapes.map((s) => [s.key, s])), [shapes]);

    // 라벨 축약 — 화면 좌표로 묶는다. 확대하면 좌표가 벌어져 칸이 쪼개지고 뱃지가 저절로 라벨로 풀린다.
    // 강조된 골격은 묶음에서 빼고 따로 그린다(뭉친 칸에 갇혀 안 보이는 일이 없게).
    const clusters = useMemo(() => {
        if (!showLabels || !scales) return [];
        const anchors = shapes
            .filter((s) => s.key !== highlightKey)
            .map((s) => { const p = labelPointOf(s, anchor); return { key: s.key, x: scales.x(p.x), y: scales.y(p.y) }; });
        return clusterLabels(anchors, LABEL_CELL.w, LABEL_CELL.h);
    }, [showLabels, scales, shapes, anchor, highlightKey]);

    return (
        <div style={wrap}>
            <div style={header}>
                <ControlBox label="기준">
                    <TextToggle active={anchor === "last"} onClick={() => setAnchor("last")} title="마지막 피벗을 원점으로 — 당일 직전이 한 점으로 정렬(뒤로 퍼짐)">마지막 점</TextToggle>
                    <Dot />
                    <TextToggle active={anchor === "first"} onClick={() => setAnchor("first")} title="첫 피벗을 원점으로 — 시작점에서 앞으로 퍼짐(본상승 크기 비교)">첫 점</TextToggle>
                </ControlBox>
                <ControlBox label="골격">
                    <TextToggle active={grain === "daily"} onClick={() => setGrain("daily")} title="일봉 골격(차트 소유)">일봉</TextToggle>
                    <Dot />
                    <TextToggle active={grain === "minute"} onClick={() => setGrain("minute")} title="분봉 골격(타점 소유·당일)">분봉</TextToggle>
                </ControlBox>
                <ControlBox>
                    <TextToggle active={showLevels} onClick={() => setShowLevels(!showLevels)} title="강조된 골격의 기준선·D선을 같은 % 공간에 얹는다" activeColor={PRICE_LINE}>선</TextToggle>
                    <TextToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} title="앵커 반대쪽 끝에 종목·날짜 — 뭉치면 개수 뱃지, 확대하면 풀린다">라벨</TextToggle>
                    <TextToggle active={locked !== null} onClick={() => setLocked(locked ? null : autoBounds)} title="지금 척도를 붙든다 — 필터를 좁혀도 척도가 안 움직여 좁히기 전후가 비교된다">척도 고정</TextToggle>
                </ControlBox>
                {/* 결손을 숨기지 않는다 — 몇 개가 그려졌는지만 보이면 "필터가 잡은 것"을 착각하게 된다. */}
                <span style={count}>
                    {shapes.length}개
                    {missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 골격 없음 {missing}</span>}
                </span>
                {zoomed && <button onClick={reset} title="원위치(더블클릭도 같음)" style={miniBtn}>원위치 ⤺</button>}
            </div>

            <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {feedQ.isLoading && <div style={muted}>불러오는 중…</div>}
                {!feedQ.isLoading && shapes.length === 0 && (
                    <div style={muted}>{r.points.length === 0 ? "선택된 타점이 없습니다." : `이 선택에 ${grain === "daily" ? "일봉" : "분봉"} 골격이 없습니다.`}</div>
                )}
                <svg ref={svgRef} width={size.w} height={size.h} onDoubleClick={reset}
                    style={{ display: "block", cursor: drawable ? "grab" : "default", touchAction: "none" }}>
                    <defs>
                        <clipPath id={clipId}><rect x={box.left} y={box.top} width={box.width} height={box.height} /></clipPath>
                    </defs>
                    {scales && bounds && (
                        <>
                            {/* 눈금 — 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(전체 축이 정보라 라벨이 따라와야 한다). */}
                            {scales.y.ticks(5).map((v) => (
                                <g key={`y${v}`}>
                                    <line x1={box.left} x2={box.left + box.width} y1={scales.y(v)} y2={scales.y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
                                    <text x={box.left - 5} y={scales.y(v) + 3} textAnchor="end" style={axisText}>{v.toFixed(0)}%</text>
                                </g>
                            ))}
                            {scales.x.ticks(6).map((v) => (
                                <text key={`x${v}`} x={scales.x(v)} y={size.h - 8} textAnchor="middle" style={axisText}>{v.toFixed(0)}</text>
                            ))}
                            <text x={box.left + box.width} y={size.h - 8} textAnchor="end" style={axisText}>{unit}</text>

                            <g clipPath={`url(#${clipId})`}>
                                {/* 기준선(0%)과 앵커 세로선(t=0) — 되돌림을 읽는 원점. */}
                                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
                                <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />

                                {shapes.map((s) => {
                                    const focus = s.key === activeKey;
                                    const hover = s.key === hoveredPoint;
                                    const lit = focus || hover;
                                    const stroke = focus ? ACTIVE : hover ? HOVER : outcomeColor(r.metaOf(s.key).outcome);
                                    const opacity = lit ? 1 : dimming ? dimmed : baseOpacity;
                                    return (
                                        <g key={s.key} opacity={opacity}
                                            onMouseEnter={() => setHoveredPoint(s.key)}
                                            onMouseLeave={() => setHoveredPoint(null)}
                                            onClick={() => goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "skeleton-overlay")}
                                            style={{ cursor: "pointer" }}>
                                            <title>{`${r.nameOf(s.stockCode)} ${s.date} ${s.time}`}</title>
                                            {/* 굵은 투명 선 = 히트 영역. 1px 선은 마우스로 잡기가 사실상 불가능하다. */}
                                            <polyline points={polylinePoints(s, scales.x, scales.y)} fill="none" stroke="transparent" strokeWidth={8} />
                                            <polyline points={polylinePoints(s, scales.x, scales.y)} fill="none" stroke={stroke} strokeWidth={lit ? 2 : 1.25} strokeLinejoin="round" />
                                            {(lit || dotsForAll) && s.points.map((p, i) => (
                                                <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={lit ? 3 : 2} fill={stroke} />
                                            ))}
                                            {/* 얹는 선 — 가격 좌표를 골격과 **같은 환산**으로 끌어온다. 강조된 것에만. */}
                                            {lit && showLevels && (levelsByChart.get(`${s.stockCode}|${s.date}`) ?? []).map((lv, i) => {
                                                const y = scales.y(pct(lv.price, s.basePrice));
                                                return <line key={`lv${i}`} x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                                    stroke={PRICE_LINE} strokeWidth={lv.baseline ? 1.5 : 1} strokeDasharray={lv.baseline ? undefined : "4 3"} opacity={0.9} />;
                                            })}
                                        </g>
                                    );
                                })}

                                {/* 라벨 층 — 선 위에. 한 칸에 하나면 라벨, 여럿이면 개수 뱃지(누르면 그 자리로 확대해 풀린다).
                                    숨기는 게 아니라 압축이라 확대하면 반드시 닿는다. 배경색 테두리로 후광을 줘 선 위에서도 읽힌다. */}
                                {clusters.map((c) => {
                                    if (c.members.length > 1) {
                                        return (
                                            <g key={`c${c.x}|${c.y}`} onClick={() => scaleAt(c.x, c.y, BADGE_ZOOM)} style={{ cursor: "zoom-in" }}>
                                                <title>{`${c.members.length}개 뭉침 — 눌러서 확대`}</title>
                                                <rect x={labelAtStart ? c.x + 5 : c.x - 25} y={c.y - 6} width={20} height={12} rx={6}
                                                    fill="var(--bg-secondary)" stroke="var(--border-strong)" strokeWidth={0.5} />
                                                <text x={labelAtStart ? c.x + 15 : c.x - 15} y={c.y + 3} textAnchor="middle"
                                                    style={{ fontSize: 9, fill: "var(--text-secondary)", pointerEvents: "none" }}>
                                                    {c.members.length}
                                                </text>
                                            </g>
                                        );
                                    }
                                    const s = byKey.get(c.members[0]);
                                    if (!s) return null;
                                    return (
                                        <text key={`c${c.x}|${c.y}`} x={c.x + (labelAtStart ? 7 : -7)} y={c.y + 3}
                                            textAnchor={labelAtStart ? "start" : "end"}
                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                            onMouseEnter={() => setHoveredPoint(s.key)}
                                            onMouseLeave={() => setHoveredPoint(null)}
                                            onClick={() => goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "skeleton-overlay")}
                                            style={{ fontSize: 10, fill: "var(--text-secondary)", cursor: "pointer" }}>
                                            {r.nameOf(s.stockCode)} {s.date.slice(5)}
                                        </text>
                                    );
                                })}
                                {/* 강조된 골격의 라벨은 묶음 밖 — 뭉친 칸에 갇혀 안 보이는 일이 없게 언제나 그린다. */}
                                {showLabels && highlightKey !== null && (() => {
                                    const s = byKey.get(highlightKey);
                                    if (!s) return null;
                                    const p = labelPointOf(s, anchor);
                                    const color = s.key === activeKey ? ACTIVE : HOVER;
                                    return (
                                        <text x={scales.x(p.x) + (labelAtStart ? 7 : -7)} y={scales.y(p.y) + 3}
                                            textAnchor={labelAtStart ? "start" : "end"}
                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                            style={{ fontSize: 10, fontWeight: 700, fill: color, pointerEvents: "none" }}>
                                            {r.nameOf(s.stockCode)} {s.date.slice(5)}
                                        </text>
                                    );
                                })()}
                            </g>
                        </>
                    )}
                </svg>
            </div>

            <div style={footer}>
                기준 {anchor === "first" ? "첫 점" : "마지막 점"} · 세로 = 기준 대비 % · 가로 = {unit} · 휠 확대 · 드래그 이동 · 더블클릭 원위치 · 뱃지 클릭 = 그 자리 확대
                {locked && <span style={{ color: "var(--text-secondary)" }}> · 척도 고정됨</span>}
            </div>
        </div>
    );
}

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const header: CSSProperties = { flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" };
const footer: CSSProperties = { flexShrink: 0, padding: "3px 10px", borderTop: "1px solid var(--border-default)", fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const count: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const muted: CSSProperties = { position: "absolute", inset: 0, color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px", pointerEvents: "none" };
const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer", whiteSpace: "nowrap" };
