// 컨트롤 하나하나의 **손잡이** — 첫 줄과 모음 판이 같은 것을 쓴다(판에는 이름·숫자 배지·ⓘ 가 더 붙는다).
// 선언(ControlSpec)은 spec.ts, 호출의 뜻은 invoke.ts, 여기는 그리는 규약(폭 잠금·순환/판 갈림)만.
//
// ## 폭 잠금(WidthLock) — 옛 헤더 전체가 조용히 앓던 증상의 처방
// 값이 갈리거나 활성이 굵어지는(700) 것만으로 글자 폭이 출렁여 이웃이 1~2px 밀린다. 모든 모습을
// 같은 칸에 겹쳐 쌓아 제일 긴 것으로 칸을 잡는다 — px 을 손으로 안 적으니 폰트가 바뀌어도 맞는다.
import type { CSSProperties, ReactNode } from "react";
import { TriggerPopover } from "../../ui/popover/TriggerPopover.js";
import { MENU_PAD, MenuItem } from "../../ui/popover/menu.js";
import { TextToggle } from "../ControlChrome.js";
import { CYCLE_MAX, nextChoice } from "./invoke.js";
import type { ActionSpec, ChoiceSpec, ControlSpec, PopoverSpec, ToggleSpec } from "./spec.js";

/** 판 트리거 글자의 상한 — 넘치면 … 로 자른다(값 하나가 길다고 줄 전체가 밀리지 않게). */
const TRIGGER_MAX_W = 96;

/**
 * 컨트롤 하나의 손잡이 — **첫 줄 배치**용(renderInline 이 없을 때). 헤더 줄의 규약(폭 잠금·순환·
 * 경량 텍스트)을 따른다. 모음 판은 BoardControlValue 를 쓴다 — 판은 자리가 넉넉해 성격이 그대로
 * 보이는 조작(스위치·세그먼트·버튼)이 서고, 줄은 폭이 귀해 글자 조작이 선다(자리가 다르면 표기도 다르다).
 */
export function ControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    if (spec.kind === "toggle") return <ToggleControl spec={spec} />;
    if (spec.kind === "action") return <ActionControl spec={spec} />;
    if (spec.kind === "popover") return <PopoverControl spec={spec} />;
    return spec.values.length <= CYCLE_MAX ? <CycleControl spec={spec} /> : <PickControl spec={spec} />;
}

/**
 * 모음 판의 손잡이 — 성격이 모양으로 보인다: 토글 = 스위치 · 택1 = 세그먼트(값이 다 보이고 하나가
 * 채워짐 — 순환은 "다음이 뭔지 모른다"는 약점이 있어 자리가 있으면 세그먼트가 낫다) ·
 * 액션 = 테두리 버튼(누르면 일이 일어남) · 판형 = 열기 트리거(▾).
 */
export function BoardControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    if (spec.kind === "toggle") return <SwitchControl spec={spec} />;
    if (spec.kind === "action") return <BoardActionButton spec={spec} />;
    if (spec.kind === "popover") return <BoardPopoverOpener spec={spec} />;
    return spec.values.length <= SEGMENT_MAX ? <SegmentControl spec={spec} /> : <PickControl spec={spec} />;
}

/** 세그먼트로 세울 최대 값 수 — 넘으면 고르기 판(칸이 판 폭을 밀어낸다). */
const SEGMENT_MAX = 4;

/** 판의 토글 — 스위치(켜짐 = 트랙 채움). 켜짐 색은 activeColor(기본 액센트). */
function SwitchControl({ spec }: { spec: ToggleSpec }): JSX.Element {
    const on = spec.on;
    const color = spec.activeColor ?? "var(--accent-primary)";
    return (
        <button role="switch" aria-checked={on} aria-label={spec.name} onClick={() => spec.set(!on)}
            disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                width: 26, height: 14, borderRadius: 7, border: "none", padding: 0, flexShrink: 0,
                background: on ? color : "var(--border-strong)", position: "relative",
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
                transition: "background 120ms ease",
            }}>
            <span style={{
                position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5,
                background: "#fff", transition: "left 120ms ease",
            }} />
        </button>
    );
}

/** 판의 택1 — 세그먼트. 값마다 색이 있으면(w/s 걷는 중) 고른 칸이 그 색을 입는다. */
function SegmentControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    return (
        <span title={spec.help ?? spec.name}
            style={{ display: "inline-flex", flexShrink: 0, border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
            {spec.values.map((o) => {
                const on = o.v === spec.value;
                return (
                    <button key={o.v} onClick={() => spec.set(o.v)}
                        style={{
                            border: "none", cursor: "pointer", fontSize: 10.5, padding: "2px 8px", whiteSpace: "nowrap",
                            background: on ? "var(--accent-soft)" : "none",
                            color: on ? (o.color ?? "var(--accent-hover)") : "var(--text-tertiary)",
                            fontWeight: on ? 600 : 400,
                        }}>
                        {o.label}
                    </button>
                );
            })}
        </span>
    );
}

/** 판의 액션 — 테두리 버튼(누르면 일이 일어난다는 얼굴). 할 게 없으면 사라지지 않고 흐려진다. */
export function BoardActionButton({ spec }: { spec: ActionSpec }): JSX.Element {
    return (
        <button onClick={() => spec.run()} disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                fontSize: 11, padding: "2px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
                border: "1px solid var(--border-default)", background: "none", color: "var(--text-secondary)",
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
            }}>
            {spec.label ?? spec.name}
        </button>
    );
}

/** 판의 판형 — 열기 트리거(`요약 ▾`). label = 짧은 값 요약("3개"), 없으면 「열기」. 켜짐(on)은 색으로. */
function BoardPopoverOpener({ spec }: { spec: PopoverSpec }): JSX.Element {
    const active = spec.on === true;
    const color = spec.activeColor ?? "var(--accent-primary)";
    return (
        <TriggerPopover
            width={spec.width}
            trigger={(open, toggle) => (
                <button onClick={toggle} disabled={spec.disabled} title={spec.help ?? spec.name}
                    style={{
                        fontSize: 11, padding: "2px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
                        border: `1px solid ${active ? color : "var(--border-default)"}`, background: open ? "var(--bg-tertiary)" : "none",
                        color: active ? color : "var(--text-secondary)", fontWeight: active ? 600 : 400,
                        cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
                    }}>
                    {spec.label ?? "열기"} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>▾</span>
                </button>
            )}
        >
            {(close) => spec.renderPopover(close)}
        </TriggerPopover>
    );
}

/**
 * 판형 호출의 속 — 단축키(anchor = 모음 버튼)가 판을 열 때도 **입구에서 여는 것과 같은 내용**이어야
 * 학습이 한 벌이다. popover 컨트롤은 자기 renderPopover, 긴 택1(>3)은 고르기 메뉴.
 */
export function popoverContentOf(spec: ControlSpec, close: () => void): ReactNode {
    if (spec.kind === "popover") return spec.renderPopover(close);
    if (spec.kind === "choice") return <ChoiceMenu spec={spec} close={close} />;
    return null;
}

/** 판형 컨트롤의 판 폭(단축키 호스트가 같은 값을 쓴다). */
export function popoverWidthOf(spec: ControlSpec): number | undefined {
    if (spec.kind === "popover") return spec.width;
    if (spec.kind === "choice") return 150;
    return undefined;
}

/** 지우기·원위치 류 — 켜짐이 없으니 늘 같은 무게다(폭도 자연히 안 변한다). */
function ActionControl({ spec }: { spec: ActionSpec }): JSX.Element {
    return (
        <button onClick={() => spec.run()} disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                border: "none", background: "none", padding: "0 3px", fontSize: 11, fontWeight: 400,
                color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0,
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
            }}>
            {spec.label ?? spec.name}
        </button>
    );
}

/** on/off — 켜지면 굵어진다. 굵은 사본을 깔아 폭을 미리 먹인다(WidthLock 머리 주석). */
function ToggleControl({ spec }: { spec: ToggleSpec }): JSX.Element {
    const label = spec.label ?? spec.name;
    return (
        <WidthLock alts={[<b key="b" style={{ fontWeight: 700 }}>{label}</b>]}>
            <TextToggle active={spec.on} disabled={spec.disabled ?? false} onClick={() => spec.set(!spec.on)}
                activeColor={spec.activeColor} title={spec.help ?? spec.name}>
                {label}
            </TextToggle>
        </WidthLock>
    );
}

/** 택1(≤3) — 누르면 다음 값. 판이 안 열리고 자리도 안 변한다. 다음 값은 툴팁이 말한다. */
function CycleControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const cur = spec.values.find((o) => o.v === spec.value) ?? spec.values[0]!;
    const next = nextChoice(spec);
    return (
        <WidthLock alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ⇄</span>)}>
            <button onClick={() => spec.set(next.v)}
                title={`${spec.help ?? spec.name} · 클릭 = ${next.label}`}
                style={{ ...faceButton, ...face, ...(cur.color !== undefined ? { color: cur.color } : null) }}>
                {cur.label} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>⇄</span>
            </button>
        </WidthLock>
    );
}

/** 택1(4개 이상) — 순환으로는 못 되돌린다. 판을 열어 곧장 고른다(단축키도 같은 판 — invoke "popover"). */
function PickControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const cur = spec.values.find((o) => o.v === spec.value);
    return (
        <TriggerPopover
            width={popoverWidthOf(spec)}
            trigger={(open, toggle) => (
                <WidthLock max={TRIGGER_MAX_W} alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ▾</span>)}>
                    <button onClick={toggle} title={spec.help ?? spec.name}
                        style={{
                            ...faceButton, ...face,
                            color: open ? "var(--accent-primary)" : "var(--text-primary)",
                            overflow: "hidden", textOverflow: "ellipsis", display: "block", width: "100%",
                        }}>
                        {cur?.label ?? "—"} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>▾</span>
                    </button>
                </WidthLock>
            )}
        >
            {(close) => <ChoiceMenu spec={spec} close={close} />}
        </TriggerPopover>
    );
}

function ChoiceMenu({ spec, close }: { spec: ChoiceSpec; close: () => void }): JSX.Element {
    return (
        <div style={{ overflowY: "auto", padding: MENU_PAD }}>
            {spec.values.map((o) => (
                <MenuItem key={o.v} mark="radio" on={o.v === spec.value} selected={o.v === spec.value}
                    onClick={() => { spec.set(o.v); close(); }}>
                    {o.label}
                </MenuItem>
            ))}
        </div>
    );
}

/**
 * 판을 여는 컨트롤 — 내용(renderPopover)은 컨트롤 것, 껍데기(닫힘·스택·flip·배치)는 팝오버 공용층 것.
 * 얼굴은 켜짐 칩(토글과 같은 결): `on` 이 없으면 판 열림이 곧 켜짐이다.
 */
function PopoverControl({ spec }: { spec: PopoverSpec }): JSX.Element {
    const label = spec.label ?? spec.name;
    return (
        <TriggerPopover
            width={spec.width}
            trigger={(open, toggle) => (
                <WidthLock alts={[<b key="b" style={{ fontWeight: 700 }}>{label}</b>]}>
                    <TextToggle active={spec.on ?? open} disabled={spec.disabled ?? false} onClick={toggle}
                        activeColor={spec.activeColor} title={spec.help ?? spec.name}>
                        {label}
                    </TextToggle>
                </WidthLock>
            )}
        >
            {(close) => spec.renderPopover(close)}
        </TriggerPopover>
    );
}

/**
 * 폭 잠금 — 있을 수 있는 **모든 모습을 같은 칸에 겹쳐 쌓고** 지금 것만 보인다. 칸은 제일 넓은 것에
 * 맞춰지므로 값이 바뀌어도 1px 도 안 움직인다.
 *
 * ⚠ 숨기는 건 `visibility` 다(`display:none` 이 아니라) — 안 그리면 자리도 안 먹어 예약이 무의미해진다.
 */
export function WidthLock({ alts, max, children }: { alts: readonly ReactNode[]; max?: number; children: ReactNode }): JSX.Element {
    return (
        <span style={{ display: "inline-grid", flexShrink: 0, maxWidth: max, overflow: "hidden", textAlign: "center" }}>
            {alts.map((a, i) => (
                <span key={i} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}>{a}</span>
            ))}
            {/* 지금 값은 칸 **가운데** — 칸이 제일 긴 값에 맞춰져 있어 왼쪽에 붙이면 짧은 값일 때
                오른쪽에 빈자리가 몰려 보인다. 이웃은 어느 쪽이든 안 움직인다(칸 폭 고정). */}
            <span style={{ gridArea: "1 / 1", minWidth: 0, whiteSpace: "nowrap" }}>{children}</span>
        </span>
    );
}

/**
 * 값을 말하는 글자(순환·판 트리거) — **켜진 토글과 같은 결**(11px / 700 / text-primary).
 * 값을 고른 상태라는 점이 활성 토글과 같으므로 무게도 같아야 한다.
 *
 * ⚠ 여기에 `font` 단축 속성을 절대 섞지 말 것 — 스프레드 뒤의 `font` 가 크기·굵기를 통째로 되돌려
 *   순환 글자만 14px 로 커지고 폭 잠금까지 무력해진 사고가 있었다(커밋 1fb2aa4).
 */
const face: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" };
/** 버튼의 겉껍데기만 — 글자 속성은 face 가 **뒤에** 얹혀 이긴다. */
const faceButton: CSSProperties = { border: "none", background: "none", padding: 0, cursor: "pointer" };
