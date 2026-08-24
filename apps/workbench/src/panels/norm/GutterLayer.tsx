// 오른쪽 이름 거터의 **그리기** — 칩(HTML)과 지시선(SVG). 자리는 gutter.ts 가 이미 정했다.
//
// 스트립은 두 칸이다: 그림에 붙은 **눈금 칸(AXIS_W)**, 그 바깥의 **이름 칸(GUTTER_W)**.
// 지시선은 이름 칸에서 그림 가장자리까지 눈금 칸을 가로지르므로 **눈금보다 먼저** 그린다
// (나중에 그리면 점선이 숫자 위에 얹혀 둘 다 못 읽는다 — 층 순서 테스트가 잡는다).
//
// ## 거터는 **분봉 전용**이다(사용자 확정)
// 일봉엔 여기 적을 값이 없다 — 최신값은 그림과 눈금이 말하고, 정체(날짜·종목)는 바닥의 원점 스택이
// 진다. 그래서 일봉에선 오른쪽 스트립이 눈금 칸만 남고 폭이 그림으로 돌아간다.
//
// ## 칩엔 **이름과 값만**(사용자 확정 — 시각은 뺐다)
// 같은 종목의 타점을 여럿 겹치면 이름이 같은 줄이 여러 개 서고 값으로 갈린다. 정체(날짜·시각)는
// 바닥 원점 스택과 툴팁이 진다 — 한 줄에 다 적으면 종목명이 잘려 정작 누구인지 안 읽혔다(사용자 지적).
//
// ## 내 항목과 테마는 **칩 모양으로 갈린다**(한 거터에 같이 살되 섞이지 않게)
//   · 내 항목 = 채운 점 · 또렷한 글자 · 값이 굵다. 고정이면 배경이 차고 왼쪽에 색 바, 시선이면 상자.
//   · 테마    = 빈 점(링) · 흐린 글자 · 한 단 들여쓴다. 배경 없이 후광만 — 주인공 뒤의 배경이라는 뜻.
// 색은 둘 다 그 선의 색이다(그림↔목록을 잇는 유일한 끈이라 여기서 색을 바꾸면 대응이 끊긴다).
import type { CSSProperties } from "react";
import { fmtPct } from "../../lib/format.js";
import { clamp, median } from "../../lib/num.js";
import { badgeChip, chip, labelBg, labelDot, pinnedChip, selectedChip } from "./chips.js";
import { AXIS_W, GUTTER_W, type GutterCandidate, type GutterLayout, type GutterRow, type HiddenRow } from "./gutter.js";

/** 넘침 뱃지의 대략 높이(px) — 클램프 여유분. */
const BADGE_H = 14;

interface Box { left: number; top: number; width: number; height: number }

/** 칩 한 줄이 손짓을 돌려주는 자리 — 종류에 따라 다른 일을 한다(항목=고정/이동, 테마=캔들). */
export interface GutterHandlers {
    onItemClick: (key: string, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onItemContext: (key: string, ev: { ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }) => void;
    onItemHover: (key: string | null) => void;
    onThemeClick: (code: string) => void;
    onThemeHover: (codes: readonly string[] | null) => void;
    /** 넘침 뱃지 — 눌러서 목록(무리 팝오버), 올리면 그 무리가 켜진다. */
    onItemBadge: (at: { x: number; y: number }, keys: string[]) => void;
    onItemBadgeHover: (keys: string[] | null) => void;
    onThemeBadge: (at: { x: number; y: number }, codes: string[]) => void;
}

/**
 * 거터 한 벌이 그리는 데 필요한 전부 — 패널이 조립해 통째로 내려보낸다(칩과 지시선이 **같은 값**을
 * 봐야 대응이 안 어긋난다). 상자(box)만 그림판이 준다.
 */
export interface GutterView {
    layout: GutterLayout;
    colorOf: (row: GutterCandidate) => string;
    /** 지금 또렷한 줄인가 — 칩과 지시선의 진하기가 같이 따라간다. */
    litOf: (row: GutterCandidate) => boolean;
    /** 그 항목이 시선인가(상자) / 고정인가(배경+왼쪽 바) — 두 상태는 직교라 표식도 둘이다. */
    stateOf: (key: string) => { selected: boolean; pinned: boolean };
    /** 그 테마 종목의 캔들이 켜져 있나 — 밑줄로 남는다. */
    isCandleOn: (code: string) => boolean;
    /** 지금 짚은 테마 종목들 — 또렷하게. */
    themeHovered: ReadonlySet<string> | null;
    /** 다른 선을 보는 중이면 테마 칩은 물러난다(선이 접혔는데 이름만 진하면 뭘 가리키는지 모른다). */
    themeSwapped: boolean;
    /** 절대값 복원 상수 — 툴팁에 전일比 %를 같이 적는다(칩엔 축과 같은 단위만). */
    absOf: (row: GutterCandidate) => number | null;
    handlers: GutterHandlers;
}

// ── 지시선(클립 밖 SVG) ─────────────────────────────────────────────────────

/**
 * 칩과 **선이 우단에서 잘리는 그 점**을 잇는다. 칩이 제 높이를 안 지키므로(세로로 벌려 세우니까)
 * 이 선이 유일한 대응 표시다. 끝점 x 는 상자 안으로 클램프 — 폴백일 때 화면 밖으로 안 뻗게.
 */
export function GutterLeaders({ view, box, scaleX }: {
    view: GutterView;
    box: Box;
    scaleX: (v: number) => number;
}): JSX.Element {
    const { layout, colorOf, litOf } = view;
    const chipX = box.left + box.width + AXIS_W;
    return (
        <g data-layer="gutter-leaders">
            {layout.rows.map((r) => {
                const tx = clamp(scaleX(r.cand.x), box.left, box.left + box.width);
                const color = colorOf(r.cand);
                return (
                    <g key={`gld-${r.cand.kind}-${r.cand.key}`} style={{ pointerEvents: "none" }}
                        opacity={litOf(r.cand) ? 0.9 : r.cand.kind === "item" ? 0.55 : 0.3}>
                        <line x1={chipX - 2} y1={r.labelY} x2={tx} y2={r.anchorY}
                            stroke={color} strokeWidth={0.8} strokeDasharray="2 2" />
                        {/* 잘리는 지점 표식 — 점선이 가리키는 곳이 눈에 딱 집히게. */}
                        <circle cx={tx} cy={r.anchorY} r={2.2} fill={color} />
                    </g>
                );
            })}
        </g>
    );
}

// ── 이름 칸(HTML) ───────────────────────────────────────────────────────────

/**
 * 그림 상자 **오른쪽 바깥**이라 컨테이너가 눈금 칸 뒤부터 끝까지를 덮는다.
 *
 * ⚠ 컨테이너는 포인터를 통과시킨다 — 이 스트립은 **y축 손짓의 자리**이기도 해서(세로 확대·더블클릭
 * 원위치) 여기가 이벤트를 먹으면 그 손짓이 죽는다. 칩만 `pointerEvents: auto` 로 받는다.
 */
export function Gutter({ view: p, box }: { view: GutterView; box: Box }): JSX.Element {
    const { layout, colorOf, stateOf, handlers: h } = p;
    const left = box.left + box.width + AXIS_W;
    return (
        <div data-layer="gutter"
            style={{ position: "absolute", left, top: box.top, width: GUTTER_W, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
            {layout.rows.map((r) => (r.cand.kind === "item"
                ? <ItemChip key={`gi-${r.cand.key}`} row={r} top={r.labelY - box.top} color={colorOf(r.cand)}
                    state={stateOf(r.cand.key)} lit={p.litOf(r.cand)} abs={p.absOf(r.cand)} handlers={h} />
                : <ThemeChip key={`gt-${r.cand.key}`} row={r} top={r.labelY - box.top} color={colorOf(r.cand)}
                    lit={p.themeHovered?.has(r.cand.key) ?? false} on={p.isCandleOn(r.cand.key)}
                    swapped={p.themeSwapped} abs={p.absOf(r.cand)} handlers={h} />))}

            {layout.hidden.item.length > 0 && (
                <OverflowBadge count={layout.hidden.item.length} top={badgeTop(layout.hidden.item, box)}
                    title={`이름을 못 단 항목 ${layout.hidden.item.length}개 — 올리면 그 선들이 켜지고, 누르면 목록`}
                    onOpen={(at) => h.onItemBadge(at, layout.hidden.item.map((r) => r.cand.key))}
                    onHover={(on) => h.onItemBadgeHover(on ? layout.hidden.item.map((r) => r.cand.key) : null)} />
            )}
            {layout.hidden.theme.length > 0 && (
                <OverflowBadge count={layout.hidden.theme.length} top={badgeTop(layout.hidden.theme, box)}
                    title={`이름을 못 단 테마 ${layout.hidden.theme.length}종목 — 올리면 그 선들이 켜지고, 누르면 목록`}
                    onOpen={(at) => h.onThemeBadge(at, layout.hidden.theme.map((r) => r.cand.key))}
                    onHover={(on) => h.onThemeHover(on ? layout.hidden.theme.map((r) => r.cand.key) : null)}
                    muted />
            )}
        </div>
    );
}

/**
 * 뱃지의 세로 자리 — 숨은 것들의 **중앙값**. 값이 상자 밖일 수 있어(전부 화면 밖으로 확대된 경우)
 * 클램프한다: 컨테이너가 overflow:hidden 이라 클램프 없이는 뱃지가 통째로 사라져 목록을 열 길이 없다.
 */
const badgeTop = (hidden: readonly HiddenRow[], box: Box): number =>
    clamp(median(hidden.map((r) => r.y)) - box.top, BADGE_H, box.height - BADGE_H);

function ItemChip({ row, top, color, state, lit, abs, handlers }: {
    row: GutterRow;
    top: number;
    color: string;
    state: { selected: boolean; pinned: boolean };
    /** 지금 또렷한 줄인가(시선·호버) — 글자가 굵어지고 그 선 색을 입는다. */
    lit: boolean;
    abs: number | null;
    handlers: GutterHandlers;
}): JSX.Element {
    const { cand } = row;
    const pin = state.pinned ? "클릭=고정 해제" : "클릭=고정(시선이 바뀌어도 남는다)";
    return (
        <button
            onClick={(e) => handlers.onItemClick(cand.key, e)}
            onContextMenu={(e) => handlers.onItemContext(cand.key, e)}
            onMouseEnter={() => handlers.onItemHover(cand.key)}
            onMouseLeave={() => handlers.onItemHover(null)}
            title={`${cand.name} ${cand.sub ?? ""} — ${fmtPct(cand.y)}${abs === null ? "" : ` (전일比 ${fmtPct(abs)})`} · ${pin} · Ctrl+클릭=시선 이동`}
            style={{
                ...chip, ...labelBg, ...rowBox, top,
                // 또렷한 줄만 역할색으로 — 나머지는 이름을 읽히는 게 전부다(옛 라벨 규칙 승계).
                ...(lit ? { color, fontWeight: 700 } : { color: "var(--text-primary)" }),
                // 시선(상자) 위에 고정(왼쪽 바)을 얹는다 — 순서를 뒤집으면 상자의 border 단축이
                // 왼쪽 바를 지운다(둘 다 걸린 줄에서 고정 표식이 조용히 사라진다).
                ...(state.selected ? selectedChip(color) : null),
                ...(state.pinned ? pinnedChip(color) : null),
                zIndex: state.selected || state.pinned ? 2 : 1,
            }}>
            <span style={labelDot(color)} />
            <span style={nameText}>{cand.name}</span>
            <span style={{ ...valueText, fontWeight: 700 }}>{row.off === "up" ? "▲" : row.off === "down" ? "▼" : ""}{fmtPct(cand.y)}</span>
        </button>
    );
}

function ThemeChip({ row, top, color, lit, on, swapped, abs, handlers }: {
    row: GutterRow;
    top: number;
    color: string;
    lit: boolean;
    on: boolean;
    swapped: boolean;
    abs: number | null;
    handlers: GutterHandlers;
}): JSX.Element {
    const { cand } = row;
    return (
        // 테마 칩 클릭 = 그 멤버 캔들 토글(선 클릭과 같은 손짓 — 이름은 선의 손잡이니까).
        <button
            onClick={() => handlers.onThemeClick(cand.key)}
            onMouseEnter={() => handlers.onThemeHover([cand.key])}
            onMouseLeave={() => handlers.onThemeHover(null)}
            title={`${cand.name} ${fmtPct(cand.y)}${abs === null ? "" : ` (전일比 ${fmtPct(abs)})`} — 올리면 그 선만 또렷해진다 · 클릭해 캔들 ${on ? "끄기" : "켜기"}`}
            style={{
                ...chip, ...rowBox, top,
                // 한 단 들여쓰기 — 주인공(내 항목)과 배경(테마)이 자리로도 갈린다.
                left: 10, width: GUTTER_W - 14,
                fontSize: 8.5,
                opacity: swapped ? 0.35 : 1,
                color: lit || on ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: lit || on ? 700 : 400,
                ...(on ? { textDecoration: "underline" } : null),
            }}>
            {/* 빈 점(링) — 채운 점은 내 항목의 것이다. */}
            <span style={{ ...labelDot("transparent"), border: `1px solid ${color}`, width: 5, height: 5, borderRadius: 3 }} />
            <span style={nameText}>{cand.name}</span>
            <span style={valueText}>{row.off === "up" ? "▲" : row.off === "down" ? "▼" : ""}{fmtPct(cand.y)}</span>
        </button>
    );
}

function OverflowBadge({ count, top, title, onOpen, onHover, muted }: {
    count: number;
    top: number;
    title: string;
    onOpen: (at: { x: number; y: number }) => void;
    onHover?: (on: boolean) => void;
    muted?: boolean;
}): JSX.Element {
    return (
        <button onClick={(e) => onOpen({ x: e.clientX, y: e.clientY })}
            onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
            title={title}
            style={{ ...chip, ...badgeChip, position: "absolute", left: muted ? 10 : 0, top, transform: "translateY(-50%)", zIndex: 3 }}>
            +{count}
        </button>
    );
}

/** 칩 한 줄의 상자 — 거터 폭을 채우고 세로 중앙을 제 자리에 맞춘다. */
const rowBox: CSSProperties = {
    left: 0, width: GUTTER_W - 4, transform: "translateY(-50%)",
    display: "flex", alignItems: "center", gap: 3, overflow: "hidden",
};
/** 이름 — 길면 잘린다(정체는 툴팁이 온전히 진다). */
const nameText: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
/** 값 — 오른쪽 끝에 붙는다(눈금과 같은 쪽에서 읽히게). */
const valueText: CSSProperties = { marginLeft: "auto", fontVariantNumeric: "tabular-nums", flexShrink: 0 };
