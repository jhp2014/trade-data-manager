// /chart 조회 클라이언트 — wire 타입은 contracts/wire 에서 서버와 **단일 계약**으로 공유한다.
// (예전의 로컬 재정의 폐기 — 서버 응답 모양이 바뀌면 여기가 컴파일 에러로 잡힌다.)
import type { ChartBundle } from "@trade-data-manager/wire";

export type { ChartBundle } from "@trade-data-manager/wire";

export async function fetchChart(code: string, date: string): Promise<ChartBundle> {
    const qs = new URLSearchParams({ code, date });
    const res = await fetch(`/api/chart?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /chart ${res.status}: ${body}`);
    }
    return res.json() as Promise<ChartBundle>;
}
