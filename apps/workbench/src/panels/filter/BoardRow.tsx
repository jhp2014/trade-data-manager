// 레일이 아닌 줄(그룹·추가 버튼·테마 행)을 **레일과 같은 격자**에 앉히는 껍데기 — 이름 열 폭·행 높이·
// 구분선이 같아야 목록 하나로 읽힌다. 이게 없을 때 그룹 영역이 조건 목록이 아니라 여백처럼 보였다.
// (FilterBoard 에서 추출 — 테마 칸(ThemeRow)도 쓰게 되면서 순환 import 를 피해 제 파일로.)
import { RAIL_LABEL_W, RAIL_ROW_H } from "./rail/Rail.js";

export function BoardRow({ label, innerRef, flash = false, dimmed = false, children }: {
    label: string;
    innerRef?: (el: HTMLElement | null) => void;
    flash?: boolean;
    dimmed?: boolean;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <div ref={innerRef} style={{
            display: "flex", alignItems: "center", height: RAIL_ROW_H, borderBottom: "1px solid var(--border-subtle)",
            background: flash ? "var(--accent-soft)" : "transparent", opacity: dimmed ? 0.5 : 1, transition: "background .35s ease",
        }}>
            <div style={{ width: RAIL_LABEL_W, flexShrink: 0, padding: "0 6px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                {label}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", paddingRight: 8 }}>{children}</div>
        </div>
    );
}
