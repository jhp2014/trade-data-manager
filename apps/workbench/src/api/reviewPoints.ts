// 복기 타점 CRUD 클라이언트. 차트에서 스페이스바로 찍는 관찰 지점(자연키 = 종목·날짜·시각).
// 가격선과 달리 surrogate id 가 없어 삭제도 자연키(code·date·time)로 지목한다.
// 의미(가설·태그)는 하류 hypothesis 가 caseId 로 붙인다 — 여기선 가벼운 앵커만.

/** 저장/조회되는 복기 타점(wire). */
export interface ReviewPoint {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
    memo?: string;
}

export async function fetchReviewPoints(code: string, date: string): Promise<ReviewPoint[]> {
    const res = await fetch(`/api/review-points?${new URLSearchParams({ code, date })}`);
    if (!res.ok) throw new Error(`GET /review-points ${res.status}`);
    return res.json() as Promise<ReviewPoint[]>;
}

export interface UpsertReviewPointInput {
    stockCode: string;
    date: string;
    time: string;
    memo?: string;
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
