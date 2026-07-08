import type { CSSProperties, InputHTMLAttributes, Ref, ReactNode, TextareaHTMLAttributes } from "react";

// 공용 UI 프리미티브 — theme.css 토큰만 사용, radius/padding 값 한 벌로 통일.
// 지금까지 각 화면(AssignThemeModal·SettingsModal·Taskbar)이 인라인으로 각자 만들던
// 칩/입력/라벨을 여기로 모아 앱 전체 톤을 일치시킨다.

// ── 섹션 라벨(작은 제목) ────────────────────────────────────────────────
export function SectionLabel({ children, caps = false }: { children: ReactNode; caps?: boolean }): JSX.Element {
    return (
        <span
            style={{
                color: "var(--text-tertiary)",
                fontSize: 11,
                fontWeight: caps ? 700 : 600,
                textTransform: caps ? "uppercase" : undefined,
                letterSpacing: caps ? 0.4 : undefined,
            }}
        >
            {children}
        </span>
    );
}

// ── 칩(둥근 버튼) ──────────────────────────────────────────────────────
export type ChipVariant = "default" | "soft" | "accent" | "dashed";
const chipBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    padding: "3px 9px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    // font-family 는 전역 `button { font: inherit }` 로 상속(Pretendard) — 여기서 font:inherit 를 다시 주면 fontSize 를 덮어써 버린다.
};
const chipVariants: Record<ChipVariant, CSSProperties> = {
    default: { color: "var(--text-secondary)", border: "1px solid var(--border-default)", background: "var(--bg-primary)" },
    soft: { color: "var(--text-secondary)", border: "1px solid var(--border-default)", background: "var(--bg-tertiary)" },
    accent: { color: "var(--accent-primary)", border: "1px dashed var(--accent-primary)", background: "var(--accent-soft)" },
    dashed: { color: "var(--text-secondary)", border: "1px dashed var(--border-default)", background: "none" },
};
export function Chip({
    variant = "default",
    disabled,
    onClick,
    title,
    children,
    style,
}: {
    variant?: ChipVariant;
    disabled?: boolean;
    onClick?: () => void;
    title?: string;
    children: ReactNode;
    style?: CSSProperties;
}): JSX.Element {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            style={{ ...chipBase, ...chipVariants[variant], opacity: disabled ? 0.5 : 1, ...style }}
        >
            {children}
        </button>
    );
}

// ── 입력 ───────────────────────────────────────────────────────────────
const inputBase: CSSProperties = {
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "4px 8px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
    fontSize: 13,
};
export function TextInput({ style, inputRef, ...rest }: InputHTMLAttributes<HTMLInputElement> & { inputRef?: Ref<HTMLInputElement> }): JSX.Element {
    return <input type="text" ref={inputRef} {...rest} style={{ ...inputBase, ...style }} />;
}
// 숫자 입력 — 폭이 좁고 padding 이 작은 컴팩트 변형(설정 필터·프리셋용).
export function NumberField({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
    return <input type="number" {...rest} style={{ ...inputBase, width: 60, padding: "1px 6px", ...style }} />;
}
export function TextArea({ style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
    return <textarea {...rest} style={{ ...inputBase, resize: "vertical", lineHeight: 1.4, ...style }} />;
}

// ── 체크박스 / 라디오 — accentColor 만 붙인 얇은 래퍼(반복 제거) ─────────
export function Checkbox({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
    return <input type="checkbox" {...rest} style={{ accentColor: "var(--accent-primary)", ...style }} />;
}
export function Radio({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
    return <input type="radio" {...rest} style={{ accentColor: "var(--accent-primary)", ...style }} />;
}

// ── 라벨 행 — flex 정렬된 label(설정의 반복 패턴). ─────────────────────
export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: CSSProperties }): JSX.Element {
    return <label style={{ display: "flex", alignItems: "center", gap, ...style }}>{children}</label>;
}

// ── 키 힌트 ─────────────────────────────────────────────────────────────
export function Kbd({ children }: { children: ReactNode }): JSX.Element {
    return (
        <kbd
            style={{
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                padding: "1px 6px",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                font: "12px ui-monospace, monospace",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </kbd>
    );
}

// ── 헤더 톱니(설정) 버튼 — 기존 Modal.tsx 에서 이전. ─────────────────────
export function GearButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <button onClick={onClick} title="설정" style={{ background: "none", color: "var(--text-tertiary)", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>
            ⚙
        </button>
    );
}
