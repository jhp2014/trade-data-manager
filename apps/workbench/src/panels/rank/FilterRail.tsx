// 값 구간 필터 레일 — 축 레인과 같은 시각언어를 쓰되 대상이 "값의 구간"이다.
// 축 밴드(레인 우클릭)와 달리 여기선 구간을 직접 그린다: 빈 트랙 드래그=새 구간 · 경계 라벨 드래그=조정 ·
// 라벨 × = 그 구간 삭제. 구간끼리는 OR, 다른 차원(날짜/시간/축)과는 AND.
// 도메인(날짜 범위·08:00~20:00·계산 축 수치)은 호출자가 toFrac/fromFrac 로 주입 — 이 컴포넌트는 0..1 만 안다.
//
// 경계값 타입 V 는 문자열일 필요가 없다(계산 축은 타점 앵커 객체를 쓴다). 그래서 대소 판정도 값이 아니라
// **프랙션**으로 한다 — 어차피 화면 위 위치가 곧 사용자가 의도한 순서다.
// ticks = 실제 데이터 지점(0..1). 계산 축 레일이 "이 자리"를 눈으로 보고 자를 수 있게 하는 표식.
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { LINE_PAD } from "./rankGeometry.js";
import { ACTIVE, CurrentMarker, FILTER, LABEL_W, ScaleEnd, SortBadge } from "./rankRailChrome.js";

// ── 날짜·시간 필터 레일 — 축 레인과 동일 시각언어(얇은 2px 선·−/+ 끝·틱·대괄호). 빨강=포함, 필터 없음=전체 빨강.
//    구조: 상단=도메인 끝값(min/max) · 하단=필터 경계값(빨강)+현재종목 마커값(파랑). 끝값이 위, 선택값이 아래라 구분이 쉽다.
//    빈 트랙 드래그=새 구간 · 경계 값 라벨 드래그=조정 · 라벨 × = 그 구간 삭제(구간 추가·삭제는 칩 편집에서도).
const NEAR = 0.03; // 필터 경계가 끝/마커와 겹치면 필터 우선.
export function FilterRail<V, T extends { from: V; to: V }>({ label, ranges, toFrac, fromFrac, fmt, minLabel, maxLabel, marker, ticks, sortDir, onChange }: {
    label: string; ranges: T[]; toFrac: (v: V) => number; fromFrac: (f: number) => V; fmt: (v: V) => string; minLabel: string; maxLabel: string; marker: V | null; ticks?: number[]; sortDir: 1 | -1 | null; onChange: (ranges: T[]) => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ kind: "new"; start: number } | { kind: "edit"; i: number; edge: "from" | "to" } | null>(null);
    const [preview, setPreview] = useState<T[] | null>(null);
    const shown = preview ?? ranges;
    const fracX = (clientX: number): number => { const el = ref.current; if (!el) return 0; const rect = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - rect.left - LINE_PAD) / (rect.width - 2 * LINE_PAD))); };
    const norm = (r: T): T => (toFrac(r.from) <= toFrac(r.to) ? r : ({ ...r, from: r.to, to: r.from }));
    const onDown = (e: ReactPointerEvent): void => {
        if (e.button !== 0 || e.target !== e.currentTarget) return; // 자식(라벨) 위는 편집, 빈 트랙만 새 구간
        dragRef.current = { kind: "new", start: fracX(e.clientX) };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onLabelDown = (e: ReactPointerEvent, i: number, edge: "from" | "to"): void => {
        e.stopPropagation(); if (e.button !== 0) return;
        dragRef.current = { kind: "edit", i, edge };
        ref.current?.setPointerCapture(e.pointerId);
    };
    const onMove = (e: ReactPointerEvent): void => {
        const d = dragRef.current; if (!d) return;
        const f = fracX(e.clientX);
        if (d.kind === "new") setPreview([...ranges, { from: fromFrac(Math.min(d.start, f)), to: fromFrac(Math.max(d.start, f)) } as T]);
        else setPreview(ranges.map((r, idx) => (idx === d.i ? { ...r, [d.edge]: fromFrac(f) } : r)));
    };
    const onUp = (): void => {
        const d = dragRef.current, p = preview; dragRef.current = null; setPreview(null);
        if (!d || !p) return;
        if (d.kind === "new" && Math.abs(toFrac(p[p.length - 1].from) - toFrac(p[p.length - 1].to)) < 0.01) return; // 클릭 = 무시
        onChange(p.map(norm));
    };
    const at = (f: number): string => `calc(${LINE_PAD}px + ${f} * (100% - ${2 * LINE_PAD}px))`;
    const atPx = (f: number, off: number): string => `calc(${LINE_PAD}px + ${f} * (100% - ${2 * LINE_PAD}px) + ${off}px)`;
    const edges = shown.flatMap((r) => [toFrac(r.from), toFrac(r.to)]);
    const nearLeft = edges.some((f) => f < NEAR);         // 끝(−/+) 겹침 → 필터 우선(끝 숨김)
    const nearRight = edges.some((f) => f > 1 - NEAR);
    const mFrac = marker != null ? toFrac(marker) : null; // 현재 종목 위치
    const mNearLeft = mFrac != null && mFrac < 0.1;   // 마커 라벨이 상단 끝값과 겹침 → 마커 우선(끝값 숨김)
    const mNearRight = mFrac != null && mFrac > 0.9;
    const full = shown.length === 0;
    return (
        <div style={{ display: "flex", alignItems: "center", height: 50, borderBottom: "1px solid var(--border-subtle)", background: sortDir != null ? "var(--bg-secondary)" : "transparent" }}>
            <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 8px 0 6px", display: "flex", alignItems: "center", gap: 4 }}>
                {/* 비활성 그랩(정렬 불가, 축 레인과 시각 통일용) */}
                <span aria-hidden style={{ fontSize: 12, lineHeight: 1, flexShrink: 0, color: "var(--text-tertiary)", opacity: 0.3 }}>⠿</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{label}</span>
                {sortDir != null && <SortBadge dir={sortDir} />}
            </div>
            <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ position: "relative", flex: 1, height: "100%", cursor: "default", userSelect: "none", WebkitUserSelect: "none" }}>
                {/* 기준선 — 얇은 2px(축 레인과 동일). 필터 없음 = 전체 빨강(모두 포함). */}
                <div style={{ position: "absolute", left: LINE_PAD, right: LINE_PAD, top: "50%", height: 2, transform: "translateY(-50%)", background: full ? FILTER : "var(--border-default)", boxShadow: full ? "0 0 7px 1px rgba(226,75,74,0.5)" : "none", pointerEvents: "none" }} />
                {/* 상단 = 도메인 끝값(마커 라벨과 겹치면 마커 우선으로 숨김) */}
                {!mNearLeft && <span style={topEnd(true)}>{minLabel}</span>}
                {!mNearRight && <span style={topEnd(false)}>{maxLabel}</span>}
                {/* 하단 = −/+ 끝(경계가 끝에 붙으면 필터 우선으로 숨김) */}
                {!nearLeft && <ScaleEnd side="left" />}
                {!nearRight && <ScaleEnd side="right" />}
                {/* 데이터 지점 표식 — 계산 축 레일에서 "이 자리"를 보고 자르기 위한 것(날짜/시간은 안 준다). */}
                {ticks?.map((f, i) => (
                    <span key={i} style={{ position: "absolute", left: at(f), top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 9, background: "var(--text-tertiary)", opacity: 0.4, pointerEvents: "none" }} />
                ))}

                {shown.map((r, i) => {
                    const a = toFrac(r.from), b = toFrac(r.to);
                    const lo = Math.min(a, b), hi = Math.max(a, b);
                    return (
                        <div key={i}>
                            {/* 채색 선 */}
                            <div style={{ position: "absolute", top: "50%", height: 2, transform: "translateY(-50%)", left: at(lo), width: `calc(${hi - lo} * (100% - ${2 * LINE_PAD}px))`, background: FILTER, boxShadow: "0 0 7px 1px rgba(226,75,74,0.7)", pointerEvents: "none", zIndex: 1 }} />
                            {/* 경계 = 붉은 수직 틱 + 값 라벨(틱 아래 중앙 · 드래그로 조정) */}
                            {(["from", "to"] as const).map((edge) => {
                                const f = edge === "from" ? a : b;
                                return (
                                    <div key={edge}>
                                        <span style={{ position: "absolute", top: "50%", left: at(f), transform: "translate(-50%,-50%)", width: 3, height: 14, borderRadius: 1.5, background: FILTER, pointerEvents: "none", zIndex: 3 }} />
                                        <span onPointerDown={(e) => onLabelDown(e, i, edge)} title="드래그해 값 조정"
                                            style={{ position: "absolute", top: "calc(50% + 8px)", left: at(f), transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 700, color: FILTER, cursor: "ew-resize", whiteSpace: "nowrap", touchAction: "none", userSelect: "none", zIndex: 5 }}>{fmt(r[edge])}</span>
                                    </div>
                                );
                            })}
                            {/* 삭제 × = 구간 상단 중앙 */}
                            <button onClick={() => onChange(ranges.filter((_, idx) => idx !== i))} title="이 구간 삭제"
                                style={{ position: "absolute", top: "calc(50% - 19px)", left: at((a + b) / 2), transform: "translateX(-50%)", border: "none", background: "transparent", color: FILTER, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0, zIndex: 5 }}>×</button>
                        </div>
                    );
                })}

                {/* 현재 종목 마커(축의 현재 아이콘과 동일) — 핀은 프랙 위치, 값 라벨은 상단 행(도메인 끝값과 같은 레벨)에 핀 옆으로(중앙 넘으면 왼쪽, 아니면 오른쪽) → 하단 필터값과 줄이 갈려 안 겹침. */}
                {mFrac != null && (
                    <>
                        <div style={{ position: "absolute", left: at(mFrac), top: "50%", width: 0, height: 0, zIndex: 6, pointerEvents: "none" }}>
                            <CurrentMarker color={ACTIVE} />
                        </div>
                        {marker != null && (
                            <span style={{ position: "absolute", top: "calc(50% - 20px)", left: mFrac > 0.5 ? atPx(mFrac, -8) : atPx(mFrac, 8), transform: mFrac > 0.5 ? "translateX(-100%)" : "none", fontSize: 9.5, fontWeight: 700, color: ACTIVE, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 4 }}>{fmt(marker)}</span>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
function topEnd(left: boolean): CSSProperties {
    return { position: "absolute", top: "calc(50% - 20px)", [left ? "left" : "right"]: LINE_PAD - 8, fontSize: 9.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" };
}

