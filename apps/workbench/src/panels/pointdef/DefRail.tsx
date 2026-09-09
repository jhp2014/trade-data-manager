// 정의 레일 한 줄 — **필터 레일이 아니다**. 같은 손짓(트랙 위를 그어 자른다)을 쓰되 다른 물건이라
// 색(POINT_DEF teal)과 규약이 갈린다: 구간을 새로 긋거나 지울 수 없고(정의는 늘 정확히 하나),
// 컷 모양은 노브가 정한다(`mode`). 필터 빨강(FILTER)은 여기 금지 — 줄 하나가 딴 층이라는 표식이다.
//
// 왜 Rail 을 재사용하지 않나: railModel 의 대수는 "여러 구간 · 추가/삭제 · 대칭 손잡이"인데 여기 손짓은
// 그 어느 것도 아니다(ToleranceRail 선례 — 비대칭 손잡이라 따로 그린다). 대신 **시각 문법은 맞춘다**:
// 이름 열 폭·행 높이·트랙 여백·스트립 로그 y 가 필터 레일과 같아야 두 판이 한 목록으로 읽힌다.
//
// 분포는 **펼침이 기본이되 접을 수 있다**(필터 레일과 같은 "분포" 손잡이) — 이 판은 그림을 보며
// 정의를 정하려고 만든 자리라 기본이 펼침이지만, 다 정한 줄까지 자리를 먹을 이유는 없다.
// 펼침은 컴포넌트 수명이다(영속 키 신설 금지 — usePersistedState 단일 소유 규칙). 접히면 히스토그램
// memo 도 안 돈다(모수가 수천~수만이라 접는 게 곧 비용 절약이다).
//
// ⚠ 커밋은 **손을 뗄 때 한 번**. 정의는 모수 선언이라 한 번 바뀌면 1만 시그널 파생 + 결과 걷기 +
// 깔때기 정산이 전부 다시 돈다(NumField 가 blur/Enter 에서만 커밋하던 것과 같은 사정).
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { clamp01 } from "../../lib/num.js";
import { POINT_DEF } from "../../styles/palette.js";
import { RAIL_LABEL_W, RAIL_PAD, RAIL_ROW_H } from "../filter/rail/Rail.js";
import { binOverlaps, HIST_BINS, histogramOf, logHeight, binCenter } from "../filter/rail/railHistogram.js";

const HIST_ROW_H = 52;
const HIST_BAR_H = 38;

/**
 * 컷 모양 — 색칠된 구간은 **언제나 살아남는 쪽**이다(레일들이 한 눈으로 읽히는 유일한 규칙):
 *  · lower = [v, 오른끝] 생존(게이트·병합 — 값이 클수록 산다)
 *  · upper = [왼끝, v] 생존(근접 — 깊이가 얕을수록 산다)
 * 구간 하나짜리 `band` 모드는 2026-09-07 삭제 — 자격 시각이 **여러 구간**이 되면서 필터 레일 `Rail`
 * (railModel: 추가·삭제·정렬)로 갔다. 여기 남는 건 손잡이 하나짜리 컷뿐이다.
 */
export type DefRailMode = "lower" | "upper";

export interface DefRailProps {
    label: string;
    /** 이름 열 둘째 줄 — 이 레일의 자(무엇을 세는가). 라벨이 늘 말하게 한다. */
    unit: string;
    /** 값 → 0..1 자리(로그 척도는 호출자가 흡수). */
    toFrac: (v: number) => number;
    /** 0..1 → 값. **스냅(정수 억·분·0.05%)까지 여기서** 끝낸다 — 커밋값과 표기값이 갈리면 안 된다. */
    fromFrac: (f: number) => number;
    fmt: (v: number) => string;
    minLabel: string;
    maxLabel: string;
    /** 분포 모수(값 그대로). **이 배열 신원이 memo 키다** — 렌더마다 새 배열이면 수천 개를 매번 다시 센다. */
    values: readonly number[];
    mode: DefRailMode;
    /** lower = 왼쪽 컷 값(오른끝은 도메인) · upper = 오른쪽 컷 값(왼끝은 도메인). */
    from: number;
    to: number;
    /** 살아남은/밖 건수를 받아 정산 문구를 만든다 — 자가 레일마다 다르므로(레벨·시그널·후보 봉) 호출자 몫. */
    note: (inside: number, outside: number) => { text: string; title: string };
    /**
     * 컷 안인가 — 정산(생존/밖)의 자. 기본은 양 끝 포함이고, 판정이 **열린 끝**인 레일만 넘긴다
     * (근접: 후보 조건이 `high > M×(1−m'/100)` 이라 깊이 d = m' 인 봉은 후보가 **아니다** — 가격이
     * 정수 원이라 d 동률이 흔해서 이 한 칸이 "0% 인데 후보 +N" 같은 거짓말이 된다).
     * ⚠ `values`·`toFrac` 과 같이 **신원이 memo 키다** — 인라인 화살표를 넘기면 수천 값 정산이 매 렌더 돈다.
     */
    insideOf?: (v: number, from: number, to: number) => boolean;
    /** 손 뗄 때 한 번. 움직인 쪽만 바뀐 값이 온다(반대쪽은 도메인 끝 그대로). */
    onCommit: (next: { from: number; to: number }) => void;
    title?: string;
    /**
     * 줄 색 — 기본은 정의층(POINT_DEF teal). 급타점 패널의 W·r 레일은 **전제이지 필터가 아니라**
     * 결과 T 레일과 같은 앰버(LEG_HIGH)를 쓴다. 필터 빨강(FILTER)은 어느 쪽에도 금지 — 이 줄이
     * 모수를 안 거른다는 표식이 색이다.
     */
    accent?: string;
}

type Edge = "from" | "to";

export function DefRail({ label, unit, toFrac, fromFrac, fmt, minLabel, maxLabel, values, mode, from, to, note, insideOf, onCommit, title, accent = POINT_DEF }: DefRailProps): JSX.Element {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<Edge | null>(null);
    const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
    const shown = preview ?? { from, to };

    const fracAt = (clientX: number): number => {
        const el = trackRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        return clamp01((clientX - rect.left - RAIL_PAD) / Math.max(1, rect.width - 2 * RAIL_PAD));
    };

    // 끌리는 끝은 하나다 — 반대쪽이 도메인 끝에 못 박혀 있어(그릴 손잡이도 없다) 트랙 아무 데나 눌러도
    // 그 하나가 움직인다(컷 레일의 탭 의미론).
    const movingEdge: Edge = mode === "lower" ? "from" : "to";

    const applyDrag = (frac: number): { from: number; to: number } => {
        const v = fromFrac(frac);
        const cur = preview ?? { from, to };
        return mode === "lower" ? { from: v, to: cur.to } : { from: cur.from, to: v };
    };

    const beginDrag = (e: ReactPointerEvent): void => {
        if (e.button !== 0) return;
        dragRef.current = movingEdge;
        setPreview(applyDrag(fracAt(e.clientX)));
        trackRef.current?.setPointerCapture(e.pointerId);
    };
    const onTrackDown = (e: ReactPointerEvent): void => {
        if (e.target !== e.currentTarget) return; // 손잡이 라벨 위는 그 경계 편집
        beginDrag(e);
    };
    const onMove = (e: ReactPointerEvent): void => {
        if (dragRef.current) setPreview(applyDrag(fracAt(e.clientX)));
    };
    const onUp = (): void => {
        const edge = dragRef.current;
        const next = preview;
        dragRef.current = null;
        setPreview(null);
        if (edge && next) onCommit(next);
    };
    // 취소(브라우저가 포인터를 회수 — 터치 제스처·포커스 상실)는 **커밋이 아니다**: 확정하지 않은 창이
    // 정의로 들어가면 1만 시그널 파생 + 결과 걷기 + 깔때기 정산이 통째로 다시 돈다. 미리보기만 버린다.
    const onCancel = (): void => {
        dragRef.current = null;
        setPreview(null);
    };

    const at = (f: number): string => `calc(${RAIL_PAD}px + ${clamp01(f)} * (100% - ${2 * RAIL_PAD}px))`;
    const widthOf = (a: number, b: number): string => `calc(${Math.max(0, clamp01(b) - clamp01(a))} * (100% - ${2 * RAIL_PAD}px))`;
    const fFrom = mode === "upper" ? 0 : toFrac(shown.from);
    const fTo = mode === "lower" ? 1 : toFrac(shown.to);
    // 손잡이는 **끌 수 있는 끝에만** 선다 — 못 끄는 자리에 손잡이를 그리면 거짓 손잡이다(Rail cut 규약).
    const edges: Edge[] = [movingEdge];

    // 펼침 — 필터 레일의 "분포" 링크와 같은 문법·같은 수명(컴포넌트). 기본은 펼침(이 판의 존재 이유).
    const [distOpen, setDistOpen] = useState(true);
    const hist = useMemo(() => (distOpen ? histogramOf(values.map(toFrac), undefined) : null), [distOpen, values, toFrac]);
    // 정산은 칸이 아니라 **값**으로 센다(비닝 오차 없는 정확한 수). 미리보기 중에도 따라 움직인다 —
    // 손을 떼기 전에 "여기까지 조이면 몇"이 보이는 게 이 판의 전부다.
    const inside = useMemo(() => {
        const test = insideOf ?? ((v: number, lo: number, hi: number): boolean => v >= lo && v <= hi);
        const lo = mode === "upper" ? -Infinity : shown.from;
        const hi = mode === "lower" ? Infinity : shown.to;
        return values.reduce((n, v) => n + (test(v, lo, hi) ? 1 : 0), 0);
    }, [values, shown.from, shown.to, mode, insideOf]);
    const noted = note(inside, values.length - inside);

    return (
        <div style={{ borderBottom: "1px solid var(--border-subtle)" }} title={title}>
            <div style={{ display: "flex", alignItems: "center", height: RAIL_ROW_H }}>
                <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                    <div title={noted.title} style={{ fontSize: 9, lineHeight: 1.3, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {noted.text}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 8.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{unit}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setDistOpen((v) => !v); }}
                            title={distOpen ? "분포 접기" : "이 축의 분포를 막대로 펼치기(세로 로그 척도)"}
                            style={distOpen ? { ...miniLink, color: accent, textDecoration: "underline" } : miniLink}
                        >
                            분포
                        </button>
                    </div>
                </div>
                <div
                    ref={trackRef}
                    onPointerDown={onTrackDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                    title="누르거나 끌어서 컷 이동"
                    style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", cursor: "crosshair", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
                >
                    <span style={endLabel(true)}>{minLabel}</span>
                    <span style={endLabel(false)}>{maxLabel}</span>
                    <div aria-hidden style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, top: "50%", height: 2, transform: "translateY(-50%)", background: "var(--border-default)", pointerEvents: "none" }} />
                    <div aria-hidden style={{ position: "absolute", top: "50%", height: 4, transform: "translateY(-50%)", left: at(fFrom), width: widthOf(fFrom, fTo), background: accent, pointerEvents: "none", zIndex: 1 }} />
                    {edges.map((edge) => {
                        const f = edge === "from" ? fFrom : fTo;
                        return (
                            <div key={edge}>
                                <span aria-hidden style={{ position: "absolute", top: "50%", left: at(f), transform: "translate(-50%,-50%)", width: 3, height: 15, borderRadius: 1.5, background: accent, pointerEvents: "none", zIndex: 3 }} />
                                {/* 포인터는 트랙이 캡처한다 — 라벨엔 down 만 단다(move/up 을 또 달면 같은 드래그가 두 번 접수된다). */}
                                <span
                                    onPointerDown={(e) => { e.stopPropagation(); beginDrag(e); }}
                                    title="끌어서 이 경계 조정"
                                    style={{ position: "absolute", top: "calc(50% + 8px)", left: at(f), transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 700, color: accent, cursor: "ew-resize", whiteSpace: "nowrap", touchAction: "none", zIndex: 5 }}
                                >{fmt(edge === "from" ? shown.from : shown.to)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 분포 — x 는 위 트랙과 같은 식(RAIL_PAD·at)이라 막대와 경계가 세로로 맞는다. 세로는 로그
                (봉우리 하나가 꼬리를 눌러 "여긴 아무것도 없다"처럼 보이는 걸 막는다) — 최다 건수는 이름 열이 적는다. */}
            {hist && (
            <div style={{ display: "flex", height: HIST_ROW_H, background: "var(--bg-secondary)" }}>
                <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 6px 8px", display: "flex", alignItems: "flex-end", fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden" }}>
                    최다 {hist.max.toLocaleString()}건(로그)
                </div>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    <div style={{ position: "absolute", left: RAIL_PAD, right: RAIL_PAD, bottom: 6, height: HIST_BAR_H, display: "flex", alignItems: "flex-end" }}>
                        {hist.bins.map((b, i) => {
                            // 칸을 **점이 아니라 구간**으로 본다(railHistogram.binOverlaps 와 같은 이유):
                            // 가운데로 판정하면 한 칸(시각 레일 7.2분)보다 좁은 창이 어떤 칸도 못 물어
                            // 스트립 전체가 제외 색이 된다 — 조건은 걸려 있는데 "여긴 아무것도 없다"로 읽힌다.
                            const alive = binOverlaps(i, fFrom, fTo, HIST_BINS);
                            const h = logHeight(b.count, hist.max) * HIST_BAR_H;
                            // 칸은 막대가 아니라 **칸 전체**다 — 0건 자리에서도 툴팁에 손이 닿는다.
                            return (
                                <div key={i} data-bin={i}
                                    title={`${fmt(fromFrac(binCenter(i, HIST_BINS)))} · ${b.count.toLocaleString()}건${alive ? "" : " (컷 밖)"}`}
                                    style={{ flex: 1, position: "relative", height: "100%", overflow: "hidden" }}>
                                    {b.count > 0 && (
                                        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: alive ? accent : "var(--border-default)" }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {edges.map((edge) => (
                        // translateX(-50%) 필수 — 위 손잡이(width 3)가 중심을 at(f) 에 두므로, 빼면 반 픽셀 어긋난다(실측 선례).
                        <span key={edge} aria-hidden style={{ position: "absolute", left: at(edge === "from" ? fFrom : fTo), transform: "translateX(-50%)", top: 0, bottom: 4, width: 1, background: accent, opacity: 0.6, pointerEvents: "none" }} />
                    ))}
                </div>
            </div>
            )}
        </div>
    );
}

/** 이름 열 아래의 작은 글자 손잡이 — 필터 레일의 "입력·분포·서랍"과 같은 모양이라 한 종류로 읽힌다. */
const miniLink: CSSProperties = {
    border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 9,
    color: "var(--text-tertiary)", cursor: "pointer", textDecoration: "underline dotted",
    whiteSpace: "nowrap", flexShrink: 0,
};

const endLabel = (left: boolean): CSSProperties => ({
    position: "absolute", top: "calc(50% - 19px)", [left ? "left" : "right"]: 2,
    fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap", pointerEvents: "none",
});
