// 가설 큐레이션 CRUD 클라이언트. wire 타입(Hypothesis·HypothesisLink·HypothesisRelation)은 contracts/wire 공유.
// 세 목록(가설·링크·관계)을 받아 패널이 인메모리로 조립·필터. 가설↔타점 연결은 자연키(code·date·time) = review point 삼중키.
import type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/wire";

export type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/wire";

export async function fetchHypotheses(): Promise<Hypothesis[]> {
    const res = await fetch("/api/hypotheses");
    if (!res.ok) throw new Error(`GET /hypotheses ${res.status}`);
    return res.json() as Promise<Hypothesis[]>;
}

export async function fetchHypothesisLinks(): Promise<HypothesisLink[]> {
    const res = await fetch("/api/hypotheses/links");
    if (!res.ok) throw new Error(`GET /hypotheses/links ${res.status}`);
    return res.json() as Promise<HypothesisLink[]>;
}

export async function createHypothesis(text: string): Promise<Hypothesis> {
    const res = await fetch("/api/hypotheses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`POST /hypotheses ${res.status}`);
    return res.json() as Promise<Hypothesis>;
}

export async function linkHypothesis(link: HypothesisLink): Promise<void> {
    const res = await fetch("/api/hypotheses/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hypothesisId: link.hypothesisId, stockCode: link.stockCode, date: link.date, time: link.time }),
    });
    if (!res.ok) throw new Error(`POST /hypotheses/links ${res.status}`);
}

export async function unlinkHypothesis(link: HypothesisLink): Promise<void> {
    const qs = new URLSearchParams({ hypothesisId: link.hypothesisId, code: link.stockCode, date: link.date, time: link.time });
    const res = await fetch(`/api/hypotheses/links?${qs}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /hypotheses/links ${res.status}`);
}

export async function deleteHypothesis(id: string): Promise<void> {
    const res = await fetch(`/api/hypotheses/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /hypotheses/${id} ${res.status}`);
}

export async function fetchHypothesisRelations(): Promise<HypothesisRelation[]> {
    const res = await fetch("/api/hypotheses/relations");
    if (!res.ok) throw new Error(`GET /hypotheses/relations ${res.status}`);
    return res.json() as Promise<HypothesisRelation[]>;
}

export async function addRelation(r: { fromId: string; toId: string; relationType: string; note?: string }): Promise<HypothesisRelation> {
    const res = await fetch("/api/hypotheses/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
    });
    if (!res.ok) throw new Error(`POST /hypotheses/relations ${res.status}`);
    return res.json() as Promise<HypothesisRelation>;
}

export async function removeRelation(id: string): Promise<void> {
    const res = await fetch(`/api/hypotheses/relations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /hypotheses/relations/${id} ${res.status}`);
}
