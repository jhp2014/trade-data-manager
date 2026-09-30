// 패널 헤더의 조각 선언 — 조각은 **두 종류뿐**이다: 정보(InfoSpec)와 컨트롤(ControlSpec).
// 섞인 표면(날짜+◀▶ 등)은 갈라 선언하고, 같은 사실이 양쪽에 중복돼도 된다 — 컨트롤의 상태를
// 정보 조각으로도 선언해 노출하는 것이 "숨긴 모드의 가시성"의 답이다(decisions.md 「패널 헤더 재편」).
//
// 패널은 이 선언을 **등록만** 하고(registry.usePanelHeader), 그리는 일은 셸 쪽이 한다:
// 탭 칩(TabInfoChips) · 첫 줄/바닥 줄(PanelFrame) · 모음 버튼 둘과 두 판(HeaderButtons).
// 선언(text()/kind 기본 위젯)이 기본이고 render* 오버라이드는 예외다 — 조각별 자유 JSX 를 전면
// 허용하면 폭 안정·tabular·톤 규약이 패널마다 다시 흩어진다(옛 HeaderControls 가 선언으로 옮긴 교훈).
//
// ⚠ 이 폴더(components/header/)는 store/dock·shell/panelCatalog 를 import 하지 않는다 —
//   패널 → components → dock 순환(TDZ)이 실제로 난 자리다. "지금 활성 패널"이 필요한 일은
//   셸·keymap 이 panelId 를 인자로 넘긴다(shortcut.pressSlot).
// ⚠ render* 함수는 hook 을 부르면 안 된다 — 패널 트리 **밖**(셸·판)에서 호출된다. 살아 있는 값이
//   필요한 렌더는 컴포넌트 요소를 돌려주고(`() => <X … />`) 그 컴포넌트가 hook 을 쓴다.
import type { ReactNode } from "react";

/** 정보의 자리 — 숨김 / 탭 뒤 칩 / 첫 줄 / 바닥 줄. 라인의 존재는 이 배치가 정한다(내용 유무가 아니라). */
export type InfoPlace = "hidden" | "tab" | "line" | "bottom";
/** 컨트롤의 자리 — 모음 판 / 첫 줄(항해형만). 컨트롤이 설 수 있는 라인은 첫 줄뿐이다. */
export type ControlPlace = "sheet" | "line";
/** 컨트롤 단축키 자리 — 맨숫자 1~5(활성 패널 대상). Ctrl+1~5(레이아웃 프리셋)와 별개다. */
export type SlotDigit = 1 | 2 | 3 | 4 | 5;
export const SLOT_DIGITS: readonly SlotDigit[] = [1, 2, 3, 4, 5];

interface SpecBase {
    /** 장부(배치·단축키)에 적히는 이름. ⚠ 바꾸면 그 조각의 배치·단축키 설정이 초기화된다. */
    id: string;
    /** 모음 판에 서는 이름 — 헤더 라인에는 안 나온다(라인은 값·손잡이만). */
    name: string;
    /** 한 줄 설명 — 모음 판의 ⓘ hover 와 손잡이 툴팁이 쓴다. */
    help?: string;
    /** 이 패널에 **있는** 조각인가(기본 true) — grain 처럼 패널 정체성으로 갈리는 분기를 데이터로 흡수한다. */
    available?: boolean;
}

export interface InfoSpec extends SpecBase {
    /** 기본 렌더 — 지금 값. null = 말할 값 없음(자리는 유지된다 — 라인 존재는 배치가 정한다). */
    text: () => string | null;
    /** 숫자가 든 정보(수·위치·날짜) — tabular-nums 로 폭이 안 흔들리게. */
    tabular?: boolean;
    /** 값의 톤 — warn(경고 앰버) / accent(액센트). 없으면 옅은 회색(상시 상태의 기본). */
    tone?: "warn" | "accent";
    /**
     * 일시 알림 — 배치 장부에 안 오르고, 값이 있는 동안만 **본문 위 오버레이 칩**으로 선다.
     * 라인을 만들지 못하는 이유: 알림이 라인을 생멸시키면 본문 높이가 출렁인다(라인 금지 규약).
     */
    transient?: boolean;
    /** 기본 자리(장부 예외가 덮는다). 생략 = "line". transient 면 무시된다. */
    defaultPlace?: InfoPlace;
    /** 탭 칩 예외 렌더 — 칩 껍데기는 셸이 그리고 이 함수는 속만 준다. */
    renderTab?: () => ReactNode;
    /** 첫 줄/바닥 줄 예외 렌더. */
    renderLine?: () => ReactNode;
}

interface ControlBase extends SpecBase {
    /** 항해형 — 작업 중에 만지는 손이라 **첫 줄에 설 자격**이 있다. 배치 장부가 판/첫줄을 고른다. */
    nav?: boolean;
    /** nav 컨트롤의 기본 자리(생략 = "line" — 항해형으로 선언했다면 대개 첫 줄이 목적이다). nav 가 아니면 무시. */
    defaultPlace?: ControlPlace;
    /** 첫 줄 예외 렌더(뉴스 모드 세그먼트류). 모음 판에서는 kind 기본 위젯이 선다. */
    renderInline?: () => ReactNode;
}

export interface ToggleSpec extends ControlBase {
    kind: "toggle";
    /** 손잡이에 찍히는 글자 — 생략하면 name(짧게 줄여야 할 때만 따로 준다). */
    label?: string;
    on: boolean;
    set: (on: boolean) => void;
    /** on/off 토글의 켜짐 색(기본 text-primary). */
    activeColor?: string;
    /** 지금은 누를 수 없다 — 사라지지 않고 흐려진다(자리가 안 움직인다). 이유는 help 가 말한다. */
    disabled?: boolean;
}

export interface ChoiceSpec extends ControlBase {
    kind: "choice";
    /** `color` = 그 값일 때의 글자색 — 값 하나가 "켜짐" 같은 뜻을 가질 때(w/s 걷는 중). */
    values: readonly { v: string; label: string; color?: string }[];
    value: string;
    set: (v: string) => void;
}

/** 누르면 **일이 일어나는** 것(지우기·원위치). 상태가 없으니 켜짐도 없다. */
export interface ActionSpec extends ControlBase {
    kind: "action";
    label?: string;
    /**
     * 실행 — 문구를 돌려주면 **단축키 호출** 때 그 문구가 피드백 칩이 된다(눈이 컨트롤에 없을 때의 확인).
     * 클릭 호출에는 칩이 없다 — 컨트롤 자신의 변화가 보이는 자리다.
     */
    run: () => string | void;
    disabled?: boolean;
}

/** 누르면 **판이 열리는** 것 — 내용만 정의하고 껍데기(닫힘·스택·flip·배치)는 팝오버 공용층이 진다. */
export interface PopoverSpec extends ControlBase {
    kind: "popover";
    label?: string;
    /** 켜짐 얼굴 — 판이 켜고 끄는 것을 들고 있을 때(기본 차트 「사슬」). 폭은 WidthLock 이 잡는다. */
    on?: boolean;
    activeColor?: string;
    /** 판 폭(px). 생략 = 내용 폭. */
    width?: number;
    /**
     * 판의 속 — 같은 render 가 입구 셋(첫 줄·모음 판 줄·단축키)에서 재사용된다.
     * ⚠ hook 금지(패널 트리 밖에서 호출) — 살아 있는 값은 컴포넌트 요소로 감싸라.
     */
    renderPopover: (close: () => void) => ReactNode;
    disabled?: boolean;
}

export type ControlSpec = ToggleSpec | ChoiceSpec | ActionSpec | PopoverSpec;

/** 패널 하나의 헤더 선언 — usePanelHeader 로 매 커밋 게시된다. */
export interface HeaderDecl {
    info: readonly InfoSpec[];
    controls: readonly ControlSpec[];
}

export const EMPTY_DECL: HeaderDecl = { info: [], controls: [] };
