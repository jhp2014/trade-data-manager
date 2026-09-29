// 탐색판 표 부품 한 벌 — 일별 타점 [탐색]·라벨 타점 [탐색] 두 판이 같은 트리 모양(가는 선·가이드선·점 칸·범례)을 쓴다.
// 두 판의 **행 렌더(tbody)는 공유하지 않는다** — 탐색판은 시간순·종목순 두 모드, 라벨판은 날짜 3층이라
// 합치면 prop 이 폭증한다. 모양(칸·선·색 규칙)만 여기서 한 벌로 묶어 어긋나지 않게 한다.
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { themeChipsOf } from "./exploreRows.js";

export const TIME_W = 44;
/** 종목순 들여쓰기 — 가이드선(x=12) 오른쪽으로 시간이 선다. */
export const TREE_INDENT = 18;
export const NAME_W = 110;

/** 머리줄(있으면)과 본 줄을 한 키 아래 묶는 조각 — tbody 직계는 tr 이어야 해서 Fragment 로 잇는다. */
export const FragmentRow = ({ head, children }: { head: ReactNode; children: ReactNode }): JSX.Element => (
    <>
        {head}
        {children}
    </>
);

/** 종목 머리줄 칸 — 세로 가운데 1px 가로선(묶음 경계). content-box 기준이라 위 여백(paddingTop)이 선 높이를 안 민다. */
export const headLineCell: CSSProperties = {
    padding: 0, backgroundColor: "var(--bg-primary)",
    backgroundImage: "linear-gradient(var(--border-default), var(--border-default))",
    backgroundSize: "100% 1px", backgroundPosition: "0 50%", backgroundRepeat: "no-repeat", backgroundOrigin: "content-box",
};

/** 종목순 시간 칸 — 왼쪽 가이드선(본 줄에 괘선이 없어 칸 높이 100% 가 줄줄이 이어진다). 커서 = 선이 굵은 청록(색 하나 안 늘리고 "지금 여기" — 시선이 떠나도 책갈피로 선은 남는다). */
export const treeTimeCell = (focus: boolean): CSSProperties => {
    const line = focus ? "var(--accent-primary)" : "var(--border-default)";
    return {
        color: focus ? "var(--text-primary)" : "var(--text-secondary)",
        backgroundImage: `linear-gradient(${line}, ${line})`, backgroundSize: `${focus ? 2 : 1}px 100%`,
        backgroundPosition: "12px 0", backgroundRepeat: "no-repeat",
    };
};

/** 평탄한 표(시간순)의 커서 칸 — 트리의 가이드선(treeTimeCell)이 없어 왼쪽 막대로 같은 말을 한다. */
export const flatCursorMark: CSSProperties = { boxShadow: "inset 2px 0 0 var(--accent-primary)" };

/**
 * 종목 머리줄의 테마 — 앞 THEME_SHOW 개만 글자로, 나머지는 +N(hover = 전부). 이름줄 폭이 모자라면 **끝에서 …**
 * (이 칸이 줄어드는 몫이다 — 이름·꼬리 아이콘은 안 줄어든다).
 * **색은 안 칠한다**: 이 판의 계열색(seriesColor)은 이미 번호 열 ①~⑩ 이 쓰고 있어, 테마까지 칠하면
 * "초록 = ① 인가 테마인가"가 섞인다(한 판에 색 어휘는 하나).
 */
export function ThemeChips({ themes }: { themes: readonly string[] }): JSX.Element | null {
    if (themes.length === 0) return null;
    const { shown, rest } = themeChipsOf(themes);
    return (
        <span title={themes.join(" · ")} style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            {shown.map((t, i) => <span key={t} style={i > 0 ? { marginLeft: 6 } : undefined}>{t}</span>)}
            {rest > 0 && <span style={{ marginLeft: 6, color: "var(--text-tertiary)" }}>+{rest}</span>}
        </span>
    );
}

/**
 * 스크롤 상자 — 안쪽 한 겹이 **컨테이너 질의 기준**(`containerType: inline-size`)이라 이름줄이 `100cqw`(보이는 폭)를 쓸 수 있다.
 * 이름줄이 제 글자 폭으로 표의 최소 폭을 정하면, 판이 좁을 때 표가 넓어져 번호 열이 판 밖으로 밀린다
 * (시간 줄 옆은 비어 있는데도 — 2026-09-28 사용자 지적). 그래서 이름줄은 보이는 폭에 맞춰 서고 넘치면 자른다.
 * ⚠ 기준은 **스크롤 상자 자신이 아니라 안쪽 블록**이다 — 스크롤 상자에 걸면 cqw 가 세로 스크롤바 폭까지 먹어
 *   (실측 641 vs 649) 표가 스크롤바만큼 넓어져 가로 스크롤이 새로 생긴다. 안쪽 블록은 스크롤바 안쪽 폭 그대로다.
 */
export function ScrollBox({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div data-scroll-box="" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <div style={{ containerType: "inline-size" }}>{children}</div>
        </div>
    );
}

interface Span { top: number; bottom: number }

/**
 * 따라가기에 필요한 세로 이동량 — `want`(커서 줄 + 문맥)가 `view` 안에 들게. 문맥까지는 안 들어가는 좁은 판이면
 * **커서 줄만**이라도 들게 한다(문맥 때문에 커서가 밀려나면 본말전도). 둘 다 넘치면 위를 맞춘다.
 */
export function revealDelta(view: Span, want: Span, row: Span): number {
    const t = want.bottom - want.top > view.bottom - view.top ? row : want;
    if (t.top < view.top) return t.top - view.top;
    if (t.bottom > view.bottom) return t.bottom - view.bottom;
    return 0;
}

const isHead = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.dataset.head !== undefined;

/**
 * 커서 줄 따라가기 — `scrollIntoView({block:"nearest"})` 의 후임(2026-09-28).
 * ⚠ nearest 는 줄을 스크롤 상자의 **맨 위 가장자리**에 맞추는데, 거기엔 붙는 머리(thead, sticky top:0)가 떠 있어
 * w 로 위로 걸으면 커서 줄이 **정확히 머리 밑으로** 들어갔다(s 는 아래 가장자리라 멀쩡 — 사용자 지적).
 * 그래서 머리 높이를 재서 빼고, 커서 **앞뒤 한 줄씩** 여유를 둔다(편집기의 scrolloff). 앞 줄이 머리줄(`data-head`)이면
 * 이어진 머리줄을 다 데려온다 — 종목·날짜의 첫 타점에 올라왔을 때 "어느 종목·어느 날"이 같이 보이게.
 * 가로 스크롤은 건드리지 않는다(줄은 표 폭 전체라 가로로 맞출 게 없다).
 */
export function revealRow(row: HTMLElement | null): void {
    const box = row?.closest<HTMLElement>("[data-scroll-box]") ?? null;
    if (row === null || box === null) return;
    let first: Element = row;
    let p = row.previousElementSibling;
    if (p !== null) {
        first = p;
        while (isHead(p) && isHead(p.previousElementSibling)) { p = p.previousElementSibling; first = p; }
    }
    const last = row.nextElementSibling ?? row;
    const b = box.getBoundingClientRect();
    const headH = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = b.top + box.clientTop;
    const r = row.getBoundingClientRect();
    const d = revealDelta(
        { top: top + headH, bottom: top + box.clientHeight },
        { top: first.getBoundingClientRect().top, bottom: last.getBoundingClientRect().bottom },
        { top: r.top, bottom: r.bottom },
    );
    if (d !== 0) box.scrollTop += d;
}

/**
 * 종목 머리줄 안의 덩어리 — 바깥은 보이는 폭(100cqw)에 붙어 서서 표 폭을 안 먹고 가로 스크롤 중에도 왼쪽에 붙는다.
 * 바탕은 **글자 덩어리(안쪽)에만** 칠한다 — 바깥까지 칠하면 칸 뒤의 가는 가로선(묶음 경계, headLineCell)을 통째로 덮는다.
 * 이름·꼬리는 안 줄고 테마(ThemeChips)만 줄어 끝에서 자른다. 우클릭은 **줄 전체 폭**(바깥)이 받는다 — 글자 덩어리만 받으면 빈 곳 우클릭이 헛돈다.
 */
export function HeadLine({ children, onContextMenu, innerStyle }: {
    children: ReactNode;
    onContextMenu?: (ev: MouseEvent<HTMLDivElement>) => void;
    innerStyle?: CSSProperties;
}): JSX.Element {
    return (
        <div onContextMenu={onContextMenu} style={{ position: "sticky", left: 0, zIndex: 1, display: "flex", width: "100cqw", boxSizing: "border-box", whiteSpace: "nowrap" }}>
            <div
                style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "2px 8px", minWidth: 0, overflow: "hidden", background: "var(--bg-primary)", ...innerStyle }}>
                {children}
            </div>
        </div>
    );
}

/** 왼쪽에 붙는 칸(가로 스크롤 중 시간·종목) — 배경은 호출부가 칠한다(행 강조색을 따라가야 해서). */
export const stickL = (left: number): CSSProperties => ({ position: "sticky", left, zIndex: 1 });
/** 번호 점 칸 — 좁게 고정(①~⑩ 10칸 ≈ 200px). 열마다 옅은 왼쪽 세로선 — 세로로 훑을 때 어느 열인지 안 놓치게. */
export const dotCell: CSSProperties = { textAlign: "center", width: 20, minWidth: 20, padding: "2px 3px", borderLeft: "0.5px solid var(--border-subtle)" };

export const thBase: CSSProperties = {
    // z: 머리 2 · 머리의 붙는 칸 3 — 본문의 붙는 칸(시간·종목 머리줄, 1)이 세로 스크롤로 머리 밑을 지날 때 덮이게.
    position: "sticky", top: 0, zIndex: 2, background: "var(--bg-primary)", fontSize: 10, fontWeight: 400,
    color: "var(--text-tertiary)", textAlign: "left", padding: "3px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap",
};
export const Th = ({ children, style }: { children?: ReactNode; style?: CSSProperties }): JSX.Element =>
    <th style={{ ...thBase, ...style }}>{children}</th>;
export const Td = ({ children, style }: { children?: ReactNode; style?: CSSProperties }): JSX.Element =>
    <td style={{ padding: "2px 8px", borderBottom: "0.5px solid var(--border-subtle)", ...style }}>{children}</td>;
export const navBtn: CSSProperties = {
    border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-primary)", fontSize: 11, padding: "0 2px",
};

/** 범례 한 칸 — 번호 열의 이름표. */
export interface LegendCol {
    key: string;
    num: string;
    name: string;
    color: string;
    /** 좁히기 가능(모르는 열 — 계산 중·못 믿음 — 은 안 된다). */
    clickable: boolean;
    /** 흐리게(못 믿는 열) — 색 대신 회색. */
    dim?: boolean;
    /** 이름 뒤 흐린 꼬리(" …" 계산 중 · 개수) — 펼쳤을 때만. */
    suffix?: string;
    title: string;
}

/** 범례 줄 — 번호 열의 이름표. 클릭 = 열 머리와 같은 좁히기. 접으면 번호만 한 줄. */
export function GroupLegend({ cols, open, onToggleOpen, narrowKey, onNarrow, empty }: {
    cols: readonly LegendCol[];
    open: boolean;
    onToggleOpen: () => void;
    narrowKey: string | null;
    onNarrow: (key: string) => void;
    /** 열이 0개일 때의 안내. */
    empty: string;
}): JSX.Element {
    return (
        <div style={{ display: "flex", flexWrap: open ? "wrap" : "nowrap", alignItems: "baseline", gap: "1px 9px", padding: "3px 8px", borderBottom: "0.5px solid var(--border-subtle)", fontSize: 11, overflow: "hidden" }}>
            {cols.length === 0 ? (
                <span style={{ color: "var(--text-tertiary)" }}>{empty}</span>
            ) : (
                <>
                    <button onClick={onToggleOpen} title={open ? "범례 접기" : "범례 펴기"}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 10, padding: 0 }}>
                        {open ? "▾" : "▸"}
                    </button>
                    {cols.map((c) => (
                        <button key={c.key} onClick={() => { if (c.clickable) onNarrow(c.key); }} title={c.title}
                            style={{
                                border: "none", background: "transparent", padding: 0, font: "inherit", whiteSpace: "nowrap",
                                cursor: c.clickable ? "pointer" : "default",
                                color: c.dim ? "var(--text-tertiary)" : c.color,
                                textDecoration: narrowKey === c.key ? "underline" : "none", textUnderlineOffset: 3,
                            }}>
                            {open ? `${c.num} ${c.name}` : c.num}
                            {open && c.suffix !== undefined && <span style={{ color: "var(--text-tertiary)" }}>{c.suffix}</span>}
                        </button>
                    ))}
                </>
            )}
        </div>
    );
}
