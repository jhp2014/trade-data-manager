// localStorage JSON 영속 공용 — 각 슬라이스가 try/catch·파싱·검증을 제각기 재현하지 않게 한 벌로.
// localStorage 부재(테스트 환경)·파싱 실패·이전 포맷은 조용히 null/무시 — 전부 클라 설정이라 손실 무해(기본값 재생).
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
export function loadJson<T>(key: string, parse: (raw: unknown) => T | null): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return parse(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* 영속 실패 무시 */
    }
}

/**
 * localStorage 영속 useState — `useState(() => loadJson(...) ?? fallback)` + `useEffect(saveJson)` 쌍이
 * 패널마다 9번 넘게 복제되던 것(수제 load/save 함수까지 만든 곳도 있었다)을 한 훅으로.
 * key 는 마운트 수명 동안 고정이라는 전제(패널 설정 키가 전부 그렇다) — 바뀌면 이전 키에 안 되돌려 쓴다.
 */
export function usePersistedState<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => loadJson(key, parse) ?? fallback);
    useEffect(() => saveJson(key, value), [key, value]);
    return [value, setValue];
}
