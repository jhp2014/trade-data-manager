"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { NodePositions } from "@/lib/graphPositions";

/** 이름과 함께 저장한 그래프 레이아웃 한 건. localStorage 에만 보관(서버 무관). */
export type SavedLayout = { name: string; positions: NodePositions; savedAt: number };

const KEY = "hyplab.savedLayouts";

// 모듈 레벨 공유 스토어. 같은 탭의 모든 useSavedLayouts 인스턴스가 한 캐시를
// 구독하므로, 저장/삭제가 즉시 전파된다. 캐시 참조는 변경 시에만 새로 만들어
// getSnapshot 안정성을 유지(useSavedFilters 와 동일 패턴).
let cache: SavedLayout[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: SavedLayout[] = [];

function read(): SavedLayout[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return EMPTY;
        const arr: unknown = JSON.parse(raw);
        if (!Array.isArray(arr)) return EMPTY;
        return arr.filter(
            (x): x is SavedLayout =>
                !!x &&
                typeof (x as SavedLayout).name === "string" &&
                typeof (x as SavedLayout).savedAt === "number" &&
                !!(x as SavedLayout).positions &&
                typeof (x as SavedLayout).positions === "object",
        );
    } catch {
        return EMPTY;
    }
}

function snapshot(): SavedLayout[] {
    if (cache === null) cache = read();
    return cache;
}

function emit() {
    for (const l of listeners) l();
}

function persist(next: SavedLayout[]) {
    cache = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // 용량 초과·프라이빗 모드 등 — 조용히 무시.
    }
    emit();
}

let storageBound = false;
function subscribe(cb: () => void) {
    listeners.add(cb);
    // 다른 탭에서의 변경 반영(탭당 한 번만 바인딩).
    if (!storageBound && typeof window !== "undefined") {
        storageBound = true;
        window.addEventListener("storage", (e) => {
            if (e.key === KEY) {
                cache = read();
                emit();
            }
        });
    }
    return () => {
        listeners.delete(cb);
    };
}

/**
 * 이름 저장 그래프 레이아웃 목록을 localStorage 와 동기화한다. 같은 이름이면
 * 덮어쓰며 최신 항목을 맨 앞에 둔다(목록은 최신순). 같은 탭의 모든 인스턴스가
 * 공유 스토어를 구독하므로 저장/삭제가 즉시 전파된다.
 */
export function useSavedLayouts() {
    const layouts = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

    const save = useCallback((name: string, positions: NodePositions) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const prev = snapshot();
        persist([
            { name: trimmed, positions, savedAt: Date.now() },
            ...prev.filter((l) => l.name !== trimmed),
        ]);
    }, []);

    const remove = useCallback((name: string) => {
        const prev = snapshot();
        persist(prev.filter((l) => l.name !== name));
    }, []);

    return { layouts, save, remove };
}
