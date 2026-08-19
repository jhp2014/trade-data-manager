// 사이드바 줄 조각 — 집합 목록(SetListSidebar)과 집합 사이드바(SetSidebar)가 같은 목록-줄 문법을 쓴다.
// 한 벌인 이유: 두 화면 다 "집합의 줄"이라, 색·활성 강조·깨짐 표기가 갈리면 사용자는 딴 물건으로 읽는다.
// 폭·여백처럼 화면마다 정당하게 다른 것은 prop 으로 남긴다(암묵 통일 금지 — 다른 건 다르게 보이게).
import type { ReactNode } from "react";
import { ACTIVE, FAIL } from "../../styles/palette.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { cellMeta } from "./cells.js";

/**
 * 목록 줄의 공통 골격 — 활성이면 강조색+굵기, 깨졌으면 경고색(활성보다 우선: 깨진 걸 골라 뒀다는 뜻이라).
 * `grow` 는 줄이 형제(행동 버튼)와 한 행을 나눠 쓸 때(저장 집합 줄) — 아니면 행 전체를 차지한다.
 */
export function SidebarRow({ active = false, broken = false, bordered = false, grow = false, padding = "3px 10px", activeBg = "var(--bg-tertiary)", title, onClick, children }: {
    active?: boolean;
    broken?: boolean;
    /** 줄 아래 구분선 — 목록(집합 목록)은 긋고, 접이식 피커(사이드바)는 안 긋는다. */
    bordered?: boolean;
    grow?: boolean;
    padding?: string;
    activeBg?: string;
    title?: string;
    onClick: () => void;
    children: ReactNode;
}): JSX.Element {
    return (
        <button onClick={onClick} title={title} style={{
            ...(grow ? { flex: 1, minWidth: 0 } : { width: "100%" }),
            display: "flex", alignItems: "center", gap: 6, textAlign: "left",
            border: "none", borderBottom: bordered ? "1px solid var(--border-subtle)" : "none",
            background: active ? activeBg : "transparent", cursor: "pointer",
            padding, font: "inherit", fontSize: 11.5,
            color: broken ? FAIL : active ? ACTIVE : "var(--text-primary)", fontWeight: active ? 600 : 400,
        }}>
            {children}
        </button>
    );
}

/** 줄 옆의 작은 행동 버튼(열기·삭제) — 줄 자체(선택)와 손이 갈리는 자리라 따로 선다. */
export function RowAction({ onClick, title, color, children }: {
    onClick: () => void; title: string; color?: string; children: ReactNode;
}): JSX.Element {
    return (
        <button onClick={onClick} title={title}
            style={{
                flexShrink: 0, border: "none", background: "transparent", cursor: "pointer",
                font: "inherit", fontSize: 10, padding: "2px 3px", color: color ?? "var(--text-tertiary)",
            }}>
            {children}
        </button>
    );
}

/** 목록 안의 구획 머리("저장 집합" 등). 위 여백만 화면마다 다르다(피커는 촘촘, 목록은 성글게). */
export const Head = ({ padding = "5px 10px 2px", children }: { padding?: string; children: ReactNode }): JSX.Element => (
    <div style={{ padding, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>{children}</div>
);

/** 줄 오른쪽 끝의 보조 설명 — 이름과 시각적으로 갈라져야 이름이 읽힌다. */
export const Hint = ({ children }: { children: ReactNode }): JSX.Element => (
    <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>{children}</span>
);

/** 목록이 비었거나 상태를 말로 해야 할 때의 문단. */
export const Note = ({ padding = "8px 10px", lineHeight = 1.5, children }: { padding?: string; lineHeight?: number; children: ReactNode }): JSX.Element => (
    <div style={{ padding, color: "var(--text-tertiary)", lineHeight }}>{children}</div>
);

/** 부위 배지 — 같은 조건에서 나온 형제(생존/칸)를 목록에서 구분하는 유일한 표식. */
export function partBadge(set: SavedSet): { text: string; title: string } {
    if (set.part.kind === "survivors") return { text: "생존자", title: "전 필터 통과" };
    const cells = set.part.cells.map((c) => cellMeta(c).label).join("+");
    return { text: cells, title: `저장 당시 짚은 칸: ${cells}` };
}

/** 부위의 압축 표기 — 좁은 피커 줄용. 칸 나열(partBadge)은 이름을 밀어내서 종류만 말한다. */
export const partHint = (set: SavedSet): string => (set.part.kind === "survivors" ? "생존자" : "칸");
