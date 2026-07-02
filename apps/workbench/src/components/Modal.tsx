// 공용 모달 — 백드롭 클릭/✕ 로 닫힘. 앱 전체 위에 fixed 오버레이.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
    return (
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ background: "var(--bg-primary)", borderRadius: 10, minWidth: 300, maxWidth: 440, border: "1px solid var(--border-default)", boxShadow: "0 8px 30px rgba(0,0,0,0.25)", font: "13px system-ui, sans-serif" }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
                    <button onClick={onClose} title="닫기" style={{ background: "none", color: "var(--text-tertiary)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
                        ✕
                    </button>
                </div>
                <div style={{ padding: 14 }}>{children}</div>
            </div>
        </div>
    );
}

/** 헤더 톱니(설정) 버튼. */
export function GearButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <button onClick={onClick} title="설정" style={{ background: "none", color: "var(--text-tertiary)", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>
            ⚙
        </button>
    );
}
