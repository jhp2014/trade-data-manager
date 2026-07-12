// 차트 패널 크롬 — 우상단 경량 컨트롤(보드 헤더 계열: 테두리·채움 없음)·아이콘·영역 라벨·안내 문구.
// ChartPanel 본문(데이터 조율)에서 분리한 순수 표현 컴포넌트.

// 경량 텍스트 토글 — 보드 컨트롤(BoardModeControls) 과 같은 계열. 테두리·채움 없이 활성 = 볼드 + 색.
// 상호배타 선택은 기본색(text-primary), on/off 토글은 activeColor 로 accent 를 넘긴다.
export function TextToggle({
    active,
    disabled = false,
    onClick,
    title,
    activeColor = "var(--text-primary)",
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    activeColor?: string;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                border: "none",
                background: "none",
                padding: "0 3px",
                cursor: disabled ? "default" : "pointer",
                font: "inherit",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                color: active ? activeColor : "var(--text-tertiary)",
                opacity: disabled ? 0.4 : 1,
            }}
        >
            {children}
        </button>
    );
}

// 경량 아이콘 토글 — 테두리·채움 없음. 활성 = accent, 기본 = tertiary. 액션(clear)은 disabled 지원.
export function IconToggle({
    active = false,
    disabled = false,
    onClick,
    title,
    children,
}: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "none",
                padding: "0 2px",
                cursor: disabled ? "default" : "pointer",
                color: active ? "var(--accent-primary)" : "var(--text-tertiary)",
                opacity: disabled ? 0.35 : 1,
                lineHeight: 0,
            }}
        >
            {children}
        </button>
    );
}

// 컨트롤 옵션 구분점(·) — 보드 헤더의 리스트·테마 구분과 동일.
export function Dot(): JSX.Element {
    return <span style={{ color: "var(--border-default)", fontSize: 11 }}>·</span>;
}

export function PaneLabel({ text }: { text: string }): JSX.Element {
    return (
        <span style={{ position: "absolute", top: 4, left: 8, zIndex: 5, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", background: "var(--bg-primary)", padding: "0 4px", borderRadius: 4, pointerEvents: "none" }}>
            {text}
        </span>
    );
}

// 거래대금 마커 표시/숨김 아이콘 — market-eye eye / eye-off.
export function EyeIcon({ off }: { off?: boolean }): JSX.Element {
    return off ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
    ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

// 현재 타점 정보 토글 아이콘 — info.
export function InfoIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

export function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, pointerEvents: "none" }}>
            {text}
        </div>
    );
}
