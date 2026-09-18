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

/**
 * 파싱 **전에** 원문을 한 번만 복사해 둔다 — 스키마를 넓히는 배포의 되돌림 경로.
 *
 * `parseStages` 는 모양이 안 맞으면 저장본을 통째로 버리므로, 술어 유니온을 넓힌 코드가 나간 뒤
 * 되돌릴 일이 생기면 **옛 코드가 새 종류를 못 읽어** 사용자의 조건이 그 순간 사라진다. 그때
 * 복구할 수 있는 것은 원문뿐이라, 새 코드가 처음 읽는 그 순간에 백업을 만든다.
 * 이미 있으면 건드리지 않는다(첫 로드의 상태가 보존돼야 뜻이 있다).
 */
export function backupRawOnce(key: string, tag: string): void {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return;
        const bak = `${key}.bak.${tag}`;
        if (localStorage.getItem(bak) !== null) return;
        localStorage.setItem(bak, raw);
    } catch {
        /* 백업 실패는 무해 — 원문은 그대로 있다 */
    }
}

/**
 * 그 키로 **저장한 적이 있나** — 값의 내용이 아니라 존재만 본다.
 * `loadJson` 은 "없음"과 "빈 배열"을 똑같이 `[]` 로 돌려주므로, 1회 이주처럼
 * **사용자가 비운 것과 아직 아무 일도 없던 것을 갈라야 하는 자리**가 이걸 쓴다.
 */
export function hasStored(key: string): boolean {
    try {
        return localStorage.getItem(key) !== null;
    } catch {
        return false;
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

/**
 * 저장된 객체에서 **기본값과 같은 타입인 필드만** 승계한다 — 어긋난 항목은 조용히 기본값.
 * 평평한 설정 객체(설정 모달이 편집하는 것들)의 파서가 필드마다 `typeof` 를 되풀이하던 걸 한 벌로.
 * ⚠ 유니온 문자열(`"krx" | "un"`)은 이걸로 못 거른다 — `typeof` 는 `string` 까지만 본다. 그런 필드는
 *   전용 파서를 쓸 것.
 */
export function mergeShape<T extends object>(raw: unknown, defaults: T): T | null {
    if (!raw || typeof raw !== "object") return null;
    const src = raw as Record<string, unknown>;
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T & string)[]) {
        const v = src[k];
        if (typeof v !== typeof defaults[k]) continue;
        if (typeof v === "number" && !Number.isFinite(v)) continue;
        (out as Record<string, unknown>)[k] = v;
    }
    return out;
}

/**
 * 영속 필드 한 벌 — **키 상수 + 로드 + 저장**을 한 자리에 묶는다.
 *
 * 슬라이스마다 `const X_KEY = "wb.x"` 를 두고 초기값에서 `loadJson`, setter 에서 `saveJson` 을 손으로
 * 부르던 패턴이 여덟 군데 복제돼 있었고, **setter 를 새로 만들면서 저장을 빼먹는 사고**가 실제로 났다
 * (설정 모달 3화면이 통째로 휘발하던 원인). `save` 가 값을 그대로 돌려주므로 setter 는
 * `return { x: FIELD.save(next) }` 한 줄이 되고, 저장을 건너뛰려면 일부러 안 써야 한다.
 *
 * `load` 가 함수인 건 **호출 시점에** 읽기 위해서다 — 필드 선언(모듈 로드)과 슬라이스 생성 사이에
 * 값이 굳지 않게. 슬라이스 생성자를 직접 불러 초기값을 검사할 수 있는 것도 이 덕이다(persist.dom.test).
 */
export interface PersistedField<T> {
    load: () => T;
    /** 저장하고 **그 값을 그대로** 돌려준다(setter 안에서 바로 쓰라고). */
    save: (v: T) => T;
}

export function persistedField<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): PersistedField<T> {
    return {
        load: () => loadJson(key, parse) ?? fallback,
        save: (v) => {
            saveJson(key, v);
            return v;
        },
    };
}
