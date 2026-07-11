// localStorage JSON 영속 공용 — 각 슬라이스가 try/catch·파싱·검증을 제각기 재현하지 않게 한 벌로.
// localStorage 부재(테스트 환경)·파싱 실패·이전 포맷은 조용히 null/무시 — 전부 클라 설정이라 손실 무해(기본값 재생).
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
