// 시트 멤버십 캐시 데코레이터 — 시트(sheet)는 date-무관이라 load() 를 프로세스 1회만 호출(시트 호출 dedup).
// ThemeMembershipProvider(outbound 포트)를 구조적으로 만족 → MetaReadService 에 주입. 시트 편집 시 refresh().
import type { ThemeMember } from "@trade-data-manager/market";

export class CachedMembership {
    private once: Promise<ThemeMember[]> | null = null;

    constructor(private readonly inner: { load(): Promise<ThemeMember[]> }) {}

    load(): Promise<ThemeMember[]> {
        return (this.once ??= this.inner.load());
    }

    refresh(): void {
        this.once = null;
    }
}
