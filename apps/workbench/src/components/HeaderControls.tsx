// 패널 머리글의 **컨트롤 한 줄** — 무엇을 그릴지 패널이 JSX 로 손그리는 대신 **데이터로 선언**하고,
// 그리는 일은 여기 한 곳이 한다. 규약이 패널마다 갈리지 않게 하려고 만든 자리다.
//
// ## 세 가지 규약
// **① 라벨은 헤더에 없다.** 이름·설명은 더보기(⋯) 판에만 산다. 헤더는 손잡이만 — 맵 헤더가 조용한
//    이유가 그거였다("그룹 · 목록 │ 원위치"). 접힌 것을 펼치면 라벨과 설명이 붙고, 헤더로 올리면 떨어진다.
// **② 폭은 값이 바뀌어도 안 움직인다.** 컨트롤바가 정신사나운 진짜 원인은 개수가 아니라 **글자 폭의
//    출렁임**이다: 순환 값이 갈리면 폭이 갈리고, 활성 토글이 굵어지면(700) 그것만으로도 뒤엣것이
//    1~2px 밀린다. WidthLock 이 **모든 값을 같은 칸에 겹쳐 쌓아** 제일 긴 것으로 칸을 잡는다 —
//    손으로 px 을 적지 않으므로 폰트가 바뀌어도 맞는다. 너무 길면 상한에서 잘린다(…).
// **③ 택1은 순환, 넷부터 팝오버.** 값이 제자리에서 갈리므로 판이 안 열리고 자리도 안 변한다.
//    "다음이 뭔지 모른다"는 순환의 유일한 약점은 툴팁이 받는다(`클릭 = 진하게`).
//    ⚠ 한때 **나열(segmented)** 이라는 예외가 있었다 — 거쳐 가는 값이 실제로 켜지거나(슬롯 1→3 이 2를
//    진짜 적용) 값마다의 상태를 동시에 봐야 하는(어느 칸이 찼나) 자리용이었는데, 유일한 소비자였던
//    필터 슬롯이 폐지되면서 함께 지웠다. 그런 자리가 다시 생기면 그때 되살리는 게 낫다 — 소비자 없는
//    예외는 규약을 읽는 사람에게 "이걸 언제 쓰지"만 남긴다.
//
// ## 핀
// 핀 = "헤더에 올린다". 저장은 **언핀 목록**으로 한다(핀 목록이 아니라) — 그래야 나중에 추가된
// 컨트롤이 목록에 없다는 이유로 숨겨지지 않는다. 새 컨트롤은 언제나 기본 핀이다.
//
// 구성: 선언 타입 + 줄 자체는 여기, 낱개 손잡이는 controlWidgets, 더보기 판은 ControlSheet,
// 핀·순서의 순수 로직은 headerPins(테스트 표면) — 소비자는 이 파일 하나만 import 한다.
import { useCallback, useMemo } from "react";
import { HeaderPopover } from "./HeaderPopover.js";
import { ScrollRow } from "./ControlChrome.js";
import { DotsIcon } from "./icons.js";
import { usePersistedState } from "../store/persist.js";
import { applyOrder, EMPTY_PINS, parsePins, type PinState } from "./headerPins.js";
import { ControlValue } from "./controlWidgets.js";
import { ControlSheet } from "./ControlSheet.js";

export { applyOrder } from "./headerPins.js";

interface ControlBase {
    /**
     * 영속 단위 — 언핀 목록에 적히는 이름. ⚠ 바꾸면 그 컨트롤의 핀 설정이 초기화된다(기본 핀으로 돌아간다).
     */
    id: string;
    /** 더보기 판의 이름. 헤더에는 안 나온다(규약 ①). */
    name: string;
    /** 더보기 판의 한 줄 설명 — 헤더 툴팁으로도 쓰인다. */
    help?: string;
    /**
     * 갈래 — 더보기 판에서 **이름 앞에** 붙는 말("마커 분봉 대금"). 헤더에는 안 나온다.
     * 섹션 제목이 아니라 접두인 이유: 순서를 손이 정하므로 섹션은 흩어진다 — 소속은 줄을 따라다녀야 한다.
     */
    group?: string;
    /**
     * 이 패널에 **있는** 컨트롤인가(기본 true). grain 처럼 패널 정체성으로 갈리는 분기를 데이터로 흡수한다 —
     * 값에 따라 켜고 끄는 용도가 아니다(그러면 자리가 출렁인다).
     */
    available?: boolean;
    /**
     * 경고 물들임 — **이 컨트롤이 여는 곳에 문제가 있다**("집합" 토글이 가리키는 참조가 깨졌다).
     * 켜짐/꺼짐과 **직교한다**: `activeColor` 는 켜졌을 때만 칠하는데, 사고는 대개 닫혀 있을 때
     * 발견되므로 그것으로는 정작 필요한 순간에 아무 말도 못 한다.
     * ⚠ **색만** 갈린다 — 라벨에 `⚠` 를 붙이면 글자 폭이 갈려 이웃이 밀린다(규약 ②).
     * 무엇이 잘못됐는지는 왼쪽 말의 자리가 말하고, 이 색은 **고칠 손잡이가 어디인지**만 가리킨다.
     */
    tone?: "warn";
}

export interface ToggleSpec extends ControlBase {
    kind: "toggle";
    /** 헤더에 찍히는 글자 — 생략하면 name 을 쓴다(짧게 줄여야 할 때만 따로 준다). */
    label?: string;
    on: boolean;
    set: (on: boolean) => void;
    /** on/off 토글의 켜짐 색(상호배타 선택은 기본색). */
    activeColor?: string;
}

export interface ChoiceSpec extends ControlBase {
    kind: "choice";
    values: readonly { v: string; label: string }[];
    value: string;
    set: (v: string) => void;
}

/**
 * 누르면 **일이 일어나는** 것(지우기·새로고침). 상태가 없으니 켜짐도 없다.
 * 할 게 없을 때는 사라지는 게 아니라 `disabled` 로 흐려진다 — 자리가 안 움직여야 한다는 게 이 층의 규약이다.
 */
export interface ActionSpec extends ControlBase {
    kind: "action";
    label?: string;
    /** 누른 자리를 받는다 — 메뉴를 그 자리에 띄우는 손짓(+ 축 등)이 있어서다. 안 쓰면 무시하면 된다. */
    run: (at: { clientX: number; clientY: number }) => void;
    disabled?: boolean;
}

export type ControlSpec = ToggleSpec | ChoiceSpec | ActionSpec;

/**
 * 머리글 컨트롤 줄 — **머리글의 오른쪽 끝**에 붙는다(`marginLeft:auto` 를 자기가 갖는다 — 패널이
 * 실수로 왼쪽에 두면 규칙이 깨지므로 선택지를 안 준다). 왼쪽은 "무엇을 보고 있나", 오른쪽은 손이다.
 *
 * 구분선(│)은 없다. 순서를 손이 정하는 순간 묶음 경계는 우연이 되고, 그럼 재정렬할 때마다 선이
 * 늘었다 줄었다 한다. 갈래는 더보기 판에서 **이름 앞에** 붙어 그 일을 대신한다.
 *
 * ⋯ 는 **스크롤 영역 밖**에 고정한다. 좁아지면 컨트롤은 밀려나도 되지만 더보기까지 밀려나면
 * 접어 둔 것에 닿을 길이 사라진다(옛 ControlBar 의 셰브론이 밖에 있던 이유가 그거였다).
 */
export function HeaderControls({ controls, storageKey }: {
    controls: readonly ControlSpec[];
    /** 핀·순서의 영속 키 — 패널 **종류** 단위(예: wb.headerPins.chart.replay). */
    storageKey: string;
}): JSX.Element {
    const [pins, setPins] = usePersistedState<PinState>(storageKey, parsePins, EMPTY_PINS);

    const here = useMemo(() => controls.filter((c) => c.available !== false), [controls]);
    const unpinnedSet = useMemo(() => new Set(pins.unpinned), [pins.unpinned]);
    /** 손이 정한 순서로 세운 목록 — 저장에 없는 것(새 컨트롤)은 선언된 이웃 뒤에 끼운다. */
    const ordered = useMemo(() => applyOrder(here, pins.order), [here, pins.order]);
    const shown = ordered.filter((c) => !unpinnedSet.has(c.id));
    const foldedCount = ordered.length - shown.length;

    const togglePin = useCallback((id: string): void => setPins((p) => ({
        ...p,
        unpinned: p.unpinned.includes(id) ? p.unpinned.filter((x) => x !== id) : [...p.unpinned, id],
    })), [setPins]);
    /** 재정렬은 **지금 보이는 목록 전체**를 그대로 굳힌다 — 부분 저장은 다음 이주 규칙과 어긋난다. */
    const reorder = useCallback((ids: readonly string[]): void =>
        setPins((p) => ({ ...p, order: [...ids] })), [setPins]);

    return (
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <ScrollRow gap={10}>
                {shown.map((c) => <ControlValue key={c.id} spec={c} />)}
            </ScrollRow>
            <HeaderPopover
                width={330}
                closeOnOutside
                trigger={(open, toggle) => (
                    <button onClick={toggle} title="컨트롤 전부 보기 · 헤더에 올릴 것 고르기 · 순서 바꾸기"
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                            border: "none", background: "none", padding: "0 2px 0 8px", cursor: "pointer",
                            borderLeft: "1px solid var(--border-default)",
                            font: "inherit", fontSize: 11, lineHeight: 0,
                            color: open ? "var(--text-primary)" : "var(--text-tertiary)",
                        }}>
                        <DotsIcon />
                        {foldedCount > 0 && <span style={{ lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{foldedCount}</span>}
                    </button>
                )}
            >
                {() => <ControlSheet controls={ordered} unpinned={unpinnedSet} onTogglePin={togglePin} onReorder={reorder} />}
            </HeaderPopover>
        </span>
    );
}
