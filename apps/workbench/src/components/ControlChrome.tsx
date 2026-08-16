// 패널 헤더 컨트롤 공용 조각 — 차트 툴바·보드 헤더가 같은 계열(테두리·채움 없는 경량 텍스트)을 쓴다.
// 구성: 컨트롤 줄 자체는 HeaderControls 가 그린다 — 여기 남은 건 그 줄이 쓰는 낱개 조각들이다.
// 머리글 줄 자체(PanelHeader)도 여기 산다 — 넘칠 때의 규약이 패널마다 달라지면 안 되기 때문이다.
import type { CSSProperties, ReactNode } from "react";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";

/**
 * 테두리 있는 작은 버튼 — 헤더의 "해제 ⤺" 류(상태를 되돌리는 손잡이). 토글(TextToggle)과 달리
 * 눌러서 **일을 시키는** 것이라 테두리를 받는다.
 *
 * `nowrap` 이 붙어 있다: 두 패널이 각자 들고 있던 동안 한쪽에만 붙어 있었는데, 없는 쪽이 옳았던 게
 * 아니라 그 패널의 라벨이 짧아 티가 안 났을 뿐이다(헤더가 가로 스크롤되는 자리라 줄바꿈은 언제나 사고다).
 */
export const miniBtn: CSSProperties = {
    fontSize: 11, padding: "2px 8px", borderRadius: 4,
    background: "transparent", color: "var(--text-tertiary)",
    border: "1px solid var(--border-default)", cursor: "pointer", whiteSpace: "nowrap",
    flexShrink: 0, // 머리글이 가로 스크롤이라 — 안 그으면 넘치는 대신 버튼들이 쭈그러든다(PanelHeader 주석)
};

/** 비어 있음·불러오는 중 안내 문구 — 패널 본문 자리에 조용히 앉는다. */
export const mutedNote: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px" };

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

// 상호배타 구분점(·) — 서로를 배제하는 버튼 둘 사이에만(맵의 그룹/목록).
export function Dot(): JSX.Element {
    return <span style={{ color: "var(--border-default)", fontSize: 11 }}>·</span>;
}

// Sep(│ 그룹 구분자)은 사라졌다 — 컨트롤 순서를 손이 정하는 순간 묶음 경계는 우연이 되고,
// 재정렬할 때마다 선이 늘었다 줄었다 한다. 갈래는 더보기 판에서 **이름 앞에** 붙어 그 일을 대신한다.

// ControlGroup(구분자 사이 묶음)·ControlBox(라벨 붙은 옅은 박스)는 사라졌다.
// 묶음은 이제 **선언의 `group`** 이고, 그 이름은 헤더가 아니라 더보기 판에서 **이름 앞에** 붙는다
// (라벨은 헤더에 없다 — HeaderControls 규약 ①). 헤더는 묶음을 아예 표시하지 않는다.

/**
 * 패널 머리글 한 줄 — **넘치면 줄을 바꾸지 않고 가로로 스크롤한다**(사용자 확정, 전 패널 공통).
 *
 * 줄바꿈(flexWrap)을 버린 이유는 취향이 아니다: 머리글이 두 줄이 되는 순간 **본문 높이가 변한다**.
 * 골격 패널에서 칩 하나가 늘 때마다 그림 상자가 튀던 게 그거고(OverlayFooter 주석의 그 사고),
 * 차트·보드처럼 높이에 그림이 걸린 패널은 전부 같은 성질을 갖는다. 높이는 고정하고 넘치는 폭은
 * 스크롤로 도달하게 한다 — 잘려 안 보이는 것과 다르다.
 *
 * 스크롤바는 숨긴다(.no-scrollbar) — 상시 스크롤바가 머리글 높이를 먹는다. 대신 **가로 휠**이 붙어
 * 마우스만으로 닿고(useHorizontalWheel), 트랙패드 가로 제스처·드래그도 그대로 먹는다.
 *
 * ⚠ 자식은 `flexShrink: 0`(또는 nowrap)이어야 실제로 스크롤이 생긴다. 안 그러면 넘치는 대신
 * 자기들끼리 쭈그러들어 글자가 뭉개진다 — 일부러 줄어들 자리(이름 ellipsis)만 예외로 둔다.
 */
export function PanelHeader({ gap = 8, padding = "6px 10px", chrome = true, title, style, children }: {
    gap?: number;
    padding?: string;
    /** 줄 전체에 걸리는 툴팁(타점 정보의 "종목 · 날짜"처럼 좁아서 못 다 쓴 것을 여기서 말할 때). */
    title?: string;
    /**
     * 바탕·아래 경계선을 이 줄이 그릴까. 머리글이 **두 줄인 패널**(뉴스: 컨트롤 줄 + 날짜 줄)은
     * 바깥이 이미 그 결을 그리고 있으므로 false — 줄마다 경계선을 그으면 머리글이 표처럼 보인다.
     */
    chrome?: boolean;
    /** 패널별 차이(글자 크기·위 경계선 등)만 덮어쓴다. 넘침 규약은 못 덮는다 — 그러라고 모은 자리다. */
    style?: CSSProperties;
    children: ReactNode;
}): JSX.Element {
    const wheelRef = useHorizontalWheel<HTMLDivElement>();
    return (
        <div ref={wheelRef} className="no-scrollbar" title={title}
            style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap, padding,
                ...(chrome ? { borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" } : null),
                ...style,
                // 넘침 규약은 style 뒤에 — 패널이 실수로 덮어 다시 줄바꿈이 되는 일이 없게.
                flexWrap: "nowrap", overflowX: "auto", overflowY: "hidden",
            }}>
            {children}
        </div>
    );
}

// ControlBar(줄 전체를 셰브론으로 접던 것)는 사라졌다 — 접는 단위가 줄 전체라 하나를 보려면 다 펼쳐야
// 했고, 컨트롤별 핀(HeaderControls 의 더보기 판)이 같은 일을 더 잘한다. 접힘 상태를 담던 store 슬라이스
// (panelSlice)도 같이 없앴다.
