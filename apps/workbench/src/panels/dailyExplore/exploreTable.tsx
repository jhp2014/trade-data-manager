// 탐색판 표 부품 한 벌 — 일별 타점 [탐색]·라벨 타점 [탐색] 두 판이 같은 트리 모양(가는 선·가이드선·점 칸·범례)을 쓴다.
// 두 판의 **행 렌더(tbody)는 공유하지 않는다** — 탐색판은 시간순·종목순 두 모드, 라벨판은 날짜 3층이라
// 합치면 prop 이 폭증한다. 모양(칸·선·색 규칙)만 여기서 한 벌로 묶어 어긋나지 않게 한다.
import type { CSSProperties, ReactNode } from "react";
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

/** 종목순 시간 칸 — 왼쪽 가이드선(본 줄에 괘선이 없어 칸 높이 100% 가 줄줄이 이어진다). 포커스 = 선이 굵은 청록(색 하나 안 늘리고 "지금 여기"). */
export const treeTimeCell = (focus: boolean): CSSProperties => {
    const line = focus ? "var(--accent-primary)" : "var(--border-default)";
    return {
        color: focus ? "var(--text-primary)" : "var(--text-secondary)",
        backgroundImage: `linear-gradient(${line}, ${line})`, backgroundSize: `${focus ? 2 : 1}px 100%`,
        backgroundPosition: "12px 0", backgroundRepeat: "no-repeat",
    };
};

/**
 * 종목 머리줄의 테마 — 앞 THEME_SHOW 개만 글자로, 나머지는 +N(hover = 전부).
 * **색은 안 칠한다**: 이 판의 계열색(seriesColor)은 이미 번호 열 ①~⑩ 이 쓰고 있어, 테마까지 칠하면
 * "초록 = ① 인가 테마인가"가 섞인다(한 판에 색 어휘는 하나).
 */
export function ThemeChips({ themes }: { themes: readonly string[] }): JSX.Element | null {
    if (themes.length === 0) return null;
    const { shown, rest } = themeChipsOf(themes);
    return (
        <span title={themes.join(" · ")} style={{ display: "inline-flex", gap: 6, fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            {shown.map((t) => <span key={t}>{t}</span>)}
            {rest > 0 && <span style={{ color: "var(--text-tertiary)" }}>+{rest}</span>}
        </span>
    );
}

/** 왼쪽에 붙는 칸(가로 스크롤 중 시간·종목) — 배경은 호출부가 칠한다(행 강조색을 따라가야 해서). */
export const stickL = (left: number): CSSProperties => ({ position: "sticky", left, zIndex: 1 });
/** 번호 점 칸 — 좁게 고정(①~⑩ 10칸 ≈ 200px). */
export const dotCell: CSSProperties = { textAlign: "center", width: 20, minWidth: 20, padding: "2px 3px" };

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
