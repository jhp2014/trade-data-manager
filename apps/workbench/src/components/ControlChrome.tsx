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
    color,
    activeColor = "var(--text-primary)",
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    /**
     * 켜짐과 **무관하게** 이 색으로 — 경고 물들임(HeaderControls 의 `tone`)이 쓴다.
     * activeColor 로는 이 일을 못 한다: 그건 켜졌을 때만 칠하는데, 경고는 꺼져 있을 때도 보여야 한다.
     */
    color?: string;
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
                color: color ?? (active ? activeColor : "var(--text-tertiary)"),
                opacity: disabled ? 0.4 : 1,
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </button>
    );
}

// 구분 기호(Dot ·, Sep │)는 둘 다 사라졌다. 컨트롤 순서를 손이 정하는 순간 묶음 경계는 우연이 되고,
// 재정렬할 때마다 기호가 늘었다 줄었다 한다. 택1임은 **켜진 하나만 굵게 서는 것**으로 보이고, 갈래는
// 더보기 판에서 이름 앞에 붙어 그 일을 대신한다.

// ControlGroup(구분자 사이 묶음)·ControlBox(라벨 붙은 옅은 박스)는 사라졌다.
// 묶음은 이제 **선언의 `group`** 이고, 그 이름은 헤더가 아니라 더보기 판에서 **이름 앞에** 붙는다
// (라벨은 헤더에 없다 — HeaderControls 규약 ①). 헤더는 묶음을 아예 표시하지 않는다.

/**
 * **넘치면 줄을 바꾸지 않고 가로로 스크롤하는 한 줄** — 칩 줄·컨트롤 줄·머리글이 다 이것이다.
 *
 * 줄바꿈(flexWrap)을 버린 이유는 취향이 아니다: 줄이 두 줄이 되는 순간 **본문 높이가 변한다**.
 * 골격 패널에서 칩 하나가 늘 때마다 그림 상자가 튀던 게 그거고(OverlayFooter 주석의 그 사고),
 * 차트·보드처럼 높이에 그림이 걸린 패널은 전부 같은 성질을 갖는다. 높이는 고정하고 넘치는 폭은
 * 스크롤로 도달하게 한다 — 잘려 안 보이는 것과 다르다.
 *
 * ## 왜 컴포넌트인가 (스크롤 못 하는 줄이 반복해서 태어난 이유)
 * 이 규약은 원래 **세 조각**이었다: `overflowX:auto` + `.no-scrollbar` + `useHorizontalWheel`.
 * 앞의 둘만 적으면 **스크롤바는 숨겼는데 굴릴 방법이 없는 줄**이 된다 — 마우스만 쓰는 손에게는
 * 넘친 부분이 그냥 사라진 것과 같다. 집합 사이드바의 달 칩·그룹 체인 줄·그룹 식 칩이 정확히 그
 * 상태였고, 알람 로그는 훅을 손으로 복사해 갖고 있었다. 셋을 한 컴포넌트로 묶으면 반쪽짜리 줄을
 * **애초에 못 만든다**.
 *
 * ⚠ 자식은 `flexShrink: 0`(또는 nowrap)이어야 실제로 스크롤이 생긴다. 안 그러면 넘치는 대신
 * 자기들끼리 쭈그러들어 글자가 뭉개진다 — 일부러 줄어들 자리(이름 ellipsis)만 예외로 둔다.
 */
export function ScrollRow({ scroll = true, gap = 4, align = "center", title, className, onClick, style, children }: {
    /**
     * 넘칠 때 스크롤할까(기본). false = 넘치면 잘린다 — 폭이 없는 밀집 표기(GroupChips 의 `scroll` 끔)처럼
     * **도달을 포기하는 게 의도인 자리**만 쓴다. 끄면 휠도 안 붙는다(빈 리스너를 남기지 않는다).
     */
    scroll?: boolean;
    gap?: number;
    align?: CSSProperties["alignItems"];
    /** 줄 전체에 걸리는 툴팁(좁아서 못 다 쓴 것을 여기서 말할 때). */
    title?: string;
    className?: string;
    /** 이 줄에서 난 클릭을 여기서 삼킬 때(카드 위에 얹힌 칩 줄 — 칩을 누른 게 카드를 누른 게 되면 안 된다). */
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    /** 자리별 차이(패딩·바탕·글자)만 덮어쓴다. **넘침 규약은 못 덮는다** — 그러라고 모은 자리다. */
    style?: CSSProperties;
    children: ReactNode;
}): JSX.Element {
    const wheelRef = useHorizontalWheel<HTMLDivElement>(scroll);
    return (
        <div ref={wheelRef} title={title} onClick={onClick}
            className={[scroll ? "no-scrollbar" : null, className].filter((c) => c !== null).join(" ") || undefined}
            style={{
                display: "flex", alignItems: align, gap, minWidth: 0,
                ...style,
                // 넘침 규약은 style 뒤에 — 호출부가 실수로 덮어 다시 줄바꿈이 되는 일이 없게.
                flexWrap: "nowrap", overflowX: scroll ? "auto" : "hidden", overflowY: "hidden",
            }}>
            {children}
        </div>
    );
}

/**
 * 시선 칩 — **"지금 무엇을 보고 있나"**를 말하는 작은 알약. 집합·월처럼 고른 상태가 줄에 서고,
 * 누르면 고르는 판(팝오버·서랍)이 열린다: 줄은 요약만 들고 긴 목록은 판이 든다.
 *
 * 켜짐이 굵기가 아니라 **채움**인 이유: 여기는 상태를 말하는 자리라 "고른 것"과 "고를 수 있는 것"이
 * 한눈에 갈려야 한다(TextToggle 의 굵기 규약은 손잡이 줄의 것이다 — 자리가 다르면 표기도 다르다).
 */
export function GazeChip({ label, active, color, title, tabular = false, dashed = false, disabled = false, onClick, onContextMenu }: {
    label: ReactNode;
    active: boolean;
    /** 켜짐 채움색(기본 accent) — 채널마다 색이 다른 자리(집합=핀 보라)가 있다. */
    color?: string;
    title?: string;
    /** 숫자가 든 칩(월·카운트) — 자리가 안 흔들리게. */
    tabular?: boolean;
    /** 아직 없는 것을 만드는 칩(+ 저장) — 점선으로 "빈 자리"라고 말한다. */
    dashed?: boolean;
    disabled?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}): JSX.Element {
    return (
        <button onClick={onClick} onContextMenu={onContextMenu} title={title} disabled={disabled}
            className={tabular ? "tabular" : undefined}
            style={{
                flexShrink: 0, cursor: disabled ? "default" : "pointer", font: "inherit", fontSize: 11,
                padding: "1px 8px", borderRadius: 9, whiteSpace: "nowrap",
                border: `0.5px ${dashed ? "dashed" : "solid"} ${active ? "transparent" : "var(--border-strong)"}`,
                background: active ? (color ?? "var(--accent-primary)") : "transparent",
                color: active ? "#fff" : "var(--text-secondary)", fontWeight: active ? 700 : 400,
                opacity: disabled ? 0.45 : 1,
            }}>
            {label}
        </button>
    );
}

/**
 * 패널 머리글 한 줄 — ScrollRow 에 머리글의 겉모습(경계선·바탕·안 줄어듦)을 입힌 것.
 * 넘침 동작은 전부 ScrollRow 것이다.
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
    return (
        <ScrollRow gap={gap} title={title}
            style={{
                flexShrink: 0, padding,
                ...(chrome ? { borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" } : null),
                ...style,
            }}>
            {children}
        </ScrollRow>
    );
}

// ControlBar(줄 전체를 셰브론으로 접던 것)는 사라졌다 — 접는 단위가 줄 전체라 하나를 보려면 다 펼쳐야
// 했고, 컨트롤별 핀(HeaderControls 의 더보기 판)이 같은 일을 더 잘한다. 접힘 상태를 담던 store 슬라이스
// (panelSlice)도 같이 없앴다.
