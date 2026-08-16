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
//
// ## 핀
// 핀 = "헤더에 올린다". 저장은 **언핀 목록**으로 한다(핀 목록이 아니라) — 그래야 나중에 추가된
// 컨트롤이 목록에 없다는 이유로 숨겨지지 않는다. 새 컨트롤은 언제나 기본 핀이다.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { HeaderPopover } from "./HeaderPopover.js";
import { Sep, TextToggle } from "./ControlChrome.js";
import { DotsIcon } from "./icons.js";
import { usePersistedState } from "../store/persist.js";

interface ControlBase {
    /**
     * 영속 단위 — 언핀 목록에 적히는 이름. ⚠ 바꾸면 그 컨트롤의 핀 설정이 초기화된다(기본 핀으로 돌아간다).
     */
    id: string;
    /** 더보기 판의 이름. 헤더에는 안 나온다(규약 ①). */
    name: string;
    /** 더보기 판의 한 줄 설명 — 헤더 툴팁으로도 쓰인다. */
    help?: string;
    /** 묶음 — 판의 섹션 제목이자, 헤더에서 Sep 이 들어갈 자리. */
    group?: string;
    /**
     * 이 패널에 **있는** 컨트롤인가(기본 true). grain 처럼 패널 정체성으로 갈리는 분기를 데이터로 흡수한다 —
     * 값에 따라 켜고 끄는 용도가 아니다(그러면 자리가 출렁인다).
     */
    available?: boolean;
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

export type ControlSpec = ToggleSpec | ChoiceSpec;

/** 순환으로 그릴 최대 값 수 — 넘으면 팝오버(한 바퀴가 길어지면 되돌리기가 못 견딘다). */
const CYCLE_MAX = 3;
/** 팝오버 트리거 글자의 상한 — 넘치면 … 로 자른다(값 하나가 길다고 줄 전체가 밀리지 않게). */
const TRIGGER_MAX_W = 96;

/**
 * 머리글 컨트롤 줄 — 핀 꽂힌 것을 라벨 없이 늘어놓고, 끝에 더보기(⋯)를 둔다.
 * ⋯ 옆 숫자 = 접어 둔 개수(숨겼다는 사실 자체를 드러낸다). 0이면 숫자를 안 적는다.
 */
export function HeaderControls({ controls, storageKey }: {
    controls: readonly ControlSpec[];
    /** 언핀 목록의 영속 키 — 패널 **종류** 단위(예: wb.headerPins.skeleton.daily). */
    storageKey: string;
}): JSX.Element {
    const [unpinned, setUnpinned] = usePersistedState<readonly string[]>(
        storageKey,
        (raw) => (Array.isArray(raw) && raw.every((s) => typeof s === "string") ? (raw as string[]) : null),
        [],
    );
    const here = useMemo(() => controls.filter((c) => c.available !== false), [controls]);
    const unpinnedSet = useMemo(() => new Set(unpinned), [unpinned]);
    const pinned = here.filter((c) => !unpinnedSet.has(c.id));
    const foldedCount = here.length - pinned.length;

    const togglePin = (id: string): void =>
        setUnpinned((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

    return (
        <>
            {pinned.map((c, i) => (
                <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {/* 묶음이 갈리는 자리에만 Sep — 묶음은 판의 섹션 제목과 같은 것이다. */}
                    {i > 0 && pinned[i - 1]!.group !== c.group && <Sep />}
                    <ControlValue spec={c} />
                </span>
            ))}
            <HeaderPopover
                width={330}
                trigger={(open, toggle) => (
                    <button onClick={toggle} title="컨트롤 전부 보기 · 헤더에 올릴 것 고르기"
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                            border: "none", background: "none", padding: "0 2px", cursor: "pointer",
                            font: "inherit", fontSize: 11, lineHeight: 0,
                            color: open ? "var(--text-primary)" : "var(--text-tertiary)",
                        }}>
                        <DotsIcon />
                        {foldedCount > 0 && <span style={{ lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{foldedCount}</span>}
                    </button>
                )}
            >
                {() => <ControlSheet controls={here} unpinned={unpinnedSet} onTogglePin={togglePin} />}
            </HeaderPopover>
        </>
    );
}

/** 더보기 판 — 이름·설명이 사는 유일한 자리. 값 컨트롤은 **헤더와 같은 형태**를 쓴다(학습이 한 벌). */
function ControlSheet({ controls, unpinned, onTogglePin }: {
    controls: readonly ControlSpec[];
    unpinned: ReadonlySet<string>;
    onTogglePin: (id: string) => void;
}): JSX.Element {
    return (
        <div style={{ overflowY: "auto", fontSize: 11 }}>
            {controls.map((c, i) => {
                const newGroup = i === 0 || controls[i - 1]!.group !== c.group;
                const pinned = !unpinned.has(c.id);
                return (
                    <div key={c.id}>
                        {newGroup && c.group !== undefined && (
                            <div style={sheetHead}>{c.group}</div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px" }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ color: "var(--text-primary)" }}>{c.name}</span>
                                {c.help !== undefined && (
                                    <>
                                        <br />
                                        <span style={{ color: "var(--text-tertiary)" }}>{c.help}</span>
                                    </>
                                )}
                            </span>
                            <ControlValue spec={c} />
                            <button onClick={() => onTogglePin(c.id)}
                                title={pinned ? "헤더에서 내린다(여기서는 계속 쓸 수 있다)" : "헤더에 올린다"}
                                aria-label={pinned ? "헤더에서 내리기" : "헤더에 올리기"}
                                style={{
                                    border: "none", background: "none", padding: "0 2px", cursor: "pointer", lineHeight: 0,
                                    color: pinned ? "var(--accent-primary)" : "var(--border-strong)", flexShrink: 0,
                                }}>
                                <PinIcon filled={pinned} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** 컨트롤 하나의 **손잡이** — 헤더와 판이 같은 것을 쓴다(라벨·설명만 판에 더 붙는다). */
function ControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
    if (spec.kind === "toggle") return <ToggleControl spec={spec} />;
    return spec.values.length <= CYCLE_MAX ? <CycleControl spec={spec} /> : <PickControl spec={spec} />;
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
                activeColor={spec.activeColor} title={spec.help ?? spec.name}>
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
        <WidthLock alts={spec.values.map((o) => <span key={o.v} style={cycleFace}>{o.label} ⇄</span>)}>
            <button onClick={() => spec.set(next.v)}
                title={`${spec.help ?? spec.name} · 클릭 = ${next.label}`}
                style={{ ...cycleFace, border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11 }}>
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
            trigger={(open, toggle) => (
                <WidthLock max={TRIGGER_MAX_W} alts={spec.values.map((o) => <span key={o.v} style={cycleFace}>{o.label} ▾</span>)}>
                    <button onClick={toggle} title={spec.help ?? spec.name}
                        style={{
                            ...cycleFace, border: "none", background: "none", padding: 0, cursor: "pointer",
                            font: "inherit", fontSize: 11, color: open ? "var(--accent-primary)" : "var(--text-primary)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textAlign: "left",
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
        <span style={{ display: "inline-grid", flexShrink: 0, maxWidth: max, overflow: "hidden" }}>
            {alts.map((a, i) => (
                <span key={i} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}>{a}</span>
            ))}
            <span style={{ gridArea: "1 / 1", minWidth: 0, whiteSpace: "nowrap" }}>{children}</span>
        </span>
    );
}

function PinIcon({ filled }: { filled: boolean }): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
    );
}

const cycleFace: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" };
const sheetHead: CSSProperties = {
    padding: "5px 10px 3px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)",
    background: "var(--bg-secondary)", borderTop: "1px solid var(--border-default)",
};
