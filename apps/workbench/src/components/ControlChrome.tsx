// 패널 헤더 컨트롤 공용 조각 — 차트 툴바·보드 헤더가 같은 계열(테두리·채움 없는 경량 텍스트)을 쓴다.
// 구성: 상호배타 그룹은 Dot(·)으로, 그룹 사이는 Sep(│)으로 나누고, 전체를 ControlBar 가 감싼다.
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";

// 경량 텍스트 토글 — 활성 = 볼드 + 색.
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
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </button>
    );
}

// 상호배타 옵션 구분점(·) — 한 그룹 안에서 "택1" 임을 알린다(그룹 사이는 Sep).
export function Dot(): JSX.Element {
    return <span style={{ color: "var(--border-default)", fontSize: 11 }}>·</span>;
}

// 컨트롤 그룹 구분자 — 1px 세로 헤어라인. 성격이 다른 그룹 사이에만.
export function Sep(): JSX.Element {
    return <span style={{ width: 1, height: 11, background: "var(--border-default)", flexShrink: 0 }} />;
}

// 컨트롤 그룹 — 구분자 사이의 토글 묶음(가로 스크롤 중 쪼개지지 않게 flexShrink: 0).
export function ControlGroup({ gap = 6, children }: { gap?: number; children: React.ReactNode }): JSX.Element {
    return <span style={{ display: "flex", alignItems: "center", gap, flexShrink: 0 }}>{children}</span>;
}

function ChevronIcon({ dir }: { dir: "left" | "right" }): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
        </svg>
    );
}

// 패널 헤더 우측 컨트롤 바 — 통째로 접기/펼치기(패널별 영속) + 폭 부족 시 가로 휠 스크롤.
// 스크롤바는 숨김(.no-scrollbar) — 좁을 때 컨트롤이 잘려 보이는 편이 상시 스크롤바보다 조용하다.
// 접기 셰브론은 스크롤 영역 밖에 고정 — 접힌 상태에서도 항상 잡힌다.
export function ControlBar({ collapsed, onToggle, gap = 10, children }: {
    collapsed: boolean;
    onToggle: () => void;
    gap?: number;
    children: React.ReactNode;
}): JSX.Element {
    const wheelRef = useHorizontalWheel<HTMLDivElement>(!collapsed); // 접힘→펼침 시 새 엘리먼트에 재부착
    const label = collapsed ? "컨트롤 펼치기" : "컨트롤 접기";
    return (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {!collapsed && (
                <div ref={wheelRef} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap, overflowX: "auto", minWidth: 0 }}>
                    {children}
                </div>
            )}
            <button
                onClick={onToggle}
                title={label}
                aria-label={label}
                style={{ display: "inline-flex", alignItems: "center", border: "none", background: "none", padding: "0 2px", cursor: "pointer", color: "var(--text-tertiary)", lineHeight: 0, flexShrink: 0 }}
            >
                <ChevronIcon dir={collapsed ? "left" : "right"} />
            </button>
        </div>
    );
}
