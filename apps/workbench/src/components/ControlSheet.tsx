// 더보기(⋯) 판 — 이름·설명이 사는 유일한 자리. 값 컨트롤은 **헤더와 같은 형태**를 쓴다(학습이 한 벌).
// 핀·순서를 만지는 판이지 저장은 안 한다 — 영속은 HeaderControls(headerPins)가 든다.
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ControlValue } from "./controlWidgets.js";
import type { ControlSpec } from "./HeaderControls.js";

export function ControlSheet({ controls, unpinned, onTogglePin, onReorder }: {
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
