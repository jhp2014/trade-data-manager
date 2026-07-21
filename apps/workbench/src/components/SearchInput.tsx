// 검색 인풋 조각 — 돋보기 + 입력 + (값 있을 때) × 지우기. 가설 리스트/그래프가 공유.
// 하이라이트 검색 전용(제출 없음): onChange 로 즉시 반영, Esc 는 onEscape 위임(그래프=접기, 리스트=비우기).
import { forwardRef } from "react";

export const SearchInput = forwardRef<
    HTMLInputElement,
    { value: string; onChange: (v: string) => void; onEscape?: () => void; placeholder?: string; autoFocus?: boolean }
>(function SearchInput({ value, onChange, onEscape, placeholder, autoFocus }, ref): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 2, background: "var(--bg-primary)", padding: "0 6px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input
                ref={ref}
                value={value}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onEscape?.(); } }}
                placeholder={placeholder ?? "검색"}
                style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "var(--text-primary)", padding: "5px 0", font: "inherit", fontSize: 12.5, outline: "none" }}
            />
            {value && (
                <button
                    onClick={() => onChange("")}
                    title="지우기"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", padding: 2, border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", lineHeight: 0 }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
});
