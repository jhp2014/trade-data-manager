// 조건검색식 조회·선택 — apps/live(/live 프록시 → :3002). 설정 모달(조건검색 화면)이 소비.
import type { LiveConditionsView } from "@trade-data-manager/wire";

export async function fetchLiveConditions(signal?: AbortSignal): Promise<LiveConditionsView> {
    const res = await fetch("/live/conditions", { signal });
    if (!res.ok) throw new Error(res.status === 503 ? "엔진 미연결(장외·서버 확인)" : `조건식 목록 ${res.status}`);
    return (await res.json()) as LiveConditionsView;
}

/** 조건 교체(빈 문자열=해제). 성공 시 서버가 영속 — 재기동에도 유지. */
export async function selectLiveCondition(name: string): Promise<void> {
    const res = await fetch("/live/condition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `조건 교체 ${res.status}`);
    }
}
