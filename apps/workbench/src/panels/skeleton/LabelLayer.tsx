// 선 라벨 층 — 이 패널의 **유일한 손잡이**.
//
// 선은 순수 그림이고(포인터를 안 받는다) 조작은 전부 여기로 들어온다. 뭉친 곳에서 선 호버는 원래
// 신뢰할 수 없다(브라우저는 맨 위에 그려진 걸 주지 겨냥한 걸 주지 않는다). 라벨은 앵커 반대쪽 끝,
// 즉 선들이 **가장 벌어진 자리**에 붙으므로 손잡이로 더 낫다 — 나중에 선을 캔버스로 옮겨도 조작이
// 하나도 안 바뀌는 이유다.
//
// HTML 이다(SVG 가 아니라): 칩 폭 계산이 공짜이고, d3 가 SVG mousedown 을 삼키는 문제를 피한다.
// 그림 상자 **위에** 얹히는 층이라 SVG 그리는 순서와 무관하다.
import type { CSSProperties } from "react";
import { shortDate } from "../../lib/date.js";
import { labelPointOf, type LabelCluster, type OverlayLine, type SkeletonAnchor } from "./skeletonOverlay.js";
import { badgeChip, chip, labelBg, labelDot, selectedChip } from "./chips.js";

/** 라벨 칩 한 칸의 크기(화면 px) — 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
export const LABEL_CELL = { w: 72, h: 14 };
/** 라벨 칩과 끝점 사이 간격 — 배경 패딩(3px)을 더해도 피벗 손잡이(r=7) 밖에 서야 점 호버를 안 가로챈다. */
const LABEL_GAP = 12;

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

export interface LabelLayerProps {
    clusters: readonly LabelCluster[];
    /** 묶음에서 뺀 채 언제나 그리는 것들(선택·호버). */
    pinnedKeys: ReadonlySet<string>;
    byKey: ReadonlyMap<string, OverlayLine>;
    scales: Scales;
    box: Box;
    labelAnchorMode: SkeletonAnchor;
    /** 라벨이 점의 **왼쪽**에 서나 — 앵커 반대쪽 끝이 어디냐가 정한다. */
    labelAtStart: boolean;
    /** 테마가 펼쳐진 상태 — 선이 접힌 라벨들은 흐리게 남아 손잡이 노릇만 한다. */
    themeMode: boolean;
    /** 선 하나의 역할색(선택 하늘 · 호버 앰버 · 무리 색 · 기본 무채색)과 상자 여부. */
    visualOf: (key: string) => { selected: boolean; color: string };
    nameOf: (code: string) => string;
    /** 다시 클릭이 캔들 토글이 되는 상태인지 툴팁에 적기 위해. */
    isCandleOn: (code: string) => boolean;
    canToggleCandle: (line: OverlayLine) => boolean;
    onLabelClick: (line: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onLabelContext: (line: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onHover: (key: string | null) => void;
    onBadgeOpen: (at: { x: number; y: number }, members: string[]) => void;
    onBadgeHover: (members: readonly string[] | null) => void;
}

export function LabelLayer(p: LabelLayerProps): JSX.Element {
    const { clusters, pinnedKeys, byKey, scales, box, labelAnchorMode, themeMode, visualOf, nameOf } = p;

    /**
     * 라벨 칩 자리 — **점의 바깥쪽**(선이 뻗어 나가는 반대 방향)에 띄운다.
     * 예전엔 칩이 끝점에서 안쪽으로 깔려 **끝점 자체를 덮었다**: 선 위를 가려 그림을 읽기 나쁘고,
     * 무엇보다 그 점의 피벗 손잡이를 칩이 가로채 가장 바깥 점만 호버가 안 됐다(사용자 지적).
     *
     * 바깥에 칩 폭만큼 자리가 없으면(창 가장자리에 붙은 끝점) **안쪽으로 넘긴다** — 잘려서 못 읽는 것보단
     * 선 위에 얹히는 게 낫다. 넘겨도 간격은 그대로라 점 호버는 살아 있다.
     * 색 점은 언제나 칩에서 **점을 마주 보는 끝**에 둔다(dotFirst) — 어느 선의 이름인지 가리키는 게 그 점의 일이다.
     */
    const placement = (leftPx: number): { style: CSSProperties; dotFirst: boolean } => {
        const outwardLeft = p.labelAtStart;
        const room = outwardLeft ? leftPx - LABEL_GAP : box.width - leftPx - LABEL_GAP;
        const atLeft = room < LABEL_CELL.w ? !outwardLeft : outwardLeft;
        return atLeft
            ? { style: { left: leftPx - LABEL_GAP, transform: "translate(-100%, -50%)" }, dotFirst: false }
            : { style: { left: leftPx + LABEL_GAP, transform: "translateY(-50%)" }, dotFirst: true };
    };

    // 타점 단위 선은 시각까지 — `26.07.08 삼성전자 09:30`(같은 차트의 타점 여러 개가 선 여러 개로 선다).
    // 시각이 tertiary 면 같은 종목의 타점끼리 구분이 안 잡혔다(사용자 지적) — 타점의 정체가 시각이라 굵게 세운다.
    const labelOf = (s: OverlayLine, dotFirst: boolean): JSX.Element => {
        const dot = <span style={labelDot(visualOf(s.key).color)} />;
        const text = (
            <span>
                <span style={{ color: "var(--text-tertiary)" }}>{shortDate(s.date)}</span> {nameOf(s.stockCode)}
                {s.kind === "point" && <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}> {s.time.slice(0, 5)}</span>}
            </span>
        );
        return dotFirst ? <>{dot}{text}</> : <>{text}{dot}</>;
    };

    return (
        <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
            {/* 테마 모드에선 선이 숨은 라벨들 — **흐리게 남겨 손잡이 노릇만** 한다(사용자 확정).
                지우면 그 타점들이 화면에서 영영 사라져 이동·선택·사각선택이 다 죽는다. */}
            {clusters.map((c) => {
                const left = c.x - box.left;
                const top = c.y - box.top;
                const faded = themeMode ? { opacity: 0.45 } : null;
                if (c.members.length > 1) {
                    // 뱃지도 라벨과 같은 쪽(점의 바깥) — 손잡이의 자리 규칙은 하나여야 한다.
                    return (
                        <button key={`c${c.x}|${c.y}`} onClick={(e) => p.onBadgeOpen({ x: e.clientX, y: e.clientY }, c.members)}
                            onMouseEnter={() => p.onBadgeHover(c.members)} onMouseLeave={() => p.onBadgeHover(null)}
                            title={`${c.members.length}개 뭉침 — 올리면 무리가 ${themeMode ? "나타나고(테마는 잠시 접힌다)" : "켜지고"}, 누르면 목록`}
                            style={{ ...chip, ...placement(left).style, top, ...badgeChip, ...faded }}>
                            {c.members.length}
                        </button>
                    );
                }
                const s = byKey.get(c.members[0]);
                if (!s) return null;
                const pl = placement(left);
                return (
                    <button key={`c${c.x}|${c.y}`} onClick={(e) => p.onLabelClick(s, e)} onContextMenu={(e) => p.onLabelContext(s, e)}
                        onMouseEnter={() => p.onHover(s.key)} onMouseLeave={() => p.onHover(null)}
                        title={`${nameOf(s.stockCode)} ${s.date} — ${themeMode ? "올리면 이 골격선(테마는 잠시 접힌다) · " : ""}클릭=선택·이동 · Ctrl+클릭=다중선택 · 우클릭=그룹`}
                        style={{ ...chip, ...labelBg, ...pl.style, top, ...faded }}>
                        {labelOf(s, pl.dotFirst)}
                    </button>
                );
            })}
            {/* 선택·호버 라벨은 묶음 밖 — 언제나 그린다. ⚠ 호버 핸들러 필수: 라벨이 이 블록으로 옮겨
                그려질 때 원래 엘리먼트가 언마운트라 mouseleave 를 안 쏜다(없으면 호버가 영영 안 풀린다). */}
            {[...pinnedKeys].map((key) => {
                const s = byKey.get(key);
                if (!s) return null;
                const pt = labelPointOf(s, labelAnchorMode);
                const { selected, color } = visualOf(key);
                const pl = placement(scales.x(pt.x) - box.left);
                return (
                    <button key={key} onClick={(e) => p.onLabelClick(s, e)} onContextMenu={(e) => p.onLabelContext(s, e)}
                        onMouseEnter={() => p.onHover(s.key)} onMouseLeave={() => p.onHover(null)}
                        title={`${nameOf(s.stockCode)} ${s.date} — ${p.canToggleCandle(s)
                            ? `다시 클릭=${p.isCandleOn(s.stockCode) ? "캔들 끄기" : "캔들 켜기"} · `
                            : "클릭=선택·이동 · "}Ctrl+클릭=선택 해제 · 우클릭=그룹`}
                        style={{
                            ...chip, ...labelBg, ...pl.style, top: scales.y(pt.y) - box.top,
                            color, fontWeight: 700,
                            // 선택된 것에만 상자 — 상태를 가진 컨트롤이라 그렇게 보여야 한다(눈으로 찾기도 쉽다).
                            ...(selected ? selectedChip(color) : {}),
                        }}>
                        {labelOf(s, pl.dotFirst)}
                    </button>
                );
            })}
        </div>
    );
}
