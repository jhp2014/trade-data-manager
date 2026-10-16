// 컨트롤 하나하나의 **손잡이** — 줄 위젯(ControlValue)과 판 위젯(BoardControlValue) 두 벌.
// workbench components/header/widgets.tsx 에서 옮겼다(검색칸을 더했다).
// 자리가 다르면 표기도 다르다: 줄은 폭이 귀해 글자 조작(순환·폭 잠금)이 서고, 판은 자리가 넉넉해
// 성격이 모양으로 보이는 조작(스위치·세그먼트·테두리 버튼)이 선다. 검색칸만 두 자리가 같은 위젯이다.
//
// ## 폭 잠금(WidthLock)
// 값이 갈리거나 활성이 굵어지는(700) 것만으로 글자 폭이 출렁여 이웃이 1~2px 밀린다. 모든 모습을
// 같은 칸에 겹쳐 쌓아 제일 긴 것으로 칸을 잡는다 — px 을 손으로 안 적으니 글꼴이 바뀌어도 맞는다.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TriggerPopover } from "../ui/popover/TriggerPopover.js";
import { MENU_PAD, MenuItem } from "../ui/popover/menu.js";
import type { ActionSpec, ChoiceSpec, ControlSpec, PopoverSpec, SearchSpec, ToggleSpec } from "./spec.js";

/** 줄에서 순환으로 다룰 최대 값 수 — 넘으면 고르기 판(한 바퀴가 길면 되돌리기가 못 견딘다). */
const CYCLE_MAX = 3;
/** 판에서 세그먼트로 세울 최대 값 수 — 넘으면 고르기 판(칸이 판 폭을 밀어낸다). */
const SEGMENT_MAX = 4;
/** 판 트리거 글자의 상한 — 넘치면 … 로 자른다(값 하나가 길다고 줄 전체가 밀리지 않게). */
const TRIGGER_MAX_W = 96;

/** 헤더 줄의 손잡이(renderLine 선언이 없을 때). */
export function ControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    switch (spec.kind) {
        case "toggle":
            return <ToggleControl spec={spec} />;
        case "action":
            return <ActionControl spec={spec} />;
        case "popover":
            return <PopoverControl spec={spec} />;
        case "search":
            return <SearchField spec={spec} wide={false} />;
        case "choice":
            return spec.values.length <= CYCLE_MAX ? <CycleControl spec={spec} /> : <PickControl spec={spec} />;
    }
}

/**
 * 판의 손잡이 — 성격이 모양으로 보인다: 토글 = 스위치 · 택1 = 세그먼트(값이 다 보이고 하나가 채워짐 —
 * 순환은 "다음이 뭔지 모른다"는 약점이 있어 자리가 있으면 세그먼트가 낫다) · 액션 = 테두리 버튼 ·
 * 판형 = 열기 트리거(▾) · 검색 = 줄과 같은 칸(남는 폭을 다 쓴다).
 */
export function BoardControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    switch (spec.kind) {
        case "toggle":
            return <SwitchControl spec={spec} />;
        case "action":
            return <BoardActionButton spec={spec} />;
        case "popover":
            return <BoardPopoverOpener spec={spec} />;
        case "search":
            return <SearchField spec={spec} wide />;
        case "choice":
            return spec.values.length <= SEGMENT_MAX ? <SegmentControl spec={spec} /> : <PickControl spec={spec} />;
    }
}

// ── 판 위젯 ───────────────────────────────────────────────────────────────────

/** 판의 토글 — 스위치(켜짐 = 트랙 채움). */
function SwitchControl({ spec }: { spec: ToggleSpec }): JSX.Element {
    const on = spec.on;
    return (
        <button
            role="switch" aria-checked={on} aria-label={spec.name} onClick={() => spec.set(!on)}
            disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                width: 26, height: 14, borderRadius: 7, border: "none", padding: 0, flexShrink: 0,
                background: on ? "var(--accent-primary)" : "var(--border-strong)", position: "relative",
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1, transition: "background 120ms ease",
            }}
        >
            <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: "#fff", transition: "left 120ms ease" }} />
        </button>
    );
}

/** 판의 택1 — 세그먼트. */
function SegmentControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    return (
        <span title={spec.help ?? spec.name} style={{ display: "inline-flex", flexShrink: 0, border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
            {spec.values.map((o) => {
                const on = o.v === spec.value;
                return (
                    <button
                        key={o.v}
                        onClick={() => spec.set(o.v)}
                        aria-pressed={on}
                        style={{
                            border: "none", cursor: "pointer", fontSize: 10.5, padding: "2px 8px", whiteSpace: "nowrap",
                            background: on ? "var(--accent-soft)" : "none", color: on ? "var(--accent-hover)" : "var(--text-tertiary)", fontWeight: on ? 600 : 400,
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </span>
    );
}

/** 판의 액션 — 테두리 버튼(누르면 일이 일어난다는 얼굴). 이름 자리가 곧 버튼이다(판이 같은 말을 두 번 하지 않게). */
export function BoardActionButton({ spec }: { spec: ActionSpec }): JSX.Element {
    return (
        <button
            onClick={() => spec.run()} disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                fontSize: 11, padding: "2px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
                border: "1px solid var(--border-default)", background: "none", color: "var(--text-secondary)",
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
            }}
        >
            {spec.label ?? spec.name}
        </button>
    );
}

/** 판의 판형 — 열기 트리거(`요약 ▾`). 판 안에서 또 판을 연다(중첩은 팝오버 스택이 판정한다). */
function BoardPopoverOpener({ spec }: { spec: PopoverSpec }): JSX.Element {
    return (
        <TriggerPopover
            width={spec.width}
            trigger={(open, toggle) => (
                <button
                    onClick={toggle} disabled={spec.disabled} title={spec.help ?? spec.name}
                    style={{
                        fontSize: 11, padding: "2px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
                        border: "1px solid var(--border-default)", background: open ? "var(--bg-tertiary)" : "none", color: "var(--text-secondary)",
                        cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
                    }}
                >
                    <span className="tabular">{spec.label ?? spec.name}</span> <span style={{ color: "var(--text-tertiary)" }}>▾</span>
                </button>
            )}
        >
            {(close) => spec.renderPopover(close)}
        </TriggerPopover>
    );
}

// ── 줄 위젯 ───────────────────────────────────────────────────────────────────

/** 해제·채우기 류 — 켜짐이 없으니 늘 같은 무게다(폭도 자연히 안 변한다). */
function ActionControl({ spec }: { spec: ActionSpec }): JSX.Element {
    return (
        <button
            onClick={() => spec.run()} disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                border: "none", background: "none", padding: "0 3px", fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0,
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
            }}
        >
            {spec.label ?? spec.name}
        </button>
    );
}

/** on/off — 켜지면 굵어진다. 굵은 사본을 깔아 폭을 미리 먹인다. */
function ToggleControl({ spec }: { spec: ToggleSpec }): JSX.Element {
    const label = spec.label ?? spec.name;
    return (
        <WidthLock alts={[<b key="b" style={{ fontWeight: 700 }}>{label}</b>]}>
            <TextToggle active={spec.on} disabled={spec.disabled ?? false} onClick={() => spec.set(!spec.on)} title={spec.help ?? spec.name}>
                {label}
            </TextToggle>
        </WidthLock>
    );
}

/** 택1(≤3) — 누르면 다음 값. 판이 안 열리고 자리도 안 변한다. 다음 값은 툴팁이 말한다. */
function CycleControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const idx = spec.values.findIndex((o) => o.v === spec.value);
    const cur = spec.values[Math.max(0, idx)]!;
    const next = spec.values[(idx + 1) % spec.values.length]!; // 지금 값이 목록에 없으면(-1) 첫 값부터
    return (
        <WidthLock alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ⇄</span>)}>
            <button onClick={() => spec.set(next.v)} title={`${spec.help ?? spec.name} · 클릭 = ${next.label}`} style={{ ...faceButton, ...face }}>
                {cur.label} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>⇄</span>
            </button>
        </WidthLock>
    );
}

/** 택1(줄 4개·판 5개 이상) — 순환·세그먼트로는 못 견딘다. 판을 열어 곧장 고른다. */
function PickControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const cur = spec.values.find((o) => o.v === spec.value);
    return (
        <TriggerPopover
            width={150}
            trigger={(open, toggle) => (
                <WidthLock max={TRIGGER_MAX_W} alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ▾</span>)}>
                    <button
                        onClick={toggle} title={spec.help ?? spec.name}
                        style={{ ...faceButton, ...face, color: open ? "var(--accent-primary)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", display: "block", width: "100%" }}
                    >
                        {cur?.label ?? "—"} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>▾</span>
                    </button>
                </WidthLock>
            )}
        >
            {(close) => (
                <div style={{ overflowY: "auto", padding: MENU_PAD }}>
                    {spec.values.map((o) => (
                        <MenuItem
                            key={o.v} mark="radio" on={o.v === spec.value} selected={o.v === spec.value}
                            onClick={() => {
                                spec.set(o.v);
                                close();
                            }}
                        >
                            {o.label}
                        </MenuItem>
                    ))}
                </div>
            )}
        </TriggerPopover>
    );
}

/** 판을 여는 컨트롤 — 얼굴은 켜짐 칩(토글과 같은 결): 판 열림이 곧 켜짐이다. */
function PopoverControl({ spec }: { spec: PopoverSpec }): JSX.Element {
    const label = spec.label ?? spec.name;
    return (
        <TriggerPopover
            width={spec.width}
            trigger={(open, toggle) => (
                <WidthLock alts={[<b key="b" style={{ fontWeight: 700 }}>{label}</b>]}>
                    <TextToggle active={open} disabled={spec.disabled ?? false} onClick={toggle} title={spec.help ?? spec.name}>
                        {label}
                    </TextToggle>
                </WidthLock>
            )}
        >
            {(close) => spec.renderPopover(close)}
        </TriggerPopover>
    );
}

// ── 검색칸 — 줄·판 공용 ─────────────────────────────────────────────────────────

/**
 * 입력칸 + 확정(Enter · 버튼). 줄에서는 고정 폭(줄 높이 24px 안에 들게 18px), 판에서는 남는 폭을 다 쓴다.
 * 칸이 친 글자를 들고 있고, 바깥 값(value)이 바뀌면 그걸 따른다(종목명으로 채우기·확정 뒤 다듬은 값).
 */
export function SearchField({ spec, wide }: { spec: SearchSpec; wide: boolean }): JSX.Element {
    const [draft, setDraft] = useState(spec.value);
    useEffect(() => setDraft(spec.value), [spec.value]);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const keeps = spec.onDraft !== undefined; // 친 글자를 바깥에 남기는 칸 — 되돌리기가 없다(SearchSpec 주석)
    const can = spec.canSubmit !== false;
    const submit = (): void => {
        if (can) spec.submit(draft);
    };
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, ...(wide ? { flex: 1 } : { flexShrink: 0 }) }}>
            <input
                value={draft}
                placeholder={spec.placeholder}
                title={spec.help}
                onChange={(e) => {
                    setDraft(e.target.value);
                    spec.onDraft?.(e.target.value);
                }}
                ref={inputRef}
                // 되돌리기는 칸과 [검색] 을 **둘 다** 떠났을 때 — Tab 으로 버튼에 옮겨 가 누르면 친 글자로 확정돼야 한다.
                onBlur={keeps ? undefined : (e) => (buttonRef.current === null || e.relatedTarget !== buttonRef.current) && setDraft(spec.value)}
                onKeyDown={(e) => {
                    // 한글 조합 중의 Enter 는 건너뛴다 — 조합이 끝나며 Enter 가 한 번 더 와 덜 친 글자로 한 번 더 확정된다.
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                    else if (e.key === "Escape" && !keeps && draft !== spec.value) {
                        e.preventDefault(); // 되돌리기만 — 판 안이면 판까지 닫히지 않게(팝오버 스택이 defaultPrevented 를 존중한다)
                        setDraft(spec.value);
                    }
                }}
                style={{
                    ...(wide ? { flex: 1 } : { width: spec.width ?? 120 }), minWidth: 0, height: 18, boxSizing: "border-box",
                    padding: "0 5px", border: `1px solid ${spec.active ? "var(--accent-primary)" : "var(--border)"}`, borderRadius: 3, fontSize: 11, background: "var(--surface)",
                }}
            />
            {spec.button !== undefined && (
                <button
                    // 칸에서 포커스를 뺏지 않는다 — 뺏으면 blur 되돌리기(onDraft 없는 칸)가 클릭보다 먼저 와 옛 값으로 확정된다.
                    onMouseDown={(e) => e.preventDefault()}
                    ref={buttonRef}
                    onBlur={keeps ? undefined : (e) => e.relatedTarget !== inputRef.current && setDraft(spec.value)}
                    onClick={submit} disabled={!can} title={spec.help}
                    style={{
                        height: 18, boxSizing: "border-box", flexShrink: 0, whiteSpace: "nowrap", padding: "0 8px", fontSize: 11,
                        border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: can ? "pointer" : "default", opacity: can ? 1 : 0.5,
                    }}
                >
                    {spec.button}
                </button>
            )}
        </span>
    );
}

// ── 공용 조각 ─────────────────────────────────────────────────────────────────

/** 경량 글자 토글 — 활성 = 굵게 + 진한 색. 테두리·채움이 없어 줄에서 자리를 덜 먹는다. */
function TextToggle({ active, disabled, onClick, title, children }: { active: boolean; disabled: boolean; onClick: () => void; title: string; children: ReactNode }): JSX.Element {
    return (
        <button
            onClick={onClick} disabled={disabled} title={title}
            style={{
                border: "none", background: "none", padding: "0 3px", fontSize: 11, whiteSpace: "nowrap",
                fontWeight: active ? 700 : 400, color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
            }}
        >
            {children}
        </button>
    );
}

/**
 * 폭 잠금 — 있을 수 있는 **모든 모습을 같은 칸에 겹쳐 쌓고** 지금 것만 보인다. 칸은 제일 넓은 것에
 * 맞춰지므로 값이 바뀌어도 1px 도 안 움직인다.
 * ⚠ 숨기는 건 `visibility` 다(`display:none` 이 아니라) — 안 그리면 자리도 안 먹어 예약이 무의미해진다.
 */
export function WidthLock({ alts, max, children }: { alts: readonly ReactNode[]; max?: number; children: ReactNode }): JSX.Element {
    return (
        <span style={{ display: "inline-grid", flexShrink: 0, maxWidth: max, overflow: "hidden", textAlign: "center" }}>
            {alts.map((a, i) => (
                <span key={i} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}>
                    {a}
                </span>
            ))}
            {/* 지금 값은 칸 가운데 — 왼쪽에 붙이면 짧은 값일 때 오른쪽에 빈자리가 몰려 보인다. */}
            <span style={{ gridArea: "1 / 1", minWidth: 0, whiteSpace: "nowrap" }}>{children}</span>
        </span>
    );
}

/**
 * 값을 말하는 글자(순환·판 트리거) — 켜진 토글과 같은 결(11px / 700 / text-primary).
 * ⚠ 여기에 `font` 단축 속성을 섞지 말 것 — 스프레드 뒤의 `font` 가 크기·굵기를 통째로 되돌려 폭 잠금까지 무력해진다
 *   (workbench 에서 실제로 났다).
 */
const face: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" };
/** 버튼의 겉껍데기만 — 글자 속성은 face 가 **뒤에** 얹혀 이긴다. */
const faceButton: CSSProperties = { border: "none", background: "none", padding: 0, cursor: "pointer" };
