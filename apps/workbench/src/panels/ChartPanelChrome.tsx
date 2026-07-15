// 차트 패널 크롬 — 차트 고유 조각(마커 묶음·영역 라벨·안내 문구).
// 헤더 컨트롤 공용 조각(TextToggle·Dot·Sep·ControlGroup·ControlBar)은 components/ControlChrome — 보드 헤더와 공유.

// 마커 묶음 — 마커 토글들을 연한 배경 한 덩어리로. "마커" 라벨은 그룹에 1회(칩마다 접두 반복 대신).
export function MarkerGroup({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, background: "var(--bg-tertiary)", borderRadius: 5, padding: "2px 7px" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>마커</span>
            {children}
        </span>
    );
}

export function PaneLabel({ text }: { text: string }): JSX.Element {
    return (
        <span style={{ position: "absolute", top: 4, left: 8, zIndex: 5, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", background: "var(--bg-primary)", padding: "0 4px", borderRadius: 4, pointerEvents: "none" }}>
            {text}
        </span>
    );
}

export function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, pointerEvents: "none" }}>
            {text}
        </div>
    );
}
