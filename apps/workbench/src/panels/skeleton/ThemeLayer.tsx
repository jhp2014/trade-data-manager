// 테마 오버레이의 **그리기** — 상태·계산은 useThemeOverlay 가 안다.
//
// 세 조각이 서로 다른 좌표계에 산다. 한 파일에 두는 건 셋이 같은 재료(overlay·colorOf·hovered)를 보고
// 하나만 바뀌어도 나머지가 따라 바뀌기 때문이다:
//   · ThemeLeaders — 클립 **밖** SVG. 거터 이름과 실제 선을 잇는 지시선.
//   · ThemeLines   — 클립 **안** SVG. 선(순수 그림)과 그 위의 투명 히트라인.
//   · ThemeGutter  — 그림 상자 **왼쪽** HTML. 이름 칩과 넘침 뱃지.
//
// ⚠ **지시선은 눈금보다 먼저 그린다.** 눈금 숫자 칸을 가로지르므로 나중에 그리면 점선이 숫자 위에
// 얹혀 둘 다 못 읽는다. 클립 밖이라는 것과 별개의 규약이고, 층 순서 테스트가 이걸 잡는다.
import { fmtPct } from "../../lib/format.js";
import { clamp, median } from "../../lib/num.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { badgeChip, chip, labelDot } from "./chips.js";
import { runWidth } from "./amountLayer.js";
import { decimate, clipToX, splitAtX, type AmountRun } from "./skeletonOverlay.js";
import type { ThemeLabel, ThemeOverlay, ThemeView } from "./useThemeOverlay.js";

/**
 * 거터 안 두 칸의 경계 — 축에서 이만큼은 **눈금 숫자**의 자리이고, 테마 이름은 그 **왼쪽**에 선다
 * (사용자 확정). 예전엔 둘 다 축에 붙어 오른쪽 정렬이라 `0%` 와 종목명이 같은 자리에서 겹쳤다.
 */
export const THEME_LABEL_INSET = 46;

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

/** 화면 좌표 폴리라인 문자열 — 배율에 맞춰 점을 솎는다. */
type PathOf = (points: readonly { x: number; y: number }[], step: number) => string;

// ── 지시선(클립 밖) ─────────────────────────────────────────────────────────

/**
 * 거터 이름과 **선이 좌단에서 잘리는 그 점**을 잇는다. 라벨이 제 높이를 안 지키므로
 * (세로로 벌려 세우니까) 이 선이 유일한 대응 표시다.
 * 끝점 x 는 상자 안으로 클램프 — 폴백(좌단 밖 끝점)일 때 지시선이 화면 밖으로 뻗지 않게.
 */
export function ThemeLeaders({ labels, scales, box, colorOf, hovered }: {
    labels: readonly ThemeLabel[];
    scales: Scales;
    box: Box;
    colorOf: (code: string) => string;
    hovered: ReadonlySet<string> | null;
}): JSX.Element {
    return (
        <g data-layer="theme-leaders">
            {labels.map((l) => {
                const tx = clamp(scales.x(l.at.x), box.left, box.left + box.width);
                const ty = l.anchorY; // 상자 밖 값은 가장자리로 당겨진 자리(칩의 ▲▼ 가 밖이라고 말한다)
                const lit = hovered?.has(l.code) ?? false;
                return (
                    <g key={`tld-${l.code}`} style={{ pointerEvents: "none" }} opacity={lit ? 0.9 : 0.4}>
                        <line x1={box.left - THEME_LABEL_INSET + 2} y1={l.labelY} x2={tx} y2={ty}
                            stroke={colorOf(l.code)} strokeWidth={0.8} strokeDasharray="2 2" />
                        {/* 잘리는 지점 표식 — 점선이 가리키는 곳이 눈에 딱 집히게. */}
                        <circle cx={tx} cy={ty} r={2.2} fill={colorOf(l.code)} />
                    </g>
                );
            })}
        </g>
    );
}

// ── 선 + 히트라인(클립 안) ──────────────────────────────────────────────────

/**
 * 분당 종가 경로(%p 평행이동, 세로 간격 보존). 골격보다 **먼저** 그린다: 이건 배경이고 주인공은 내 골격이다.
 * 기본은 무채색 흐림 — 흐린 채색은 색이 아니다(알파가 낮으면 hue 차이가 안 읽힌다).
 * 굵기를 켜면 거래대금 램프로 살아난다. **타점 이후(x ≥ 0)는 앵커 선과 같은 문장** —
 * 폴리라인은 점선, 런은 옅게(굵기와 안 싸우게).
 */
export function ThemeLines({ overlay, runs, hovered, pathOf, clip, lineStep, hitStep, onHover, onToggleCandle }: {
    overlay: ThemeOverlay;
    runs: ReadonlyMap<string, AmountRun[]> | null;
    hovered: ReadonlySet<string> | null;
    pathOf: PathOf;
    /** 보이는 x 구간 — 화면 밖 런은 아예 안 그린다(하루치 런은 대부분 창 밖이다). */
    clip: { from: number; to: number } | null;
    lineStep: number;
    hitStep: number;
    onHover: (codes: readonly string[] | null) => void;
    onToggleCandle: (code: string) => void;
}): JSX.Element {
    return (
        <>
            <g data-layer="theme-lines">
                {overlay.lines.map((l) => {
                    const lit = hovered?.has(l.code) ?? false;
                    const r = runs?.get(l.code);
                    if (!r) {
                        const { past, future } = splitAtX(decimate(clip ? clipToX(l.points, clip.from, clip.to) : l.points, lineStep), 0);
                        return (
                            <g key={`th-${l.code}`} style={{ pointerEvents: "none" }} opacity={lit ? 0.9 : hovered ? 0.2 : 0.45}>
                                {past.length >= 2 && <polyline points={pathOf(past, 1)} fill="none" stroke="var(--text-tertiary)" strokeWidth={lit ? 2 : 1} strokeLinejoin="round" />}
                                {future.length >= 2 && <polyline points={pathOf(future, 1)} fill="none" stroke="var(--text-tertiary)" strokeWidth={lit ? 2 : 1} strokeLinejoin="round" strokeDasharray="4 4" />}
                            </g>
                        );
                    }
                    // 선은 무채색, **굵기가 거래대금**이다. 짚은 것만 또렷해지고 굵기 배수도 커진다.
                    // 테마 배수를 앵커보다 낮게 잡아 30선이 굵어져도 주인공이 안 묻힌다.
                    return (
                        <g key={`th-${l.code}`} style={{ pointerEvents: "none" }} opacity={lit ? 1 : hovered ? 0.25 : 0.55}>
                            {r.filter((run) => !clip || (run.points[run.points.length - 1].x >= clip.from && run.points[0].x <= clip.to)).map((run, i) => (
                                <polyline key={i} points={pathOf(run.points, lineStep)} fill="none"
                                    stroke="var(--text-tertiary)" strokeWidth={runWidth(run.level, lit ? 0.9 : 0.7)}
                                    strokeLinecap="round" strokeLinejoin="round"
                                    opacity={run.points[0].x >= 0 ? 0.4 : 1} />
                            ))}
                        </g>
                    );
                })}
            </g>

            {/* 투명 히트라인 — 선 위에 손을 올리면 거터 라벨과 똑같이 반응한다(사용자 확정).
                "선은 순수 그림, 손잡이는 라벨"은 **수백 선**이 얽힐 때 DOM 히트가 겨냥한 걸 안 주기
                때문이었다. 여기 대상은 30선이라 8px 히트 폭이면 충분히 겨냥된다.

                ⚠ **드래그 중이라고 언마운트하면 안 된다**(겪은 버그): d3-zoom 은 움직임이 없어도
                **mousedown 에서** 제스처를 시작해 dragging=true 가 된다 → 히트라인이 사라지고 →
                mouseup 이 다른 요소에서 나 **click 이 아예 안 뜬다**(선 클릭 캔들 토글이 죽었다).
                이동 비용은 언마운트가 아니라 **화면 구간 자르기 + 솎기**로 줄인다(pathOf). */}
            <g data-layer="theme-hit">
                {overlay.lines.map((l) => (
                    <polyline key={`thh-${l.code}`}
                        points={pathOf(l.points, hitStep)}
                        fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={() => onToggleCandle(l.code)}
                        onMouseEnter={() => onHover([l.code])}
                        onMouseLeave={() => onHover(null)} />
                ))}
            </g>
        </>
    );
}

// ── 거터 이름 층(HTML) ──────────────────────────────────────────────────────

/**
 * 왼쪽 거터(그림 상자 바깥)라 컨테이너가 `0..box.left` 를 덮는다. 라벨은 오른쪽 정렬로 거터 끝에 붙고,
 * 점이 선에 닿는 쪽(오른쪽 끝)에 온다. 상한을 넘은 나머지는 뱃지 하나 — 누르면 목록.
 *
 * ⚠ 컨테이너는 포인터를 통과시킨다 — 거터는 **y축 스트립**이기도 해서(세로 확대 손짓의 자리)
 * 여기가 이벤트를 먹으면 그 손짓이 죽는다. 칩만 `pointerEvents: auto` 로 받는다.
 */
export function ThemeGutter({ theme, labels, box, swapped, isCandleOn, onToggleCandle }: {
    theme: ThemeView;
    labels: { named: ThemeLabel[]; hidden: { code: string; name: string; y: number }[] };
    box: Box;
    swapped: boolean;
    isCandleOn: (code: string) => boolean;
    onToggleCandle: (code: string) => void;
}): JSX.Element | null {
    const overlay = theme.overlay;
    if (!overlay) return null;
    const setHovered = theme.setHovered;
    return (
        <>
            {/* 다른 골격선을 보는 동안엔 이름도 물러난다 — 선이 없는데 이름만 진하면 뭘 가리키는지 모른다. */}
            <div data-layer="theme-gutter"
                style={{ position: "absolute", left: 0, top: box.top, width: box.left, height: box.height, overflow: "hidden", pointerEvents: "none", opacity: swapped ? 0.25 : 1 }}>
                {labels.named.map((l) => {
                    const lit = theme.hovered?.has(l.code) ?? false;
                    const on = isCandleOn(l.code);
                    return (
                        // 이름 라벨 클릭 = 그 멤버 캔들 토글(선 클릭과 같은 손짓 — 라벨은 선의 손잡이니까).
                        <button key={`tl-${l.code}`}
                            onClick={() => onToggleCandle(l.code)}
                            onMouseEnter={() => setHovered([l.code])}
                            onMouseLeave={() => setHovered(null)}
                            title={`${l.name} 전일比 ${fmtPct(l.at.y + overlay.baseRate)} — 올리면 그 선만 또렷해진다 · 클릭해 캔들 ${on ? "끄기" : "켜기"}`}
                            style={{
                                // 눈금 숫자 칸(THEME_LABEL_INSET) **왼쪽**에 오른쪽 정렬로 선다.
                                ...chip, left: box.left - THEME_LABEL_INSET, top: l.labelY - box.top, transform: "translate(-100%, -50%)",
                                maxWidth: box.left - THEME_LABEL_INSET - 4, overflow: "hidden",
                                color: lit || on ? "var(--text-primary)" : "var(--text-tertiary)",
                                fontWeight: lit || on ? 700 : 400,
                                // 캔들이 켜진 종목은 밑줄 — 어느 선의 캔들을 보고 있는지가 목록에서 읽힌다.
                                ...(on ? { textDecoration: "underline" } : {}),
                            }}>
                            {l.off && <span style={{ color: "var(--text-tertiary)" }}>{l.off === "up" ? "▲" : "▼"}</span>}
                            {l.name}
                            <span style={labelDot(theme.colorOf(l.code))} />
                        </button>
                    );
                })}
                {labels.hidden.length > 0 && (
                    <button
                        onClick={(e) => theme.openBadge({ x: e.clientX, y: e.clientY }, labels.hidden.map((h) => h.code))}
                        onMouseEnter={() => setHovered(labels.hidden.map((h) => h.code))} onMouseLeave={() => setHovered(null)}
                        title={`이름을 못 단 ${labels.hidden.length}종목 — 올리면 그 선들이 켜지고, 누르면 목록`}
                        style={{
                            ...chip, ...badgeChip,
                            left: box.left - THEME_LABEL_INSET, top: median(labels.hidden.map((h) => h.y)) - box.top,
                            transform: "translate(-100%, -50%)",
                        }}>
                        +{labels.hidden.length}
                    </button>
                )}
            </div>

            {/* 거터에 이름을 못 단 종목들 — 등락률 순 목록. 행에 손을 올리면 그 선이 켜진다. */}
            {theme.badge && (
                <AnchoredPopover anchor={theme.badge} onClose={theme.closeBadge} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>이름 생략 {theme.badge.members.length}종목</MenuLabel>
                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                        {theme.badge.members.map((code) => {
                            const l = overlay.lines.find((x) => x.code === code);
                            if (!l) return null;
                            return (
                                // 목록 행도 거터 라벨과 같은 손짓 — 누르면 그 종목 캔들 토글.
                                <div key={code} onMouseEnter={() => setHovered([code])} onMouseLeave={() => setHovered(null)}>
                                    <MenuItem onClick={() => onToggleCandle(code)}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 3, background: theme.colorOf(code), flexShrink: 0 }} />
                                            <span>{l.name}</span>
                                            <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtPct(l.points[0].y + overlay.baseRate)}</span>
                                        </span>
                                    </MenuItem>
                                </div>
                            );
                        })}
                    </div>
                </AnchoredPopover>
            )}
        </>
    );
}
