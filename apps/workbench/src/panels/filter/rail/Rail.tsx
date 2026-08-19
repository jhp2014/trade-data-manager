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
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { clamp01 } from "../../../lib/num.js";
import { ACTIVE, FILTER } from "../../../styles/palette.js";
import { applyDrag, fracOfX, isTapRange, orderRanges, removeAt, type RailDrag, type RailRange } from "./railModel.js";

/** 트랙 좌우 여백(px) — 경계가 끝에 서도 라벨이 잘리지 않을 만큼. */
export const RAIL_PAD = 22;
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
    /** 그릴 수 없는 레일(값 없음·배치 없음) — 트랙 대신 이유를 적는다. */
    disabledNote?: string;
    /**
     * 정밀 입력 입구 — 이름 아래 작게. 드래그로 못 맞추는 자리(09:03)를 위한 보조라 **이름 열에** 둔다.
     * 오른쪽에 두면 컨트롤이 늘어날 때마다 트랙이 짧아지는데, 이 화면에서 폭이 곧 해상도다.
     * 자리를 클릭하는 게 이미 정밀 입력인 레일(판단 축)은 안 준다.
     */
    onType?: (x: number, y: number) => void;
    /** 손을 뗄 때 한 번. 정렬(from ≤ to)까지 마친 구간 리스트가 온다. */
    onChange: (ranges: RailRange<V>[]) => void;
}

export function Rail<V>({
    label, ranges, single = false, toFrac, fromFrac, fmt, minLabel, maxLabel,
    ticks, memberTicks, marker, highlight = false, disabledNote, onType, onChange,
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
        setPreview(applyDrag(ranges, drag, fracAt(e.clientX), fromFrac, { single }));
        trackRef.current?.setPointerCapture(e.pointerId);
    };

    const onTrackDown = (e: ReactPointerEvent): void => {
        if (e.target !== e.currentTarget) return; // 자식(경계 라벨) 위는 경계 편집
        beginDrag(e, { kind: "new", anchorFrac: fracAt(e.clientX) });
    };

    const onMove = (e: ReactPointerEvent): void => {
        const drag = dragRef.current;
        if (!drag) return;
        setPreview(applyDrag(ranges, drag, fracAt(e.clientX), fromFrac, { single }));
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

    return (
        <div style={{
            display: "flex", alignItems: "center", height: RAIL_ROW_H, borderBottom: "1px solid var(--border-subtle)",
            background: highlight ? "var(--accent-soft)" : "transparent", transition: "background .35s ease",
        }}>
            <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", minWidth: 0 }}>
                <div title={label} style={{ fontSize: 12, fontWeight: 700, color: empty ? "var(--text-secondary)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                </div>
                {onType && (
                    <button onClick={(e) => onType(e.clientX, e.clientY)} title="값을 직접 입력(드래그로 못 맞추는 자리)"
                        style={{ border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 9.5, color: "var(--text-tertiary)", cursor: "pointer", textDecoration: "underline dotted" }}>
                        입력
                    </button>
                )}
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
                    title="빈 곳을 끌면 새 구간 · 경계 값을 끌면 조정"
                    style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", cursor: "crosshair", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
                >
                    {/* 기준선 — 조건이 없으면 전체가 걸린 색(전부 통과라는 뜻). */}
                    <div style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, top: "50%", height: 2, transform: "translateY(-50%)", background: empty ? `${FILTER}66` : "var(--border-default)", pointerEvents: "none" }} />

                    {/* 도메인 끝 라벨 — 이 레일의 척도가 어디서 어디까지인지. */}
                    <span style={endLabel(true)}>{minLabel}</span>
                    <span style={endLabel(false)}>{maxLabel}</span>

                    {/* 실제 자리 — 유니버스를 보면서 자르게 하는 표식. 멤버 층이 켜지면 배경으로 물러난다(전경/배경 분리). */}
                    {ticks?.map((f, i) => (
                        <span key={i} aria-hidden style={{ position: "absolute", left: at(f), top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 9, background: "var(--text-tertiary)", opacity: memberTicks && memberTicks.length > 0 ? 0.12 : 0.35, pointerEvents: "none" }} />
                    ))}

                    {/* 선택 집합 멤버 — 강조색 + 알파 누적(겹칠수록 진해짐 = 이 축의 어디에 몰리나). */}
                    {memberTicks?.map((f, i) => (
                        <span key={`m${i}`} aria-hidden style={{ position: "absolute", left: at(f), top: "50%", transform: "translate(-50%,-50%)", width: 2, height: 12, borderRadius: 1, background: ACTIVE, opacity: 0.3, pointerEvents: "none" }} />
                    ))}

                    {shown.map((r, i) => {
                        const a = toFrac(r.from), b = toFrac(r.to);
                        const lo = Math.min(a, b), hi = Math.max(a, b);
                        return (
                            <div key={i}>
                                <div style={{ position: "absolute", top: "50%", height: 3, transform: "translateY(-50%)", left: at(lo), width: `calc(${clamp01(hi) - clamp01(lo)} * (100% - ${2 * RAIL_PAD}px))`, background: FILTER, boxShadow: `0 0 7px 1px ${FILTER}66`, pointerEvents: "none", zIndex: 1 }} />
                                {(["from", "to"] as const).map((edge) => {
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
                                {preview === null && (
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
                            <span style={{ position: "absolute", top: "calc(50% - 21px)", left: at(marker.frac), transform: marker.frac > 0.5 ? "translateX(-100%)" : "none", marginLeft: marker.frac > 0.5 ? -8 : 8, fontSize: 9.5, fontWeight: 700, color: ACTIVE, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 4 }}>
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

const endLabel = (left: boolean): CSSProperties => ({
    position: "absolute", top: "calc(50% - 19px)", [left ? "left" : "right"]: 2,
    fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap", pointerEvents: "none",
});
