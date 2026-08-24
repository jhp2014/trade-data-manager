// 원점 스택 — **바닥에 서서 원점을 가리키는 칩 묶음**. 이 패널의 범례이자 원점 표식이다(사용자 확정).
//
// ## 왜 오른쪽 거터가 아니라 바닥인가
// 일봉은 거터에 적을 **값이 없다**(최신값은 그림과 눈금이 이미 말한다). 필요한 건 "이 색이 누구냐"뿐이라
// 세로 열에 값 순으로 줄 세울 이유가 없다. 대신 원점 아래 — **x축에 거의 붙은 자리**에 두면
// 그 높이엔 캔들이 올 일이 없어 그림을 하나도 안 가린다(사용자 실측).
//
// ## 점선이 세로선 대용이다
// 원점 봉의 **저가에서 살짝 떨어져** 시작해 스택까지 내려오는 세로 점선 한 줄. 옛 실선 세로축이
// 그림을 덮던 자리를 이게 대신한다: 봉을 안 가리면서 "여기가 원점"을 눈에 세운다.
// (그래서 하단 ▲ 와 축의 `전일`·`타점` 칩은 은퇴했다 — 스택이 정체를 **항목별로** 적으므로 더 정확하다.
//  여러 날을 겹치면 원점 날짜가 항목마다 다른데, 칩 하나짜리 축 표기로는 그걸 적을 수가 없었다.)
//
// ## 자리 규칙
//   · x = 원점. 칩은 그 **왼쪽으로 눕는다**(원점이 창 오른쪽 끝 가까이라 가운데 정렬이면 축을 침범한다).
//   · 팬으로 원점이 창을 벗어나면 가장자리로 **클램프**하고 ◀▶ 로 밖이라고 말한다 — 안 그러면 스택이
//     통째로 사라져 고정·이동 손잡이까지 같이 죽는다.
//   · 아래에서 위로 쌓되 **읽기는 위에서 아래**(등록 순: 시선 먼저, 그다음 고정 순 — 사용자 확정).
import type { CSSProperties } from "react";
import { badgeChip, chip, labelBg, labelDot, pinnedChip, selectedChip } from "./chips.js";

/** 칩 한 줄의 높이(px) — 글자 9px + 상하 여백. 스택 상한(ORIGIN_CAP)과 함께 차지할 높이를 정한다. */
const ROW_H = 15;
/** 원점 봉 저가와 점선 시작점 사이 간격(px) — "살짝 떨어져서"의 값. */
const LOW_GAP = 8;
/** 스택이 x축에서 띄우는 여백(px). */
const BOTTOM_PAD = 4;
/** 이름을 세울 상한(사용자 확정) — 넘치면 뱃지 하나로 접는다(누르면 목록). */
export const ORIGIN_CAP = 6;

interface Box { left: number; top: number; width: number; height: number }

/** 스택에 설 항목 하나 — 정체(한 줄)와 색·상태만 있으면 된다(값은 이 층의 관심사가 아니다). */
export interface OriginItem {
    key: string;
    /** 한 줄 표기 — 일봉 `26.07.08 삼성전자` / 분봉 `26.07.08 09:30 삼성전자`(사용자 확정). */
    text: string;
    color: string;
    selected: boolean;
    pinned: boolean;
    /** 지금 또렷한 줄인가(시선·호버) — 글자가 굵어지고 그 선 색을 입는다(거터 칩과 같은 규칙). */
    lit: boolean;
}

export interface OriginStackProps {
    items: readonly OriginItem[];
    /** 상한에 밀린 것들 — 뱃지 하나로 접힌다. */
    hidden: readonly OriginItem[];
    box: Box;
    /** 원점의 화면 x(클램프 전). */
    x0: number;
    /** 원점 봉의 **저가** 화면 y — 점선이 여기서 LOW_GAP 만큼 떨어져 시작한다. 캔들이 없으면 0선. */
    lowY: number;
    onClick: (key: string, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onContext: (key: string, ev: { ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }) => void;
    onHover: (key: string | null) => void;
    onBadge: (at: { x: number; y: number }, keys: string[]) => void;
    onBadgeHover: (keys: string[] | null) => void;
}

/**
 * 원점이 창 안인가, 밖이면 어느 쪽인가 — 칩의 ◀▶ 와 클램프가 이 값을 쓴다.
 * (export 인 이유: 스택이 사라지지 않는다는 계약을 테스트가 여기서 직접 잰다.)
 */
export const originOff = (x0: number, box: Box): "left" | "right" | null =>
    (x0 < box.left ? "left" : x0 > box.left + box.width ? "right" : null);

// ── 점선(클립 안 SVG) ───────────────────────────────────────────────────────

/**
 * 원점 세로 점선 — 봉 아래에서 스택까지. **그림 층 위**에 서지만 봉을 안 지나므로 가리는 게 없다.
 * 원점이 창 밖이면 안 그린다(클램프한 자리에 그으면 없는 곳을 가리키게 된다 — 칩의 ◀▶ 가 대신 말한다).
 */
export function OriginLeader({ items, box, x0, lowY }: Pick<OriginStackProps, "items" | "box" | "x0" | "lowY">): JSX.Element {
    if (items.length === 0 || originOff(x0, box) !== null) return <g data-layer="origin-leader" />;
    // 위 끝 = 원점 봉 저가에서 한 뼘 아래, 아래 끝 = 스택의 윗변. 화면 y 는 아래로 갈수록 크다.
    const from = Math.min(lowY + LOW_GAP, box.top + box.height - BOTTOM_PAD);
    const to = box.top + box.height - BOTTOM_PAD - items.length * ROW_H;
    return (
        <g data-layer="origin-leader">
            {/* 봉과 스택이 붙어 있으면(자리가 없으면) 안 그린다 — 억지로 그으면 봉을 파고든다. */}
            {to > from && (
                <line x1={x0} x2={x0} y1={from} y2={to}
                    stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            )}
        </g>
    );
}

// ── 칩 스택(HTML) ───────────────────────────────────────────────────────────

export function OriginStack(p: OriginStackProps): JSX.Element {
    const { items, box, x0 } = p;
    const off = originOff(x0, box);
    // 클램프 — 밖이면 가장자리에 세운다(칩이 ◀▶ 로 "진짜 원점은 저쪽"이라고 말한다).
    const x = off === "left" ? box.left : off === "right" ? box.left + box.width : x0;
    const rows: (OriginItem | null)[] = [...(p.hidden.length > 0 ? [null] : []), ...items]; // 뱃지가 맨 위
    return (
        <div data-layer="origin-stack"
            style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
            {rows.map((it, i) => {
                // 아래에서 위로 쌓되 읽기는 위에서 아래 — 마지막 줄이 바닥에 붙는다.
                const bottom = (rows.length - 1 - i) * ROW_H + BOTTOM_PAD;
                const style: CSSProperties = {
                    ...chip, position: "absolute",
                    left: x - box.left - 6, bottom, transform: "translateX(-100%)",
                    maxWidth: box.width - 12, overflow: "hidden", whiteSpace: "nowrap",
                };
                if (it === null) {
                    return (
                        <button key="origin-more" style={{ ...style, ...badgeChip }}
                            onClick={(e) => p.onBadge({ x: e.clientX, y: e.clientY }, p.hidden.map((h) => h.key))}
                            onMouseEnter={() => p.onBadgeHover(p.hidden.map((h) => h.key))}
                            onMouseLeave={() => p.onBadgeHover(null)}
                            title={`이름을 못 단 ${p.hidden.length}개 — 올리면 그 선들이 켜지고, 누르면 목록`}>
                            +{p.hidden.length}
                        </button>
                    );
                }
                return (
                    <button key={it.key}
                        onClick={(e) => p.onClick(it.key, e)}
                        onContextMenu={(e) => p.onContext(it.key, e)}
                        onMouseEnter={() => p.onHover(it.key)}
                        onMouseLeave={() => p.onHover(null)}
                        title={`${it.text} — ${it.pinned ? "클릭=고정 해제" : "클릭=고정(시선이 바뀌어도 남는다)"} · Ctrl+클릭=시선 이동`}
                        style={{
                            ...style, ...labelBg,
                            ...(it.lit ? { color: it.color, fontWeight: 700 } : null),
                            // 시선(상자) 위에 고정(왼쪽 바) — 순서를 뒤집으면 상자의 border 단축이 바를 지운다.
                            ...(it.selected ? selectedChip(it.color) : null),
                            ...(it.pinned ? pinnedChip(it.color) : null),
                        }}>
                        <span style={labelDot(it.color)} />
                        {/* 원점이 창 밖이면 어느 쪽인지 — 클램프된 자리가 거짓말을 하지 않게. */}
                        {off && <span style={{ color: "var(--text-tertiary)" }}>{off === "left" ? "◀" : "▶"}</span>}
                        <span>{it.text}</span>
                    </button>
                );
            })}
        </div>
    );
}
