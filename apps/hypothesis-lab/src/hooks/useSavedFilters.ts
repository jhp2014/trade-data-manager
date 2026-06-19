"use client";

import { useCallback, useSyncExternalStore } from "react";

/** 저장된 불리언 필터 한 건. localStorage 에만 보관(서버 무관). */
export type SavedFilter = { name: string; expr: string; savedAt: number };

const KEY = "hyplab.savedFilters";

// 모듈 레벨 공유 스토어. 같은 탭의 모든 useSavedFilters 인스턴스가 한 캐시를
// 구독하므로, 한 곳에서 저장/삭제하면 즉시 모두 갱신된다(저장 직후 불러오기
// 버튼이 바로 활성화). 캐시 참조는 변경 시에만 새로 만들어 getSnapshot 안정성 유지.
let cache: SavedFilter[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: SavedFilter[] = [];

function read(): SavedFilter[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return EMPTY;
        const arr: unknown = JSON.parse(raw);
        if (!Array.isArray(arr)) return EMPTY;
        return arr.filter(
            (x): x is SavedFilter =>
                !!x &&
                typeof (x as SavedFilter).name === "string" &&
                typeof (x as SavedFilter).expr === "string" &&
                typeof (x as SavedFilter).savedAt === "number",
        );
    } catch {
        return EMPTY;
    }
}

function snapshot(): SavedFilter[] {
    if (cache === null) cache = read();
    return cache;
}

function emit() {
    for (const l of listeners) l();
}

function persist(next: SavedFilter[]) {
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
 * 저장된 불리언 필터 목록을 localStorage 와 동기화한다. 저장은 같은 이름이면
 * 덮어쓰며 최신 항목을 맨 앞에 둔다(목록은 최신순). 같은 탭의 모든 인스턴스가
 * 공유 스토어를 구독하므로 저장/삭제가 즉시 전파된다.
 */
export function useSavedFilters() {
    const filters = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

    const save = useCallback((name: string, expr: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const prev = snapshot();
        persist([
            { name: trimmed, expr, savedAt: Date.now() },
            ...prev.filter((f) => f.name !== trimmed),
        ]);
    }, []);

    const remove = useCallback((name: string) => {
        const prev = snapshot();
        persist(prev.filter((f) => f.name !== name));
    }, []);

    return { filters, save, remove };
}
