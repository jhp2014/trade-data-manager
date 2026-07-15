// 보드 카드 아이콘(market-eye SVG) + 공용 아이콘 버튼 스타일.

export function StarIcon({ filled }: { filled?: boolean }): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.6 14.3 8.3l6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3L2.5 9.2l6.3-.9z" />
        </svg>
    );
}

export function HideIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
    );
}

export const iconBtn: React.CSSProperties = { display: "inline-flex", padding: "2px", background: "none", color: "var(--text-tertiary)", lineHeight: 0, cursor: "pointer" };
