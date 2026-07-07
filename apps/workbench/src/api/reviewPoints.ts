// 복기 타점 CRUD 클라이언트. wire 타입(ReviewPoint·ReviewPointListItem·UpsertReviewPointInput)은 contracts/wire 공유.
// 자연키(code·date·time)라 삭제도 자연키로 지목. 의미(가설·태그)는 하류 hypothesis 가 caseId 로 붙인다.
import type { ReviewPoint, ReviewPointListItem, UpsertReviewPointInput } from "@trade-data-manager/wire";

export type { ReviewPoint, ReviewPointListItem, UpsertReviewPointInput } from "@trade-data-manager/wire";

export async function fetchReviewPoints(code: string, date: string): Promise<ReviewPoint[]> {
    const res = await fetch(`/api/review-points?${new URLSearchParams({ code, date })}`);
    if (!res.ok) throw new Error(`GET /review-points ${res.status}`);
    return res.json() as Promise<ReviewPoint[]>;
}

export async function upsertReviewPoint(point: UpsertReviewPointInput): Promise<ReviewPoint> {
    const res = await fetch("/api/review-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(point),
    });
    if (!res.ok) throw new Error(`POST /review-points ${res.status}`);
    return res.json() as Promise<ReviewPoint>;
}

export async function removeReviewPoint(code: string, date: string, time: string): Promise<void> {
    const res = await fetch(`/api/review-points?${new URLSearchParams({ code, date, time })}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /review-points ${res.status}`);
}

/** 전체 타점 + 종목명 — 월 그룹은 클라. 날짜 내림차순, 같은 날 시각 오름차순. */
export async function fetchAllPoints(): Promise<ReviewPointListItem[]> {
    const res = await fetch("/api/review-points/all");
    if (!res.ok) throw new Error(`GET /review-points/all ${res.status}`);
    return res.json() as Promise<ReviewPointListItem[]>;
}
