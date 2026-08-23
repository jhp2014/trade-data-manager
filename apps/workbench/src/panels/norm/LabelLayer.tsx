// 선 라벨 층 — 이 패널의 **유일한 손잡이**.
//
// 선은 순수 그림이고(포인터를 안 받는다) 조작은 전부 여기로 들어온다. 뭉친 곳에서 선 호버는 원래
// 신뢰할 수 없다(브라우저는 맨 위에 그려진 걸 주지 겨냥한 걸 주지 않는다). 라벨은 앵커 반대쪽 끝,
// 즉 선들이 **가장 벌어진 자리**에 붙으므로 손잡이로 더 낫다 — 나중에 선을 캔버스로 옮겨도 조작이
// 하나도 안 바뀌는 이유다.
//
// HTML 이다(SVG 가 아니라): 칩 폭 계산이 공짜이고, d3 가 SVG mousedown 을 삼키는 문제를 피한다.
// 그림 상자 **위에** 얹히는 층이라 SVG 그리는 순서와 무관하다.
//
// ## 손잡이는 **한 목록**이다 — 짚어도 정체가 안 바뀐다(겪은 버그, `labelHandles` 주석 참고)
// 예전엔 묶음 라벨과 짚은/선택된 라벨을 **다른 배열 두 벌**로 그렸다. 그래서 라벨에 손을 올리는 순간
// 그 라벨이 배열을 갈아타며 DOM 노드가 부서지고 다시 만들어졌고, 언마운트된 노드는 mouseleave 를 안 쏘니
// 손을 치워도 호버가 남았다(간헐적). 지금은 목록이 하나고 자리는 `labelHandles` 가 고정한다 —
// 짚었는지는 `pinned` 플래그(=스타일·툴팁)로만 말하므로 노드가 살아남고 leave 가 정상으로 온다.
import type { CSSProperties } from "react";
import { shortDate } from "../../lib/date.js";
import type { LabelHandle, OverlayLine } from "./overlay.js";
import { badgeChip, chip, labelBg, labelDot, selectedChip } from "./chips.js";

/** 라벨 칩 한 칸의 크기(화면 px) — 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
export const LABEL_CELL = { w: 72, h: 14 };
/** 라벨 칩과 끝점 사이 간격 — 배경 패딩(3px)을 더해도 피벗 손잡이(r=7) 밖에 서야 점 호버를 안 가로챈다. */
const LABEL_GAP = 12;

interface Box { left: number; top: number; width: number; height: number }

export interface LabelLayerProps {
    /** 그릴 손잡이 한 벌 — 자리(화면 좌표)와 정체(id)를 `labelHandles` 가 이미 정했다. */
    handles: readonly LabelHandle[];
    byKey: ReadonlyMap<string, OverlayLine>;
    box: Box;
    /** 테마가 펼쳐진 상태 — 선이 접힌 라벨들은 흐리게 남아 손잡이 노릇만 한다. */
    themeMode: boolean;
    /** 선 하나의 역할색(선택 하늘 · 호버 앰버 · 무리 색 · 기본 무채색)과 상자 여부. */
    visualOf: (key: string) => { selected: boolean; color: string };
    nameOf: (code: string) => string;
    /** 고정돼 있나 — 우클릭 툴팁 문구(고정/해제)가 갈린다. */
    isPinnedItem: (line: OverlayLine) => boolean;
    onLabelClick: (line: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onLabelContext: (line: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onHover: (key: string | null) => void;
    onBadgeOpen: (at: { x: number; y: number }, members: string[]) => void;
    /**
     * 짚은 뱃지의 **id**(멤버 목록이 아니라) — 부르는 쪽이 지금 목록에서 되찾게 한다.
     * 목록을 넘겨 주면 그 배열이 상태로 굳어, 뱃지가 사라진 뒤에도 옛 무리가 살아남는다(겪은 버그).
     */
    onBadgeHover: (badgeId: string | null) => void;
}

export function LabelLayer(p: LabelLayerProps): JSX.Element {
    const { handles, byKey, box, themeMode, visualOf, nameOf } = p;
    // 라벨은 선의 **최신 쪽**(오른쪽)에 선다 — 앵커가 "화면에서 잘리는 자리"라 대개 오른쪽 끝이다.
    const labelAtStart = false;

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
        const outwardLeft = labelAtStart;
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

    /**
     * 툴팁 — 라벨의 **지금 상태**가 정한다. 예전엔 묶음/짚은 것 두 갈래로 나눠 적었는데, 갈래가 어느 배열에
     * 그려지느냐를 따라가서 그냥 스친 라벨이 "Ctrl+클릭=선택 해제"라고 말했다(선택된 적이 없는데도).
     * 상태 하나로 적으면 그런 어긋남이 안 생긴다.
     */
    const titleOf = (s: OverlayLine, pinned: boolean): string => {
        // 테마 모드에서 선이 접힌 라벨만 "올리면 이 선" — 짚은 라벨은 이미 선이 나와 있다.
        const theme = themeMode && !pinned ? "올리면 이 선(테마는 잠시 접힌다) · " : "";
        const pin = p.isPinnedItem(s) ? "우클릭=고정 해제" : "우클릭=고정(시선이 바뀌어도 남는다)";
        return `${nameOf(s.stockCode)} ${s.date} — ${theme}클릭=시선 이동 · ${pin}`;
    };

    return (
        // ⚠ 층 전체를 떠나면 호버를 푼다 — 칩 하나하나의 leave 가 어떤 이유로든 빠져도 여기서 받아 낸다.
        //   포인터를 안 받는 컨테이너지만(pointerEvents: none) React 의 leave 는 자식에서 바깥으로 나가는
        //   경로를 훑어 조상에도 준다. 라벨끼리 옮겨 다닐 땐 공통 조상이라 안 불린다(그게 맞다).
        //   **뱃지도 같이 푼다** — 예전엔 라벨만 풀어서, 뱃지 호버가 남으면 층을 떠나도 무리 색이 안 꺼졌다.
        <div onMouseLeave={() => { p.onHover(null); p.onBadgeHover(null); }}
            style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
            {handles.map((h) => {
                const left = h.x - box.left;
                const top = h.y - box.top;
                const pl = placement(left);
                // 테마 모드에선 선이 숨은 라벨들 — **흐리게 남겨 손잡이 노릇만** 한다(사용자 확정).
                // 지우면 그 타점들이 화면에서 영영 사라져 이동·선택·사각선택이 다 죽는다.
                const faded = themeMode ? { opacity: 0.45 } : null;
                if (h.kind === "badge") {
                    // 뱃지도 라벨과 같은 쪽(점의 바깥) — 손잡이의 자리 규칙은 하나여야 한다.
                    return (
                        <button key={h.id} onClick={(e) => p.onBadgeOpen({ x: e.clientX, y: e.clientY }, h.members)}
                            onMouseEnter={() => p.onBadgeHover(h.id)} onMouseLeave={() => p.onBadgeHover(null)}
                            title={`${h.members.length}개 뭉침 — 올리면 무리가 ${themeMode ? "나타나고(테마는 잠시 접힌다)" : "켜지고"}, 누르면 목록`}
                            style={{ ...chip, ...pl.style, top, ...badgeChip, zIndex: 1, ...faded }}>
                            {h.members.length}
                        </button>
                    );
                }
                const s = byKey.get(h.key);
                if (!s) return null;
                const { selected, color } = visualOf(h.key);
                return (
                    <button key={h.id} onClick={(e) => p.onLabelClick(s, e)} onContextMenu={(e) => p.onLabelContext(s, e)}
                        onMouseEnter={() => p.onHover(s.key)} onMouseLeave={() => p.onHover(null)}
                        title={titleOf(s, h.pinned)}
                        style={{
                            ...chip, ...labelBg, ...pl.style, top,
                            // 짚은/선택된 것만 역할색으로 또렷하게 — 나머지는 이름을 읽히는 게 전부다.
                            ...(h.pinned ? { color, fontWeight: 700 } : null),
                            // 선택된 것에만 상자 — 상태를 가진 컨트롤이라 그렇게 보여야 한다(눈으로 찾기도 쉽다).
                            ...(selected ? selectedChip(color) : null),
                            // 짚은 라벨이 위 — 예전엔 **뒤에 그려서** 위에 뒀는데, 그러면 짚는 순간 노드가
                            // 목록 안에서 자리를 옮긴다. 자리는 고정하고 층만 올린다.
                            zIndex: h.pinned ? 2 : 1,
                            ...(h.pinned ? null : faded),
                        }}>
                        {labelOf(s, pl.dotFirst)}
                    </button>
                );
            })}
        </div>
    );
}
