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
import { useCallback, useMemo, type CSSProperties, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HeaderPopover } from "./HeaderPopover.js";
import { TextToggle } from "./ControlChrome.js";
import { DotsIcon } from "./icons.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
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

/** 순환으로 그릴 최대 값 수 — 넘으면 팝오버(한 바퀴가 길어지면 되돌리기가 못 견딘다). */
const CYCLE_MAX = 3;
/** 팝오버 트리거 글자의 상한 — 넘치면 … 로 자른다(값 하나가 길다고 줄 전체가 밀리지 않게). */
const TRIGGER_MAX_W = 96;

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
    /** 핀·순서의 영속 키 — 패널 **종류** 단위(예: wb.headerPins.skeleton.daily). */
    storageKey: string;
}): JSX.Element {
    const [pins, setPins] = usePersistedState<PinState>(storageKey, parsePins, EMPTY_PINS);
    const wheelRef = useHorizontalWheel<HTMLDivElement>();

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
            <div ref={wheelRef} className="no-scrollbar"
                style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", minWidth: 0 }}>
                {shown.map((c) => <ControlValue key={c.id} spec={c} />)}
            </div>
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

// ── 핀·순서의 영속 ──────────────────────────────────────────────────────────
/**
 * 저장하는 건 **예외뿐**이다: 언핀 목록(핀이 기본)과 손이 바꾼 순서. 그래야 나중에 추가된 컨트롤이
 * "목록에 없다"는 이유로 숨거나 맨 뒤로 밀리지 않는다 — 모르는 것은 코드가 말하게 둔다.
 */
interface PinState {
    unpinned: readonly string[];
    order: readonly string[];
}
const EMPTY_PINS: PinState = { unpinned: [], order: [] };

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** 옛 형식(언핀 배열만)도 읽는다 — 순서 기능이 붙기 전에 꽂아 둔 핀이 초기화되지 않게. */
function parsePins(raw: unknown): PinState | null {
    if (isIds(raw)) return { unpinned: raw, order: [] };
    if (raw && typeof raw === "object") {
        const o = raw as { unpinned?: unknown; order?: unknown };
        if (isIds(o.unpinned) || isIds(o.order)) {
            return { unpinned: isIds(o.unpinned) ? o.unpinned : [], order: isIds(o.order) ? o.order : [] };
        }
    }
    return null;
}

/**
 * 저장된 순서를 지금 컨트롤 목록에 씌운다.
 *  · 저장에 있고 지금도 있는 것 → 저장된 순서대로
 *  · 저장에 **없는 것**(새로 생긴 컨트롤) → 맨 뒤가 아니라 **선언에서 바로 앞에 있던 이웃 뒤**에.
 *    맨 뒤로 던지면 새 컨트롤이 늘 낯선 자리에 나타나고, 선언 순서가 가진 뜻(비슷한 것끼리 이웃)이 죽는다.
 *  · 저장에만 있고 지금 없는 것(사라진 컨트롤·다른 grain) → 조용히 무시. 지우지는 않는다 —
 *    일봉/분봉처럼 available 로 갈리는 패널에서 저쪽 순서를 날려 버리면 안 된다.
 */
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
    if (order.length === 0) return [...items];
    const byId = new Map(items.map((i) => [i.id, i]));
    const out = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
    const placed = new Set(out.map((x) => x.id));

    // 선언 순서로 훑는다 — 새 것이 여럿이면 앞의 새 것이 뒤의 새 것에게 다시 이웃이 된다.
    items.forEach((it, i) => {
        if (placed.has(it.id)) return;
        let at = 0;
        for (let k = i - 1; k >= 0; k--) {
            const idx = out.findIndex((x) => x.id === items[k]!.id);
            if (idx >= 0) { at = idx + 1; break; }
        }
        out.splice(at, 0, it);
        placed.add(it.id);
    });
    return out;
}

/** 더보기 판 — 이름·설명이 사는 유일한 자리. 값 컨트롤은 **헤더와 같은 형태**를 쓴다(학습이 한 벌). */
function ControlSheet({ controls, unpinned, onTogglePin, onReorder }: {
    controls: readonly ControlSpec[];
    unpinned: ReadonlySet<string>;
    onTogglePin: (id: string) => void;
    onReorder: (ids: readonly string[]) => void;
}): JSX.Element {
    const ids = controls.map((c) => c.id);
    // 손잡이(⠿)로만 끈다 — 줄 아무 데나 잡히면 값 컨트롤·핀을 누르려다 판이 흔들린다.
    const sensors = useSensors(useSensor(PointerSensor));
    const onDragEnd = ({ active, over }: DragEndEvent): void => {
        if (!over || active.id === over.id) return;
        onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
    };
    return (
        <div style={{ overflowY: "auto", fontSize: 11 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    {controls.map((c) => (
                        <SheetRow key={c.id} spec={c} pinned={!unpinned.has(c.id)} onTogglePin={onTogglePin} />
                    ))}
                </SortableContext>
            </DndContext>
        </div>
    );
}

/**
 * 판의 한 줄 — 손잡이 · 이름(갈래 접두) · 설명 · 값 · 핀.
 * **판의 줄 순서 = 헤더의 순서**라 드래그가 눈에 보이는 그대로다(섹션 제목이 없는 이유이기도 하다:
 * 순서를 손이 정하면 섹션은 흩어지고, 그럼 "섹션을 넘는 드래그는 갈래를 바꾸나?"라는 규칙이 하나 더 는다).
 */
function SheetRow({ spec, pinned, onTogglePin }: {
    spec: ControlSpec;
    pinned: boolean;
    onTogglePin: (id: string) => void;
}): JSX.Element {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: spec.id });
    return (
        <div ref={setNodeRef} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
            transform: CSS.Transform.toString(transform), transition,
            background: isDragging ? "var(--bg-secondary)" : undefined,
            position: "relative", zIndex: isDragging ? 1 : undefined,
        }}>
            <span {...attributes} {...listeners} aria-label="순서 바꾸기" title="끌어서 순서 바꾸기"
                style={{ display: "inline-flex", color: "var(--border-strong)", cursor: "grab", flexShrink: 0, touchAction: "none" }}>
                <GripIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                {/* 갈래는 섹션 제목이 아니라 **이름 앞**에 붙는다 — 줄이 흩어져도 소속이 따라다닌다. */}
                {spec.group !== undefined && (
                    <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{spec.group} </span>
                )}
                <span style={{ color: "var(--text-primary)" }}>{spec.name}</span>
                {spec.help !== undefined && (
                    <>
                        <br />
                        <span style={{ color: "var(--text-tertiary)" }}>{spec.help}</span>
                    </>
                )}
            </span>
            <ControlValue spec={spec} />
            <button onClick={() => onTogglePin(spec.id)}
                title={pinned ? "헤더에서 내린다(여기서는 계속 쓸 수 있다)" : "헤더에 올린다"}
                aria-label={pinned ? "헤더에서 내리기" : "헤더에 올리기"}
                style={{
                    border: "none", background: "none", padding: "0 2px", cursor: "pointer", lineHeight: 0,
                    color: pinned ? "var(--accent-primary)" : "var(--border-strong)", flexShrink: 0,
                }}>
                <PinIcon filled={pinned} />
            </button>
        </div>
    );
}

/** 컨트롤 하나의 **손잡이** — 헤더와 판이 같은 것을 쓴다(라벨·설명만 판에 더 붙는다). */
function ControlValue({ spec }: { spec: ControlSpec }): JSX.Element {
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
                color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0,
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
        <WidthLock alts={spec.values.map((o) => <span key={o.v} style={face}>{o.label} ⇄</span>)}>
            <button onClick={() => spec.set(next.v)}
                title={`${spec.help ?? spec.name} · 클릭 = ${next.label}`}
                style={{ ...faceButton, ...face }}>
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
                            color: open ? "var(--accent-primary)" : "var(--text-primary)",
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

function GripIcon(): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {[8, 16].map((x) => [7, 12, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
        </svg>
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
