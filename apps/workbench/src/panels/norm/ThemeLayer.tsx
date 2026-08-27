// 테마 오버레이의 **그리기** — 상태·계산은 useThemeOverlay 가 안다.
//
// 두 조각만 남았다(이름 칩과 지시선은 오른쪽 거터로 합쳐졌다 — GutterLayer):
//   · ThemeHit          — 클립 **안** SVG. 선 위의 투명 히트라인(손짓만).
//   · ThemeOverflowMenu — 거터에서 이름을 못 단 종목들의 목록(넘침 뱃지가 여는 팝오버).
//
// 보이는 선 자체는 여기 없다 — 표시목록 빌더(themeLinesLayer)가 진다. 그림은 데이터로 내리고
// 손짓만 DOM 에 남기는 게 이 패널의 규약이고, 캔버스 전환이 조작을 안 건드리는 이유다.
import { fmtPct } from "../../lib/format.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import type { ThemeOverlay, ThemeView } from "./useThemeOverlay.js";

/** 화면 좌표 폴리라인 문자열 — 배율에 맞춰 점을 솎는다. */
type PathOf = (points: readonly { x: number; y: number }[], step: number) => string;

// ── 히트라인(클립 안) ───────────────────────────────────────────────────────

/**
 * 투명 히트라인 — 선 위에 손을 올리면 거터 라벨과 똑같이 반응한다(사용자 확정).
 * "선은 순수 그림, 손잡이는 라벨"은 **수백 선**이 얽힐 때 DOM 히트가 겨냥한 걸 안 주기
 * 때문이었다. 여기 대상은 30선이라 8px 히트 폭이면 충분히 겨냥된다.
 *
 * 보이는 선은 표시목록으로 갈라져 나갔다(themeLinesLayer) — 그림은 데이터고 손짓은 DOM 이다.
 * 캔버스로 옮기는 건 그림 쪽뿐이라 이 층은 그대로 SVG 에 남는다.
 *
 * ⚠ **드래그 중이라고 언마운트하면 안 된다**(겪은 버그): d3-zoom 은 움직임이 없어도
 * **mousedown 에서** 제스처를 시작해 dragging=true 가 된다 → 히트라인이 사라지고 →
 * mouseup 이 다른 요소에서 나 **click 이 아예 안 뜬다**(선 클릭 캔들 토글이 죽었다).
 * 이동 비용은 언마운트가 아니라 **화면 구간 자르기 + 솎기**로 줄인다(pathOf).
 */
export function ThemeHit({ overlay, pathOf, hitStep, onHover, onToggleCandle }: {
    overlay: ThemeOverlay;
    pathOf: PathOf;
    hitStep: number;
    onHover: (codes: readonly string[] | null) => void;
    onToggleCandle: (code: string) => void;
}): JSX.Element {
    return (
        <g data-layer="theme-hit">
            {/* 조각마다 히트라인 하나 — 이어 붙이면 갭(이탈) 위 빈 공간에서도 선이 켜진다. 1점 조각은 히트 없음(겨냥할 획이 없다). */}
            {overlay.lines.flatMap((l) => l.segments.filter((seg) => seg.length >= 2).map((seg, i) => (
                <polyline key={`thh-${l.code}-${i}`}
                    points={pathOf(seg, hitStep)}
                    fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={() => onToggleCandle(l.code)}
                    onMouseEnter={() => onHover([l.code])}
                    onMouseLeave={() => onHover(null)} />
            )))}
        </g>
    );
}

// ── 넘침 목록(팝오버) ──────────────────────────────────────────────────────

/**
 * 거터에서 이름을 못 단 종목들 — 등락률 순 목록. 행에 손을 올리면 그 선이 켜지고, 누르면 캔들 토글.
 * (거터의 넘침 뱃지가 연다 — 자리는 거터가, 목록은 여기가 진다.)
 */
export function ThemeOverflowMenu({ theme, onToggleCandle }: {
    theme: ThemeView;
    onToggleCandle: (code: string) => void;
}): JSX.Element | null {
    const overlay = theme.overlay;
    if (!overlay || !theme.badge) return null;
    const setHovered = theme.setHovered;
    return (
        <AnchoredPopover anchor={theme.badge} onClose={theme.closeBadge} minWidth={190} padding={0} placement="beside" offset={6}>
            <MenuLabel>이름 생략 {theme.badge.members.length}종목</MenuLabel>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {theme.badge.members.map((code) => {
                    const l = overlay.lines.find((x) => x.code === code);
                    if (!l) return null;
                    return (
                        // 목록 행도 거터 칩과 같은 손짓 — 누르면 그 종목 캔들 토글.
                        <div key={code} onMouseEnter={() => setHovered([code])} onMouseLeave={() => setHovered(null)}>
                            <MenuItem onClick={() => onToggleCandle(code)}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 3, background: theme.colorOf(code), flexShrink: 0 }} />
                                    <span>{l.name}</span>
                                    {/* 첫 점의 등락률 — 재적 모드에선 "첫 재적 분"의 값이다(하루 시작 아님). */}
                                    <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtPct(l.segments[0][0].y + overlay.baseRate)}</span>
                                </span>
                            </MenuItem>
                        </div>
                    );
                })}
            </div>
        </AnchoredPopover>
    );
}
