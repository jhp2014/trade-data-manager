// 판 안 메뉴 줄 한 벌 — 항목(MenuItem)·구역 제목(MenuHead)·가름줄(MenuSep).
// 예전엔 세 벌(Dialog MenuItem 12.5px · ExprRow Item 12px · 조건판 menuItem 11.5px)과 판마다 인라인 줄이
// 따로 있어 같은 "메뉴 한 줄"이 판마다 달라 보였고, 좋은 기능(체크 칸·두 번 눌러 실행·못 누르는 이유·
// 설명 줄)이 한 벌에만 갇혀 있었다. 모양(2026-09-28 사용자 확정 — 「안쪽 둥근 강조」):
//   · 11.5px · 줄은 판 가장자리에서 4px 들어간 둥근 면 · 테두리 없음
//   · 마우스 올림 = 회색 면, 고른 것(selected) = 옅은 청록 면 — 배경은 CSS(.menu-item, theme.css)가 칠한다
//     (인라인 배경은 :hover 를 이긴다).
//   · 상태 표식은 **왼쪽 고정 칸** — 체크(✓, 여럿 켜고 끄기)·라디오(●○, 하나 고르기). 칸이 있어서 표식이
//     생겼다 사라져도 글자가 안 밀린다.
// 메뉴를 담는 판은 위아래 여백만 준다(MENU_PAD) — 좌우 여백은 줄이 자기 margin 으로 가진다.
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { FAIL } from "../../styles/palette.js";

/** 메뉴를 담는 판의 padding — 줄이 좌우 4px 를 제 margin 으로 가지므로 위아래만. */
export const MENU_PAD = "4px 0";

/**
 * 판의 한 줄 — **이름만 적는다.** 왜 그런지는 `title` 이 말하고, 상태는 낱말이 아니라 **표식**이 말한다
 * (`NOT` ↔ `NOT 떼기` 로 낱말을 오가면 같은 자리가 매번 달라 보인다). 설명을 판에 늘 적어야 하는 목록
 * (＋ 조건 팔레트)만 `hint` 로 이름 아래 한 줄을 단다.
 *
 * ⚠ **못 누르는 항목은 숨기지 않고 회색 + 이유**(`why`, 툴팁)로 세운다 — 결손 지도와 같은 규칙이다
 * (숨기면 "그런 기능이 없다"가 되어, 왜 안 되는지 알 길이 없다).
 */
export function MenuItem({
    onClick,
    children,
    hint,
    trailing,
    mark,
    on = false,
    selected = false,
    danger = false,
    armed = false,
    disabled = false,
    why,
    title,
    dim = false,
    role = "menuitem",
    autoFocus,
    style,
}: {
    /** 이벤트를 받는다 — 판을 연 좌표로 다음 판(편집기)을 띄우는 손이 있다(＋ 조건 → 편집기). */
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    children: ReactNode;
    /** 이름 아래 설명 한 줄(작은 회색) — 판에 늘 적어야 할 때만. 보통은 `title`. */
    hint?: ReactNode;
    /** 오른쪽 끝 꼬리표(쓰는 곳 🔗N·못 붙이는 사유 등) — 작은 회색, 이름이 줄어도 안 밀린다. */
    trailing?: ReactNode;
    /** 왼쪽 표식 칸 — check = 여럿 켜고 끄기(✓), radio = 하나 고르기(●○). 없으면 칸도 없다. */
    mark?: "check" | "radio";
    /** 표식이 켜졌나. */
    on?: boolean;
    /** 지금 고른 것 — 옅은 청록 면. */
    selected?: boolean;
    danger?: boolean;
    /** 한 번 눌러 무장했나 — 되돌릴 수 없는 손이 그때만 경고를 입는다. */
    armed?: boolean;
    disabled?: boolean;
    /** 못 누를 때의 이유 — 툴팁으로만 뜬다. */
    why?: string;
    /** 평소 툴팁. */
    title?: string;
    /** 누를 수 있지만 흐리게(자동 이름처럼 덜 중요한 항목). */
    dim?: boolean;
    role?: string;
    autoFocus?: boolean;
    /** 글자 모양 덧대기(굵기·색). 배경은 CSS 가 칠하므로 여기서 주지 않는다. */
    style?: CSSProperties;
}): JSX.Element {
    const color = disabled ? "var(--text-tertiary)"
        : armed || danger ? FAIL
        : selected ? "var(--accent-hover)"
        : dim ? "var(--text-tertiary)"
        : "var(--text-primary)";
    return (
        <button
            className="menu-item"
            role={role}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            autoFocus={autoFocus}
            title={disabled ? why : title}
            {...(selected ? { "data-selected": "" } : {})}
            {...(armed ? { "data-armed": "" } : {})}
            style={{
                display: "flex", alignItems: hint ? "flex-start" : "center", gap: 6,
                width: "calc(100% - 8px)", margin: "0 4px", padding: "4px 8px", borderRadius: 5,
                textAlign: "left", border: "none", font: "inherit", fontSize: 11.5, lineHeight: 1.45,
                cursor: disabled ? "default" : "pointer", color,
                ...(disabled ? { opacity: 0.7 } : {}),
                ...style,
            }}
        >
            {mark && (
                <span aria-hidden style={{ width: 10, flexShrink: 0, textAlign: "center", color: on ? "var(--accent-primary)" : "var(--border-strong)", fontSize: mark === "radio" ? 9 : 11 }}>
                    {mark === "check" ? (on ? "✓" : "") : on ? "●" : "○"}
                </span>
            )}
            {hint ? (
                <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block" }}>{children}</span>
                    <span style={{ display: "block", fontSize: 10, color: "var(--text-tertiary)", whiteSpace: "normal", lineHeight: 1.35 }}>{hint}</span>
                </span>
            ) : (
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
            )}
            {trailing != null && trailing !== false && (
                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, paddingLeft: 8, fontSize: 9.5, color: "var(--text-tertiary)" }}>{trailing}</span>
            )}
        </button>
    );
}

/** 구역 제목 — 무엇에 대한 메뉴인지·어느 무리인지. 첫 줄이 아니면 위에 가름줄을 붙인다(`sep`). */
export function MenuHead({ children, sep = false, title }: { children: ReactNode; sep?: boolean; title?: string }): JSX.Element {
    return (
        <div title={title} style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", padding: "5px 12px 2px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            ...(sep ? { borderTop: "1px solid var(--border-subtle)", marginTop: 4, paddingTop: 7 } : {}),
        }}>
            {children}
        </div>
    );
}

/** 항목 사이 가름줄 — 되돌릴 수 없는 손을 나머지와 떼어 놓는 자리. */
export const MenuSep = (): JSX.Element => <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 8px" }} />;
