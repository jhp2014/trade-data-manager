// 레일 한 줄 — **조건을 그어서 거는 자리**. 값이 무엇인지는 모르고 0..1 좌표만 안다.
//
// 왜 그리기인가: 숫자를 입력하려면 그 축의 분포를 이미 알아야 한다("5% 위"가 상위 3건인지 300건인지).
// 실제 자리(틱)를 깔아 두고 그 위를 자르면 **유니버스를 보면서** 조건을 정하게 된다 — 옛 값 입력칸이
// 못 하던 일이고, 이게 레일이 있는 이유 전부다.
//
// 손짓 셋(빈 트랙 드래그 = 새 구간 · 경계 라벨 드래그 = 그 경계 이동 · 라벨 ✕ = 구간 삭제)의 대수는
// railModel(순수·테스트됨)에 있다. 여기는 DOM 측정과 그리기만 한다.
//
// ⚠ 커밋은 **손을 뗄 때 한 번**이다. 드래그 중에 store 를 갱신하면 유니버스×필터 정산이 프레임마다
// 돌아 손이 끌리는데, 정작 보고 싶은 숫자(막대)는 뗀 뒤에 봐도 늦지 않다.
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { clamp01 } from "../../../lib/num.js";
import { ACTIVE, FILTER } from "../../../styles/palette.js";
import { applyDrag, fracOfX, isTapRange, orderRanges, removeAt, type RailDrag, type RailRange } from "./railModel.js";

/** 트랙 좌우 여백(px) — 경계가 끝에 서도 라벨이 잘리지 않을 만큼. */
export const RAIL_PAD = 22;
/** 표식 층(틱·멤버) 하나가 그릴 수 있는 span 상한 — 비용은 점 수가 아니라 DOM 노드 수가 정한다. */
export const MAX_TICK_SPANS = 120;

/** 표식 하나 — 자리와 진하기. 접힌 버킷은 겹친 수만큼 진하다(span 을 겹쳐 그린 것과 같은 알파). */
interface TickSpan {
    frac: number;
    alpha: number;
}

/**
 * 표식 층 접기(순수) — 상한을 넘으면 균등 버킷당 span 하나로 줄인다(자리는 버킷 평균). 진하기는
 * 겹침 수의 알파 누적(1-(1-a)^n)이라 몰린 버킷일수록 진하다 — 펼쳐 그렸을 때와 같은 읽기다.
 * 스냅은 어댑터의 fromFrac 이 원본 값으로 하므로, 여기 접기는 드래그 정밀도를 건드리지 않는다.
 */
export function capTickSpans(fracs: readonly number[], alpha: number, max = MAX_TICK_SPANS): TickSpan[] {
    if (fracs.length <= max) return fracs.map((frac) => ({ frac, alpha }));
    const sum = new Float64Array(max);
    const count = new Uint32Array(max);
    for (const f of fracs) {
        const b = Math.min(max - 1, Math.max(0, Math.floor(clamp01(f) * max)));
        sum[b]! += f;
        count[b]! += 1;
    }
    const out: TickSpan[] = [];
    for (let b = 0; b < max; b++) {
        const n = count[b]!;
        if (n > 0) out.push({ frac: sum[b]! / n, alpha: 1 - Math.pow(1 - alpha, n) });
    }
    return out;
}
/** 좌측 이름 열 폭 — 레일끼리 세로로 줄이 맞아야 목록으로 읽힌다. */
export const RAIL_LABEL_W = 96;
/** 행 높이 — 레일이 아닌 줄(보드의 그룹 행)도 이 높이를 쓴다. */
export const RAIL_ROW_H = 46;

export interface RailProps<V> {
    /** 이 레일이 무엇인가(축 이름·"날짜"·"시간"). */
    label: string;
    ranges: readonly RailRange<V>[];
    /** 구간이 하나뿐인 레일(판단 축 밴드) — 새로 그으면 갈아탄다. */
    single?: boolean;
    /**
     * 상한 컷 레일 — from 이 강한 끝(프랙션 0)에 못 박힌 단일 구간(railModel cut). from 경계의
     * 손잡이·라벨을 그리지 않는다(끌 수 없는 걸 그리면 거짓 손잡이다). 트랙 탭 = 그 자리로 컷 이동
     * (from 0 고정이라 탭도 폭 있는 구간 — isTapRange 에 안 걸리는 게 의도).
     */
    cut?: boolean;
    /** 구간 삭제(✕) 허용 여부 — 컷 레일처럼 "조건이 항상 존재"하는 레일은 끈다. 기본 true. */
    removable?: boolean;
    toFrac: (v: V) => number;
    /** 프랙션 → 경계값. 스냅(가장 가까운 실제 자리)은 여기서 한다. */
    fromFrac: (frac: number) => V;
    /** 경계 라벨. 앵커가 사라졌으면 "?" 처럼 호출자가 정한 표시를 준다. */
    fmt: (v: V) => string;
    /** 트랙 양 끝(약/강)의 도메인 라벨. */
    minLabel: string;
    maxLabel: string;
    /** 실제 데이터가 있는 자리들(0..1) — 자를 곳을 눈으로 보게 한다. */
    ticks?: readonly number[];
    /**
     * 선택 집합 멤버의 자리들(0..1) — **같은 점, 두 상태**. 새 기하가 아니라 ticks 의 부분집합에 색을
     * 입히는 층이다: 강조색 + 반투명이라 같은 자리에 겹칠수록 저절로 진해진다(알파 누적 = 밀도).
     * 이게 있으면 나머지 회색은 더 죽는다(전경/배경 분리) — 스냅 과녁 역할은 그대로다.
     */
    memberTicks?: readonly number[];
    /** 현재 타점의 자리(있으면). */
    marker?: { frac: number; label: string } | null;
    /** 되짚기 강조 — 위 목록에서 이 조건을 눌러 찾아왔을 때. */
    highlight?: boolean;
    /**
     * 서랍 손잡이(계산 축만) — 이 축을 층위 칸 서랍에 넣거나 꺼낸다. **보기 상태일 뿐 조건은 안 건드린다**.
     * 이름 열 안에 두는 이유: 그 열이 이미 "이 축 자체"를 다루는 자리(순서 잡이·값 입력)라서다.
     * ⚠ 이름 열은 `draggable` 잡이라 손잡이가 그걸 훔치면 안 된다 — draggable=false + 이벤트 격리.
     */
    stow?: { hidden: boolean; onToggle: () => void };
    /** 그릴 수 없는 레일(값 없음·배치 없음) — 트랙 대신 이유를 적는다. */
    disabledNote?: string;
    /**
     * 정밀 입력 입구 — 이름 아래 작게. 드래그로 못 맞추는 자리(09:03)를 위한 보조라 **이름 열에** 둔다.
     * 오른쪽에 두면 컨트롤이 늘어날 때마다 트랙이 짧아지는데, 이 화면에서 폭이 곧 해상도다.
     * 자리를 클릭하는 게 이미 정밀 입력인 레일(판단 축)은 안 준다.
     */
    onType?: (x: number, y: number) => void;
    /**
     * 이 레일을 끌어 순서를 바꾸는 잡이 — **이름 열에만** 붙는다. 트랙엔 못 붙인다: 거기 pointerdown 은
     * 조건 긋기이고, HTML5 draggable 이 그 위에 얹히면 손짓을 통째로 삼킨다.
     * 안 주면 그 레일은 자리가 고정이다(날짜·시간처럼 층위 안에서 자리가 정해진 레일).
     */
    dragHandle?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
    /** 손을 뗄 때 한 번. 정렬(from ≤ to)까지 마친 구간 리스트가 온다. */
    onChange: (ranges: RailRange<V>[]) => void;
}

export function Rail<V>({
    label, ranges, single = false, cut = false, removable = true, toFrac, fromFrac, fmt, minLabel, maxLabel,
    ticks, memberTicks, marker, highlight = false, disabledNote, dragHandle, stow, onType, onChange,
}: RailProps<V>): JSX.Element {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<RailDrag | null>(null);
    // 미리보기는 커밋과 **같은 함수**로 만든다(railModel.applyDrag) — 갈라지면 뗀 순간 구간이 튄다.
    const [preview, setPreview] = useState<RailRange<V>[] | null>(null);
    const shown = preview ?? ranges;

    const fracAt = (clientX: number): number => {
        const el = trackRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        return fracOfX(clientX - rect.left, rect.width, RAIL_PAD);
    };

    const beginDrag = (e: ReactPointerEvent, drag: RailDrag): void => {
        if (e.button !== 0 || disabledNote) return;
        dragRef.current = drag;
        setPreview(applyDrag(ranges, drag, fracAt(e.clientX), fromFrac, { single, cut }));
        trackRef.current?.setPointerCapture(e.pointerId);
    };

    const onTrackDown = (e: ReactPointerEvent): void => {
        if (e.target !== e.currentTarget) return; // 자식(경계 라벨) 위는 경계 편집
        beginDrag(e, { kind: "new", anchorFrac: fracAt(e.clientX) });
    };

    const onMove = (e: ReactPointerEvent): void => {
        const drag = dragRef.current;
        if (!drag) return;
        setPreview(applyDrag(ranges, drag, fracAt(e.clientX), fromFrac, { single, cut }));
    };

    const onUp = (): void => {
        const drag = dragRef.current;
        const next = preview;
        dragRef.current = null;
        setPreview(null);
        if (!drag || !next) return;
        // 새 구간인데 폭이 없으면 그건 클릭이다 — 아무것도 통과 못 하는 조건을 남기지 않는다.
        if (drag.kind === "new") {
            const fresh = next[next.length - 1];
            if (!fresh || isTapRange(fresh, toFrac)) return;
        }
        onChange(orderRanges(next, toFrac));
    };

    const at = (f: number): string => `calc(${RAIL_PAD}px + ${clamp01(f)} * (100% - ${2 * RAIL_PAD}px))`;
    const empty = shown.length === 0;

    // 표식 층은 상한까지 접어 그린다 — 계산 축은 유니버스 타점 수만큼 틱이 서는데, 그 수가 곧 DOM 노드 수다.
    const hasMembers = memberTicks !== undefined && memberTicks.length > 0;
    const tickSpans = useMemo(
        () => (ticks ? capTickSpans(ticks, hasMembers ? 0.12 : 0.35) : undefined),
        [ticks, hasMembers],
    );
    const memberSpans = useMemo(() => (memberTicks ? capTickSpans(memberTicks, 0.3) : undefined), [memberTicks]);

    return (
        <div className="rail-row" style={{
            display: "flex", alignItems: "center", height: RAIL_ROW_H, borderBottom: "1px solid var(--border-subtle)",
            background: highlight ? "var(--accent-soft)" : "transparent", transition: "background .35s ease",
        }}>
            {/* 이름 열 = 순서 잡이(잡이가 있을 때). 이름 자체를 끄는 건 시트 열 헤더와 같은 손짓이라
                두 화면의 어휘가 갈리지 않는다. 아래 "입력" 버튼의 클릭은 그대로 산다. */}
            <div
                {...(dragHandle ? { draggable: true, onDragStart: dragHandle.onDragStart, onDragEnd: dragHandle.onDragEnd } : {})}
                style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", minWidth: 0, ...(dragHandle ? { cursor: "grab" } : {}) }}
            >
                <div title={dragHandle ? `${label} — 끌어서 순서 바꾸기` : label} style={{ fontSize: 12, fontWeight: 700, color: empty ? "var(--text-secondary)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {onType && (
                        <button onClick={(e) => onType(e.clientX, e.clientY)} title="값을 직접 입력(드래그로 못 맞추는 자리)"
                            style={miniLink}>
                            입력
                        </button>
                    )}
                    {stow && (
                        // draggable=false + dragstart 차단: 이 버튼 위에서 시작한 드래그가 순서 이동이 되면 안 된다.
                        <button className="rail-stow" draggable={false} onDragStart={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); stow.onToggle(); }}
                            title={stow.hidden ? "이 축을 서랍에서 꺼내기" : "이 축을 서랍에 넣기 — 조건은 그대로 살아 있습니다"}
                            style={miniLink}>
                            {stow.hidden ? "꺼내기" : "서랍에"}
                        </button>
                    )}
                </div>
            </div>

            {disabledNote ? (
                <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {disabledNote}
                </div>
            ) : (
                <div
                    ref={trackRef}
                    onPointerDown={onTrackDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    title={cut ? "누르거나 끌어서 컷 이동" : "빈 곳을 끌면 새 구간 · 경계 값을 끌면 조정"}
                    style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", cursor: "crosshair", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
                >
                    {/* 기준선 — 조건이 없으면 전체가 걸린 색(전부 통과라는 뜻). */}
                    <div style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, top: "50%", height: 2, transform: "translateY(-50%)", background: empty ? `${FILTER}66` : "var(--border-default)", pointerEvents: "none" }} />

                    {/* 도메인 끝 라벨 — 이 레일의 척도가 어디서 어디까지인지. */}
                    <span style={endLabel(true)}>{minLabel}</span>
                    <span style={endLabel(false)}>{maxLabel}</span>

                    {/* 실제 자리 — 유니버스를 보면서 자르게 하는 표식. 멤버 층이 켜지면 배경으로 물러난다(전경/배경 분리). */}
                    {tickSpans?.map((t, i) => (
                        <span key={i} aria-hidden style={{ position: "absolute", left: at(t.frac), top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 9, background: "var(--text-tertiary)", opacity: t.alpha, pointerEvents: "none" }} />
                    ))}

                    {/* 선택 집합 멤버 — 강조색 + 알파 누적(겹칠수록 진해짐 = 이 축의 어디에 몰리나). 접혀도 같은 셈. */}
                    {memberSpans?.map((t, i) => (
                        <span key={`m${i}`} aria-hidden style={{ position: "absolute", left: at(t.frac), top: "50%", transform: "translate(-50%,-50%)", width: 2, height: 12, borderRadius: 1, background: ACTIVE, opacity: t.alpha, pointerEvents: "none" }} />
                    ))}

                    {shown.map((r, i) => {
                        const a = toFrac(r.from), b = toFrac(r.to);
                        const lo = Math.min(a, b), hi = Math.max(a, b);
                        return (
                            <div key={i}>
                                <div style={{ position: "absolute", top: "50%", height: 3, transform: "translateY(-50%)", left: at(lo), width: `calc(${clamp01(hi) - clamp01(lo)} * (100% - ${2 * RAIL_PAD}px))`, background: FILTER, boxShadow: `0 0 7px 1px ${FILTER}66`, pointerEvents: "none", zIndex: 1 }} />
                                {(cut ? (["to"] as const) : (["from", "to"] as const)).map((edge) => {
                                    const f = edge === "from" ? a : b;
                                    return (
                                        <div key={edge}>
                                            <span aria-hidden style={{ position: "absolute", top: "50%", left: at(f), transform: "translate(-50%,-50%)", width: 3, height: 14, borderRadius: 1.5, background: FILTER, pointerEvents: "none", zIndex: 3 }} />
                                            {/* 포인터는 트랙이 캡처한다 — 라벨에 move/up 을 또 달면 같은 드래그가 두 번 접수된다. */}
                                            <span
                                                onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { kind: "edge", index: i, edge }); }}
                                                title="끌어서 이 경계 조정"
                                                style={{ position: "absolute", top: "calc(50% + 8px)", left: at(f), transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 700, color: FILTER, cursor: "ew-resize", whiteSpace: "nowrap", touchAction: "none", zIndex: 5 }}
                                            >{fmt(r[edge])}</span>
                                        </div>
                                    );
                                })}
                                {removable && preview === null && (
                                    <button onClick={() => onChange(removeAt(ranges, i))} title="이 구간 삭제"
                                        style={{ position: "absolute", top: "calc(50% - 19px)", left: at((lo + hi) / 2), transform: "translateX(-50%)", border: "none", background: "transparent", color: FILTER, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0, zIndex: 5 }}>✕</button>
                                )}
                            </div>
                        );
                    })}

                    {marker && (
                        <>
                            <div aria-hidden style={{ position: "absolute", left: at(marker.frac), top: "50%", width: 0, height: 0, zIndex: 6, pointerEvents: "none" }}>
                                <CurrentMarker color={ACTIVE} />
                            </div>
                            <span data-marker={marker.label} style={{ position: "absolute", top: "calc(50% - 21px)", left: at(marker.frac), transform: marker.frac > 0.5 ? "translateX(-100%)" : "none", marginLeft: marker.frac > 0.5 ? -8 : 8, fontSize: 9.5, fontWeight: 700, color: ACTIVE, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 4 }}>
                                {marker.label}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** 현재 타점 자리 표식 — 선 위에 서는 물방울 핀. 레일이 유일한 소비자라 여기 산다. */
function CurrentMarker({ color }: { color: string }): JSX.Element {
    return (
        <span aria-hidden style={{ position: "absolute", left: "50%", bottom: "calc(100% + 3px)", width: 16, height: 21, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 6 }}>
            <svg width="16" height="21" viewBox="0 0 26 34">
                <path d="M13 3.6 C7.5 3.6 3.6 8 3.6 12.6 C3.6 18.4 13 30.4 13 30.4 C13 30.4 22.4 18.4 22.4 12.6 C22.4 8 18.5 3.6 13 3.6 Z" fill={color} />
                <circle cx="13" cy="12.4" r="4.4" fill="var(--bg-primary)" />
            </svg>
        </span>
    );
}

/** 이름 열 아래의 작은 글자 손잡이(값 입력·서랍) — 둘이 나란히 서므로 모양이 같아야 한 종류로 읽힌다. */
const miniLink: CSSProperties = {
    border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 9.5,
    color: "var(--text-tertiary)", cursor: "pointer", textDecoration: "underline dotted",
};

const endLabel = (left: boolean): CSSProperties => ({
    position: "absolute", top: "calc(50% - 19px)", [left ? "left" : "right"]: 2,
    fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap", pointerEvents: "none",
});
