// 패널 헤더의 조각 선언 — 조각은 **두 종류뿐**이다: 정보(InfoSpec)와 컨트롤(ControlSpec).
// workbench components/header/spec.ts 에서 옮겼다(설계 근거: tdm-work decisions.md 「패널 헤더 재편」).
//
// 패널은 이 선언을 **등록만** 하고(registry.usePanelHeader), 그리는 일은 셸 쪽이 한다:
// 탭 뒤 정보(TabInfoChips) · 헤더 줄/바닥 줄(PanelFrame) · 탭 줄 오른쪽 버튼 둘과 두 판(HeaderButtons).
// 기본은 선언(text()·kind 기본 위젯)이고 render* 는 정말 고유한 모양만 — 조각별 자유 JSX 를 전면 허용하면
// 폭 안정·tabular·톤 규약이 패널마다 다시 흩어진다.
//
// trade-lab 이 workbench 와 다른 점:
//   · 컨트롤은 **기본 전부 컨트롤 판 안**("sheet")이고, **어떤 컨트롤이든** 핀으로 헤더 줄에 꺼낼 수 있다
//     (workbench 는 항해형 nav 만 첫 줄에 설 수 있었다). 패널이 좁아져도 헤더가 세로로 쌓이지 않게 하려는 것.
//   · 검색칸도 컨트롤이다(kind "search") — 판 안에서도, 꺼낸 줄에서도 같은 위젯·같은 확정 손짓.
//   · 숫자 단축키·stepper 는 없다.
//
// ⚠ 이 폴더(header/)는 store/dock·shell/panelCatalog 를 import 하지 않는다 — 패널 → header → dock → 카탈로그
//   → 패널로 import 순환(TDZ)이 된다(workbench 에서 실제로 났다).
// ⚠ render* 함수는 hook 을 부르면 안 된다 — 패널 트리 **밖**(셸·판)에서 호출된다. 살아 있는 값이
//   필요하면 컴포넌트 요소를 돌려주고(`() => <X … />`) 그 컴포넌트가 상태를 갖는다.
import type { ReactNode } from "react";

/** 정보의 자리 — 숨김 / 탭 뒤 / 헤더 줄 / 바닥 줄. 라인의 존재는 이 배치가 정한다(내용 유무가 아니라). */
export type InfoPlace = "hidden" | "tab" | "line" | "bottom";
/** 컨트롤의 자리 — 컨트롤 판 / 헤더 줄. 컨트롤이 설 수 있는 라인은 헤더 줄뿐이다. */
export type ControlPlace = "sheet" | "line";

interface SpecBase {
    /** 자리 장부에 적히는 이름. ⚠ 바꾸면 그 조각의 자리 설정이 초기화된다 — 짧고 안정적으로. */
    id: string;
    /** 판에 서는 이름 — 헤더 줄에는 안 나온다(줄은 값·손잡이만). */
    name: string;
    /** 한 줄 설명 — 판의 ⓘ hover 와 손잡이 툴팁. */
    help?: string;
}

export interface InfoSpec extends SpecBase {
    /** 지금 값. null = 말할 값 없음(자리는 유지된다 — 라인 존재는 배치가 정한다). */
    text: () => string | null;
    /** 숫자가 든 정보(날짜·시각·건수) — tabular-nums 로 폭이 안 흔들리게. */
    tabular?: boolean;
    /** 값의 톤 — warn(경고 앰버) / accent(액센트). 없으면 옅은 회색(상시 상태의 기본). */
    tone?: "warn" | "accent";
    /**
     * 일시 알림 — 자리 장부에 안 오르고, 값이 있는 동안만 **본문 위 오버레이 칩**으로 선다.
     * 라인을 만들지 못하는 이유: 알림이 라인을 생멸시키면 본문 높이가 출렁인다.
     */
    transient?: boolean;
    /** 기본 자리(장부 예외가 덮는다). 생략 = "line". transient 면 무시된다. */
    defaultPlace?: InfoPlace;
    /** 헤더 줄·바닥 줄·정보 판의 예외 모양(예: 굵은 글자·색을 섞은 문구). 탭 뒤는 늘 text() 다. */
    renderLine?: () => ReactNode;
}

interface ControlBase extends SpecBase {
    /** 기본 자리(장부 예외가 덮는다). 생략 = "sheet"(판 안 — 기본은 다 숨김). */
    defaultPlace?: ControlPlace;
    /**
     * **헤더 줄 모양** 선언 — 꺼냈을 때 kind 기본 줄 위젯 대신 이것이 선다. 판 안은 언제나 kind 판 위젯이다.
     * 줄 규약(24px·줄바꿈 없음)은 지켜야 한다 — 요소는 nowrap·flexShrink 0 으로.
     */
    renderLine?: () => ReactNode;
}

/** on/off. */
export interface ToggleSpec extends ControlBase {
    kind: "toggle";
    /** 손잡이에 찍히는 글자 — 생략하면 name. */
    label?: string;
    on: boolean;
    set: (on: boolean) => void;
    /** 지금은 누를 수 없다 — 사라지지 않고 흐려진다(자리가 안 움직인다). */
    disabled?: boolean;
}

/** 하나 고르기. 줄에서는 ≤3 이면 순환(누르면 다음 값), 넘으면 고르기 판. 판 안에서는 세그먼트. */
export interface ChoiceSpec extends ControlBase {
    kind: "choice";
    values: readonly { v: string; label: string }[];
    value: string;
    set: (v: string) => void;
}

/** 누르면 **일이 일어나는** 것(해제·채우기). 상태가 없으니 켜짐도 없다. */
export interface ActionSpec extends ControlBase {
    kind: "action";
    label?: string;
    run: () => void;
    disabled?: boolean;
}

/** 누르면 **판이 열리는** 것 — 내용만 정의하고 껍데기(닫힘·스택·flip·배치)는 팝오버 층이 진다. */
export interface PopoverSpec extends ControlBase {
    kind: "popover";
    /** 트리거 글자 — 판 안 값의 짧은 요약("300 ∪ 100"). 생략 = name. */
    label?: string;
    /** 판 폭(px). 생략 = 내용 폭. */
    width?: number;
    /** 판의 속. ⚠ hook 금지(패널 트리 밖에서 호출) — 살아 있는 값은 컴포넌트 요소로 감싸라. */
    renderPopover: (close: () => void) => ReactNode;
    disabled?: boolean;
}

/**
 * 입력칸 + 확정 손짓(Enter, `button` 이 있으면 늘 보이는 버튼도). 판 안에서도 꺼낸 줄에서도 같은 위젯이라
 * 확정은 어느 자리에서든 같은 submit 하나다. 한글 조합 중의 Enter 는 확정이 아니다.
 *
 * 칸의 글자를 어디에 둘지 두 가지:
 *   · `onDraft` 없음 — 칸이 친 글자를 스스로 들고, Enter 없이 떠나거나(blur) Esc 면 value(확정값)로 돌아간다
 *     (친 글자가 남아 걸러진 줄 착각하지 않게 — HTS뉴스 키워드).
 *   · `onDraft` 있음 — value 가 곧 친 글자다(패널 설정에 둬서 다시 붙여도·자리를 옮겨도 남는다 — 텔레그램).
 */
export interface SearchSpec extends ControlBase {
    kind: "search";
    value: string;
    onDraft?: (v: string) => void;
    /** 확정 — 칸의 글자 그대로 넘긴다(다듬기는 받는 쪽). */
    submit: (v: string) => void;
    /** 확정 버튼 글자 — 주면 칸 옆에 늘 보이는 버튼이 선다. 없으면 Enter 로만. */
    button?: string;
    /** false = 지금은 확정할 수 없다(버튼이 흐려지고 Enter 도 안 먹는다). 칸은 계속 칠 수 있다. 생략 = true. */
    canSubmit?: boolean;
    placeholder?: string;
    /** 확정된 조건이 걸려 있다 — 칸 테두리가 액센트. */
    active?: boolean;
    /** 헤더 줄에서의 칸 폭(px). 판 안에서는 남는 폭을 다 쓴다. 생략 = 120. */
    width?: number;
}

export type ControlSpec = ToggleSpec | ChoiceSpec | ActionSpec | PopoverSpec | SearchSpec;

/** 패널 하나의 헤더 선언 — usePanelHeader 로 매 커밋 게시된다. */
export interface HeaderDecl {
    info: readonly InfoSpec[];
    controls: readonly ControlSpec[];
}

export const EMPTY_DECL: HeaderDecl = { info: [], controls: [] };
