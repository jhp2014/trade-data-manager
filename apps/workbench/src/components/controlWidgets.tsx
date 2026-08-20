// 컨트롤 하나하나의 **손잡이들** — 헤더와 더보기 판이 같은 것을 쓴다(라벨·설명만 판에 더 붙는다).
// 선언(ControlSpec)은 HeaderControls 에, 그리는 규약(폭 잠금·순환/팝오버 갈림)은 여기에 산다.
import type { CSSProperties, ReactNode } from "react";
import { HeaderPopover } from "./HeaderPopover.js";
import { TextToggle } from "./ControlChrome.js";
import { FAIL } from "../styles/palette.js";
import type { ActionSpec, ChoiceSpec, ControlSpec, ToggleSpec } from "./HeaderControls.js";

/** 순환으로 그릴 최대 값 수 — 넘으면 팝오버(한 바퀴가 길어지면 되돌리기가 못 견딘다). */
const CYCLE_MAX = 3;
/** 팝오버 트리거 글자의 상한 — 넘치면 … 로 자른다(값 하나가 길다고 줄 전체가 밀리지 않게). */
const TRIGGER_MAX_W = 96;

/** 경고색으로 물들일까 — 없으면 undefined 라 각 손잡이의 원래 색이 그대로 산다. */
const toneColor = (spec: ControlSpec): string | undefined => (spec.tone === "warn" ? FAIL : undefined);

/** 컨트롤 하나의 **손잡이** — 헤더와 판이 같은 것을 쓴다(라벨·설명만 판에 더 붙는다). */
export function ControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    if (spec.kind === "toggle") return <ToggleControl spec={spec} />;
    if (spec.kind === "action") return <ActionControl spec={spec} />;
    return spec.values.length <= CYCLE_MAX ? <CycleControl spec={spec} /> : <PickControl spec={spec} />;
}

/** 지우기·새로고침 류 — 켜짐이 없으니 늘 같은 무게다(폭도 자연히 안 변한다). */
function ActionControl({ spec }: { spec: ActionSpec }): JSX.Element {
    return (
        <button onClick={(e) => spec.run(e)} disabled={spec.disabled} title={spec.help ?? spec.name}
            style={{
                border: "none", background: "none", padding: "0 3px", fontSize: 11, fontWeight: 400,
                color: toneColor(spec) ?? "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0,
                cursor: spec.disabled ? "default" : "pointer", opacity: spec.disabled ? 0.4 : 1,
            }}>
            {spec.label ?? spec.name}
        </button>
    );
}

/**
 * on/off — 켜지면 굵어진다. ⚠ 굵은 사본을 깔아 **폭을 미리 먹인다**: 굵기만으로도 글자 폭이 늘어
 * 뒤엣것이 밀리기 때문이다(규약 ②). 이건 이 앱의 모든 헤더가 조용히 앓던 증상이다.
 */
function ToggleControl({ spec }: { spec: ToggleSpec }): JSX.Element {
    const label = spec.label ?? spec.name;
    return (
        <WidthLock alts={[<b key="b" style={{ fontWeight: 700 }}>{label}</b>]}>
            <TextToggle active={spec.on} onClick={() => spec.set(!spec.on)}
                color={toneColor(spec)} activeColor={spec.activeColor} title={spec.help ?? spec.name}>
                {label}
            </TextToggle>
        </WidthLock>
    );
}

/** 택1(≤3) — 누르면 다음 값. 판이 안 열리고 자리도 안 변한다. 다음 값은 툴팁이 말한다. */
function CycleControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const idx = Math.max(0, spec.values.findIndex((o) => o.v === spec.value));
    const next = spec.values[(idx + 1) % spec.values.length]!;
    const cur = spec.values[idx]!;
    return (
        <WidthLock alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ⇄</span>)}>
            <button onClick={() => spec.set(next.v)}
                title={`${spec.help ?? spec.name} · 클릭 = ${next.label}`}
                style={{ ...faceButton, ...face, ...(toneColor(spec) !== undefined ? { color: toneColor(spec) } : null) }}>
                {cur.label} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>⇄</span>
            </button>
        </WidthLock>
    );
}

/** 택1(4개 이상) — 순환으로는 못 되돌린다. 판을 열어 곧장 고른다. */
function PickControl({ spec }: { spec: ChoiceSpec }): JSX.Element {
    const cur = spec.values.find((o) => o.v === spec.value);
    return (
        <HeaderPopover
            width={150}
            closeOnOutside
            trigger={(open, toggle) => (
                <WidthLock max={TRIGGER_MAX_W} alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ▾</span>)}>
                    <button onClick={toggle} title={spec.help ?? spec.name}
                        style={{
                            ...faceButton, ...face,
                            color: toneColor(spec) ?? (open ? "var(--accent-primary)" : "var(--text-primary)"),
                            overflow: "hidden", textOverflow: "ellipsis", display: "block", width: "100%",
                        }}>
                        {cur?.label ?? "—"} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>▾</span>
                    </button>
                </WidthLock>
            )}
        >
            {(close) => (
                <div style={{ overflowY: "auto", fontSize: 11 }}>
                    {spec.values.map((o) => (
                        <button key={o.v} onClick={() => { spec.set(o.v); close(); }}
                            style={{
                                display: "block", width: "100%", textAlign: "left", padding: "4px 9px",
                                border: "none", cursor: "pointer", font: "inherit", fontSize: 11,
                                background: o.v === spec.value ? "var(--bg-secondary)" : "transparent",
                                color: o.v === spec.value ? "var(--accent-primary)" : "var(--text-secondary)",
                                fontWeight: o.v === spec.value ? 700 : 400,
                            }}>
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </HeaderPopover>
    );
}

/**
 * 폭 잠금 — 있을 수 있는 **모든 모습을 같은 칸에 겹쳐 쌓고** 지금 것만 보인다. 칸은 제일 넓은 것에
 * 맞춰지므로 값이 바뀌어도 1px 도 안 움직인다. px 을 손으로 안 적으니 글자·폰트가 바뀌어도 따라온다.
 *
 * ⚠ 숨기는 건 `visibility` 다(`display:none` 이 아니라) — 안 그리면 자리도 안 먹어 예약이 무의미해진다.
 */
function WidthLock({ alts, max, children }: { alts: readonly ReactNode[]; max?: number; children: ReactNode }): JSX.Element {
    return (
        <span style={{ display: "inline-grid", flexShrink: 0, maxWidth: max, overflow: "hidden", textAlign: "center" }}>
            {alts.map((a, i) => (
                <span key={i} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}>{a}</span>
            ))}
            {/* 지금 값은 칸 **가운데**에 선다 — 칸이 제일 긴 값에 맞춰져 있어서 왼쪽에 붙이면 짧은 값일 때
                오른쪽에 빈자리가 몰려 보인다. 이웃은 어느 쪽이든 안 움직인다(칸 폭이 고정이므로). */}
            <span style={{ gridArea: "1 / 1", minWidth: 0, whiteSpace: "nowrap" }}>{children}</span>
        </span>
    );
}

/**
 * 값을 말하는 글자(순환·팝오버 트리거) — **켜진 토글과 같은 결**이다(11px / 700 / text-primary).
 * 값을 고른 상태라는 점이 활성 토글과 같으므로 무게도 같아야 한다.
 *
 * ⚠ 여기에 `font` 단축 속성을 절대 섞지 말 것. `{...face, font:"inherit"}` 처럼 쓰면 스프레드가
 *   `fontSize` 를 **앞자리**에 앉히고 뒤따르는 `font:inherit` 이 크기·굵기를 통째로 되돌린다(객체
 *   리터럴은 같은 키의 값만 덮고 자리는 안 옮긴다). 실제로 그렇게 순환 글자만 14px 로 커졌고,
 *   숨은 사본(11px)보다 넓어지는 바람에 폭 잠금까지 무력해졌다 — 증상 둘이 한 원인이었다.
 *   버튼의 기본 폰트는 전역 CSS(`button { font: inherit }`)가 이미 지우므로 인라인으로 쓸 일이 없다.
 */
const face: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" };
/** 버튼의 겉껍데기만 — 글자 속성은 face 가 **뒤에** 얹혀 이긴다. */
const faceButton: CSSProperties = { border: "none", background: "none", padding: 0, cursor: "pointer" };
