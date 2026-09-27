// 열린 판들의 스택 — "바깥을 누르면 닫힌다"·"Esc 는 맨 위 하나"의 **단일 주인**.
//
// 예전엔 판마다 제 리스너를 달았고, 판 안에서 판을 여는 중첩이 생길 때마다 땜질이 하나씩 늘었다
// (DOM 표식으로 "다른 판 안"을 거르기, Esc 를 캡처로 가로채 부모가 같이 닫히는 걸 막기, 자식 판을
// 부모 DOM 안에 욱여넣기). 여기서 한 번에 판정한다:
//
//   · **부모 사슬은 React 컨텍스트**(PopoverParent)로 안다 — 등록 순서가 아니다. effect 는 자식이
//     부모보다 먼저 돌아서, 한 커밋에 같이 열리면 등록 순서가 거꾸로다.
//   · 바깥 mousedown → 누른 곳을 품은 판과 그 조상만 남기고 나머지를 닫는다(자식부터).
//     **캡처 단계**로 듣는다: d3-zoom 은 stopImmediatePropagation, 차트·보드 요소 여럿이
//     stopPropagation 으로 mousedown 을 삼킨다 — 버블이면 그 위를 눌렀을 때 안 닫힌다.
//   · Esc → 자식이 없는 판 중 가장 늦게 연 하나만. **버블 단계 + defaultPrevented 존중**: 인라인
//     입력(이름 고치기 등)이 Esc 를 먹으면(stopPropagation/preventDefault) 판째 닫히면 안 된다.
//     캡처로 들으면 입력보다 먼저 받아 그 규칙이 통째로 깨진다.
//   · 막 연 판은 한 매크로태스크 뒤에 무장한다 — 이 판을 **연 그 클릭**이 아직 전파 중일 수 있어,
//     즉시 무장하면 자기를 연 클릭이 곧바로 자기를 닫는다.
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface Entry {
    id: number;
    parent: number | null;
    seq: number;
    armed: boolean;
    /** 이 판의 "안" — 판 표면 + (트리거 판이면) 트리거. 이 안의 mousedown 은 바깥이 아니다. */
    inside: () => (Element | null | undefined)[];
    /** 닫기 직전 포커스를 풀 범위(판 표면). */
    surface: () => Element | null | undefined;
    close: () => void;
}

const entries = new Map<number, Entry>();
let nextId = 0;
let nextSeq = 0;

const PopoverParent = createContext<number | null>(null);
export const PopoverParentProvider = PopoverParent.Provider;

const depth = (e: Entry): number => {
    let d = 0;
    for (let p = e.parent; p !== null; p = entries.get(p)?.parent ?? null) d++;
    return d;
};

/**
 * 판 하나를 닫는다 — 닫기 직전에 판 안의 포커스를 blur 한다. 숫자 칸처럼 **blur 로 값을 커밋**하는
 * 입력이 있어, 입력 중 바깥을 눌러 판이 사라지면 그 값이 조용히 증발했다(편집기들이 각자 막던 것).
 */
function closeEntry(e: Entry): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && e.surface()?.contains(active)) active.blur();
    e.close();
}

const onMouseDown = (ev: MouseEvent): void => {
    const t = ev.target;
    const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
    const keep = new Set<number>();
    for (const e of entries.values()) {
        if (!el || !e.inside().some((x) => x?.contains(el))) continue;
        for (let id: number | null = e.id; id !== null && !keep.has(id); id = entries.get(id)?.parent ?? null) keep.add(id);
    }
    const doomed = [...entries.values()].filter((e) => e.armed && !keep.has(e.id)).sort((a, b) => depth(b) - depth(a));
    for (const e of doomed) closeEntry(e);
};

const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Escape" || ev.defaultPrevented) return;
    const parents = new Set([...entries.values()].map((e) => e.parent));
    let top: Entry | null = null;
    for (const e of entries.values()) if (!parents.has(e.id) && (!top || e.seq > top.seq)) top = e;
    if (top) closeEntry(top);
};

function register(e: Entry): () => void {
    if (entries.size === 0) {
        document.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("keydown", onKeyDown);
    }
    entries.set(e.id, e);
    const t = setTimeout(() => { e.armed = true; }, 0);
    return () => {
        clearTimeout(t);
        entries.delete(e.id);
        if (entries.size === 0) {
            document.removeEventListener("mousedown", onMouseDown, true);
            document.removeEventListener("keydown", onKeyDown);
        }
    };
}

/**
 * 판을 스택에 올린다(열려 있는 동안). 반환값은 이 판의 id — 판 내용을 `PopoverParentProvider` 로
 * 감싸 그 안에서 열리는 판의 부모가 되게 한다(portal 을 건너도 컨텍스트는 흐른다).
 */
export function usePopoverLayer({ surfaceRef, insideRefs = [], onClose }: {
    surfaceRef: RefObject<Element | null>;
    insideRefs?: RefObject<Element | null>[];
    onClose: () => void;
}): { id: number; close: () => void } {
    const [id] = useState(() => ++nextId);
    const parent = useContext(PopoverParent);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const insideRef = useRef(insideRefs);
    insideRef.current = insideRefs;
    const entryRef = useRef<Entry | null>(null);

    useLayoutEffect(() => {
        const e: Entry = {
            id, parent, seq: ++nextSeq, armed: false,
            inside: () => [surfaceRef.current, ...insideRef.current.map((r) => r.current)],
            surface: () => surfaceRef.current,
            close: () => closeRef.current(),
        };
        entryRef.current = e;
        const off = register(e);
        return () => {
            entryRef.current = null;
            off();
        };
    }, [id, parent, surfaceRef]);

    // 스택 경로(바깥·Esc)와 같은 닫기 — 탈착 감지처럼 판 쪽에서 닫을 때도 blur 규칙을 탄다.
    const close = useRef(() => {
        if (entryRef.current) closeEntry(entryRef.current);
        else closeRef.current();
    }).current;
    return { id, close };
}
