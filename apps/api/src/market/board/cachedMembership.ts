// 시트 멤버십 캐시 데코레이터 — 시트(sheet)는 date-무관이라 load() 를 프로세스 1회만 호출(시트 호출 dedup).
// ThemeMembershipProvider(outbound 포트)를 구조적으로 만족 → DayBoards 조립에 쓰인다(MEMBERSHIP_CACHE). 시트 편집 시 /theme/refresh 로 refresh().
import type { ThemeMember } from "@trade-data-manager/market";

export class CachedMembership {
    private once: Promise<ThemeMember[]> | null = null;

    constructor(private readonly inner: { load(): Promise<ThemeMember[]> }) {}

    load(): Promise<ThemeMember[]> {
        // 실패는 캐시하지 않는다 — 첫 로드가 (시트 오류 등) 실패하면 once 를 비워 다음 요청이 재시도하게.
        // (안 그러면 거부된 Promise 가 영구 캐시돼 이후 모든 요청이 같은 실패를 되돌린다.)
        return (this.once ??= this.inner.load().catch((err: unknown) => {
            this.once = null;
            throw err;
        }));
    }

    refresh(): void {
        this.once = null;
    }
}
